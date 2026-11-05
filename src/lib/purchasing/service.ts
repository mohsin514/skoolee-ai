import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { withoutAutoAudit } from "@/lib/db/audit-trail";
import type { AuthUser } from "@/lib/auth";
import { ApiError, soleChecker } from "@/lib/api/scope";
import { isCampusOperator } from "@/lib/auth/institution";
import { notifySelfApproval } from "@/lib/notifications/events";

/**
 * SKO-435 purchasing on top of the existing inventory (items, stores, suppliers, movements).
 *
 * - A request shows the budget's available amount and what it would commit before submission.
 * - Approval is a campus-operations decision (§2.5, §7.6): a campus admin on the request's campus, or the
 *   group admin as audited break-glass. Above the budget's limit only a senior administrator decides. The
 *   requester never decides their own request unless they are the campus's sole checker (SD3: no other
 *   active campus admin on that campus), in which case a typed reason is recorded, the history and audit
 *   row carry `selfApproved`, and the institution authority is notified. An approved order commits budget once; changing its lines, supplier or total
 *   withdraws the approval.
 * - Receipts are idempotent and partial: only the counted quantity is received, more than ordered
 *   is flagged, and each counted item line becomes one stock movement. Asset lines become one tagged
 *   asset per unit. Returning goods to the supplier reopens the remainder.
 * - Invoices are matched to what was received; price variance and duplicates go to review.
 */

// §7.6 [R-B4]: purchasing decisions are campus operations (PRINCIPAL removed); over the budget limit the
// senior seats are SA, ADMIN and CAMPUS_ADMIN. Any member of staff may still raise a request (API only, D20).
const OPS = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"];
const SENIOR = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"];
const STAFF = [...OPS, "PRINCIPAL", "ACCOUNTANT", "LIBRARIAN", "TEACHER", "RECEPTIONIST"];
/** Decides on the request's own campus: a campus operator pinned there, or SA break-glass. */
const decidesFor = (user: AuthUser, campusId: string) => user.role === "SUPER_ADMIN" || (isCampusOperator(user) && user.campusId === campusId);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
// SKAI-1348: money columns are 32-bit integers; larger values crash persistence instead of failing validation.
const INT32_MAX = 2_147_483_647;
const day = z.iso.date();
const key = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/u, "Invalid idempotency key");

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
function campusOf(user: AuthUser) { if (!user.campusId) throw new ApiError("Choose a campus first.", 400); return user.campusId; }
function assert(cond: boolean, message: string, status = 403): asserts cond { if (!cond) throw new ApiError(message, status); }
const push = (history: Prisma.JsonValue, entry: Record<string, unknown>) => [...(Array.isArray(history) ? history : []), { at: new Date().toISOString(), ...entry }] as Prisma.InputJsonValue;

type Line = { itemId?: string | null; description: string; quantity: number; unitPrice: number; asset?: boolean };
const LineInput = z.object({ itemId: z.string().min(1).max(120).nullable().optional(), description: text(2, 200), quantity: z.number().int().min(1).max(100000), unitPrice: z.number().int().min(0).max(100_000_000), asset: z.boolean().default(false) }).strict();
const orderHash = (lines: Line[], supplierId: string | null, total: number) => createHash("sha256").update(JSON.stringify({ lines: lines.map((l) => [l.itemId ?? null, l.description, l.quantity, l.unitPrice, !!l.asset]), supplierId, total })).digest("hex");
const totalOf = (lines: Line[]) => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

/** Committed = approved (and partly received) orders; spent = value received so far. */
export async function budgetPosition(db: TxClient, budgetId: string) {
  const budget = await db.purchaseBudget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ApiError("Budget not found", 404);
  const orders = await db.purchaseRequest.findMany({ where: { budgetId, status: { in: ["APPROVED", "PARTIALLY_RECEIVED", "RECEIVED"] } }, select: { total: true, lines: true, received: true } });
  const committed = orders.reduce((s, o) => s + o.total, 0);
  const spent = orders.reduce((s, o) => s + (o.lines as Line[]).reduce((t, l, i) => t + l.unitPrice * (((o.received as number[])[i]) ?? 0), 0), 0);
  return { budget, committed, spent, available: budget.amount - committed };
}

export async function createBudget(user: AuthUser, raw: unknown) {
  assert(OPS.includes(user.role), "Only school leaders set budgets.");
  const input = parse(z.object({ costCenter: text(2, 80), period: text(4, 20), amount: z.number().int().min(0).max(INT32_MAX), currency: z.string().regex(/^[A-Z]{3}$/u), approvalLimit: z.number().int().min(0).max(INT32_MAX) }).strict(), raw);
  return prisma.purchaseBudget.create({ data: { ...input, schoolId: user.schoolId, campusId: campusOf(user), createdById: user.userId } });
}

const RequestInput = z.object({ budgetId: text(1, 120), title: text(3, 200), supplierId: z.string().min(1).max(120).nullable().optional(), quoteRef: text(2, 120).nullable().optional(), lines: z.array(LineInput).min(1).max(50) }).strict();

/** Save a draft (new, or editing a draft/returned/approved request — approval is then withdrawn). */
export async function saveRequest(user: AuthUser, raw: unknown, id?: string, version?: number) {
  assert(STAFF.includes(user.role), "Only school staff raise purchase requests.");
  const input = parse(RequestInput, raw), campusId = campusOf(user);
  return prisma.$transaction(async (tx) => {
    const budget = await tx.purchaseBudget.findFirst({ where: { id: input.budgetId, schoolId: user.schoolId, campusId } });
    if (!budget) throw new ApiError("Budget not found", 404);
    if (input.supplierId && !(await tx.supplier.findFirst({ where: { id: input.supplierId, campusId }, select: { id: true } }))) throw new ApiError("Supplier not found", 404);
    for (const l of input.lines) if (l.itemId && !(await tx.item.findFirst({ where: { id: l.itemId, campusId }, select: { id: true } }))) throw new ApiError("Item not found", 404);
    const total = totalOf(input.lines);
    if (total > INT32_MAX) throw new ApiError("The order total is too large to record.", 400);
    if (!id) {
      // SKAI-1465: serialise PO numbering per campus so two drafts saved at once never share a number.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`purchase-po:${campusId}`}))`;
      const count = await tx.purchaseRequest.count({ where: { campusId } });
      return tx.purchaseRequest.create({ data: { schoolId: user.schoolId, campusId, budgetId: budget.id, poNumber: `PO-${String(count + 101)}`, title: input.title, supplierId: input.supplierId ?? null, quoteRef: input.quoteRef ?? null, lines: input.lines, received: input.lines.map(() => 0), total, requestedById: user.userId, history: [{ at: new Date().toISOString(), by: user.userId, action: "CREATED", total }] } });
    }
    const current = await tx.purchaseRequest.findFirst({ where: { id, schoolId: user.schoolId, campusId } });
    if (!current) throw new ApiError("Request not found", 404);
    if (current.version !== version) throw new ApiError("The order changed since you opened it. Review the new amount.", 409);
    if (!["DRAFT", "RETURNED", "SUBMITTED", "APPROVED"].includes(current.status)) throw new ApiError("Goods have already been received against this order; it can no longer be changed.", 409);
    const changed = current.approvedHash && current.approvedHash !== orderHash(input.lines, input.supplierId ?? null, total);
    const done = await tx.purchaseRequest.updateMany({ where: { id, version: current.version }, data: { title: input.title, supplierId: input.supplierId ?? null, quoteRef: input.quoteRef ?? null, lines: input.lines, received: input.lines.map(() => 0), total, version: { increment: 1 },
      ...(current.status === "APPROVED" ? { status: changed ? "SUBMITTED" : "APPROVED", ...(changed ? { approvedById: null, approvedAt: null, approvedHash: null } : {}) } : {}),
      history: push(current.history, { by: user.userId, action: changed ? "CHANGED_AFTER_APPROVAL" : "EDITED", total }) } });
    if (!done.count) throw new ApiError("The order changed since you opened it. Review the new amount.", 409);
    return tx.purchaseRequest.findUniqueOrThrow({ where: { id } });
  });
}

/** Submit for approval, showing the budget position this request would leave. */
export async function submitRequest(user: AuthUser, id: string, version: number) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.purchaseRequest.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!r) throw new ApiError("Request not found", 404);
    assert(r.requestedById === user.userId || OPS.includes(user.role), "Only the requester or a school leader can submit this request.");
    if (!["DRAFT", "RETURNED"].includes(r.status)) throw new ApiError("Only a draft or returned request can be submitted.", 409);
    const pos = await budgetPosition(tx, r.budgetId);
    const done = await tx.purchaseRequest.updateMany({ where: { id, version }, data: { status: "SUBMITTED", version: { increment: 1 }, history: push(r.history, { by: user.userId, action: "SUBMITTED", available: pos.available, projected: pos.available - r.total }) } });
    if (!done.count) throw new ApiError("The order changed since you opened it. Review the new amount.", 409);
    return { id, available: pos.available, projectedAfter: pos.available - r.total };
  });
}

/** Approve (commits budget once) or return with a reason. Never by the requester, except the SD3 sole checker with a reason. */
export async function decideRequest(user: AuthUser, id: string, raw: unknown) {
  const input = parse(z.object({ version: z.number().int().positive(), decision: z.enum(["APPROVE", "RETURN", "CANCEL"]), reason: text(5, 500).optional() }).strict(), raw);
  let selfApproved = false;
  let campusOfRequest: string | null = null;
  const decided = await prisma.$transaction(async (tx) => {
    const r = await tx.purchaseRequest.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!r) throw new ApiError("Request not found", 404);
    campusOfRequest = r.campusId;
    if (r.version !== input.version) throw new ApiError("The order changed since you opened it. Review the new amount.", 409);
    const budget = await tx.purchaseBudget.findUniqueOrThrow({ where: { id: r.budgetId } });
    if (input.decision === "CANCEL") {
      assert(OPS.includes(user.role) || r.requestedById === user.userId, "Only the requester or a school leader can cancel this order.");
      if (!input.reason) throw new ApiError("Give a reason for cancelling.", 400);
      if ((r.received as number[]).some((q) => q > 0)) throw new ApiError("Goods have already been received; return them before cancelling.", 409);
    } else {
      if (r.status !== "SUBMITTED") throw new ApiError("Only a submitted request can be decided.", 409);
      assert(decidesFor(user, r.campusId), "Purchase requests are decided by your campus admin.");
      if (r.requestedById === user.userId) {
        // SD3 (§2.5): a maker may decide their own request only when no other active campus admin holds
        // the checker seat on this campus, and only with a typed reason.
        const sole = await soleChecker("purchase", user, r.campusId);
        assert(sole, "You raised this request, so another approver must decide it.");
        if (!input.reason || input.reason.trim().length < 10) throw new ApiError("You are the only approver on this campus. Give a reason of at least 10 characters to decide your own request.", 400);
        selfApproved = true;
      }
      if (input.decision === "APPROVE") {
        assert(r.total <= budget.approvalLimit || SENIOR.includes(user.role), "This order is above the approval limit; a senior administrator must approve it.");
        const pos = await budgetPosition(tx, r.budgetId);
        if (r.total > pos.available) throw new ApiError(`${r.total - pos.available} ${budget.currency} above available budget`, 409);
      } else if (!input.reason) throw new ApiError("Give a reason for returning the request.", 400);
    }
    const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "RETURN" ? "RETURNED" : "CANCELLED";
    // SKAI-1773: a self-decision writes its own audit row below (reason, selfApproved), so the automatic row for
    // this update is skipped and the decision is logged once. Other decisions keep the automatic row.
    const update = () => tx.purchaseRequest.updateMany({ where: { id, version: input.version }, data: { status, version: { increment: 1 },
      ...(input.decision === "APPROVE" ? { approvedById: user.userId, approvedAt: new Date(), approvedHash: orderHash(r.lines as Line[], r.supplierId, r.total) } : {}),
      history: push(r.history, { by: user.userId, action: status, reason: input.reason ?? null, ...(selfApproved ? { selfApproved: true } : {}) }) } });
    const done = await (selfApproved ? withoutAutoAudit(update) : update());
    if (!done.count) throw new ApiError("Another decision was saved first.", 409);
    if (selfApproved) {
      await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: r.campusId, tableName: "purchase_requests", recordId: id, userId: user.userId, oldValue: { status: r.status }, newValue: { status, selfApproved: true, reason: input.reason ?? null } } });
    }
    return tx.purchaseRequest.findUnique({ where: { id } });
  });
  // Fire-and-forget after commit (§10.8): the institution authority sees every sole-checker decision.
  if (selfApproved && input.reason) {
    void notifySelfApproval({ schoolId: user.schoolId, campusId: campusOfRequest, kind: "purchase", recordId: id, actorId: user.userId, reason: input.reason }).catch((error: unknown) => console.error("[purchasing] self-approval notice failed", error));
  }
  return decided;
}

/** Record a delivery. The same idempotency key returns the first receipt and changes nothing. */
/**
 * Whether a stored receipt was made from the same request. Each line's delivered
 * quantity is what was accepted plus any excess that was recorded as a discrepancy.
 */
function sameDelivery(prior: { deliveryNote: string | null; lines: unknown; discrepancies: unknown }, input: { deliveryNote?: string; lines: { line: number; quantity: number; storeId?: string }[] }) {
  if ((prior.deliveryNote ?? null) !== (input.deliveryNote ?? null)) return false;
  const accepted = prior.lines as { line: number; quantity: number; storeId?: string }[];
  const excess = prior.discrepancies as { line: number; excess: number }[];
  const delivered = new Map<number, number>();
  const stores = new Map<number, string | undefined>();
  for (const a of accepted) {
    delivered.set(a.line, (delivered.get(a.line) ?? 0) + a.quantity);
    stores.set(a.line, a.storeId);
  }
  for (const d of excess) delivered.set(d.line, (delivered.get(d.line) ?? 0) + d.excess);
  if (delivered.size !== input.lines.length) return false;
  return input.lines.every((l) => delivered.get(l.line) === l.quantity && (!stores.has(l.line) || stores.get(l.line) === l.storeId));
}

export async function receiveGoods(user: AuthUser, id: string, raw: unknown) {
  assert(OPS.includes(user.role) || ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"].includes(user.role), "Only store or office staff record deliveries.");
  const input = parse(z.object({ idempotencyKey: key, deliveryNote: text(2, 120).optional(), lines: z.array(z.object({ line: z.number().int().min(0), quantity: z.number().int().min(1).max(100000), storeId: z.string().min(1).max(120).optional() }).strict()).min(1).max(50) }).strict(), raw);
  return prisma.$transaction(async (tx) => {
    const prior = await tx.goodsReceipt.findFirst({ where: { requestId: id, idempotencyKey: input.idempotencyKey } });
    // SKAI-1330: a reused key replays only the same delivery; a different one must not be reported as accepted.
    if (prior) {
      if (!sameDelivery(prior, input)) throw new ApiError("This idempotency key was already used for a different delivery.", 409);
      return { receipt: prior, replayed: true };
    }
    const r = await tx.purchaseRequest.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!r) throw new ApiError("Request not found", 404);
    if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(r.status)) throw new ApiError("Approve the order, then record delivery.", 409);
    const lines = r.lines as Line[], received = [...(r.received as number[])];
    const discrepancies: { line: number; ordered: number; alreadyReceived: number; delivered: number; excess: number }[] = [];
    const accepted: { line: number; quantity: number; storeId?: string }[] = [];
    for (const d of input.lines) {
      const line = lines[d.line];
      if (!line) throw new ApiError("That line is not on this order.", 400);
      const remaining = line.quantity - (received[d.line] ?? 0);
      const take = Math.min(d.quantity, Math.max(0, remaining));
      if (d.quantity > remaining) discrepancies.push({ line: d.line, ordered: line.quantity, alreadyReceived: received[d.line] ?? 0, delivered: d.quantity, excess: d.quantity - remaining });
      if (take <= 0) continue;
      if (line.itemId && !d.storeId) throw new ApiError("Choose the store that received the stock.", 400);
      received[d.line] = (received[d.line] ?? 0) + take;
      accepted.push({ line: d.line, quantity: take, storeId: d.storeId });
    }
    const allIn = lines.every((l, i) => (received[i] ?? 0) >= l.quantity);
    const moved = await tx.purchaseRequest.updateMany({ where: { id, version: r.version }, data: { received, status: allIn ? "RECEIVED" : "PARTIALLY_RECEIVED", version: { increment: 1 }, history: push(r.history, { by: user.userId, action: "RECEIVED", lines: accepted, discrepancies }) } });
    if (!moved.count) throw new ApiError("Another delivery was recorded at the same time. Reload and count again.", 409);
    const receipt = await tx.goodsReceipt.create({ data: { schoolId: user.schoolId, campusId: r.campusId, requestId: id, idempotencyKey: input.idempotencyKey, deliveryNote: input.deliveryNote ?? null, lines: accepted, discrepancies, receivedById: user.userId } });
    for (const a of accepted) {
      const line = lines[a.line];
      if (line.itemId && a.storeId) {
        await tx.itemStock.upsert({ where: { itemId_storeId: { itemId: line.itemId, storeId: a.storeId } }, update: { quantity: { increment: a.quantity } }, create: { schoolId: user.schoolId, itemId: line.itemId, storeId: a.storeId, quantity: a.quantity } });
        await tx.itemTransaction.create({ data: { schoolId: user.schoolId, campusId: r.campusId, itemId: line.itemId, storeId: a.storeId, kind: "RECEIVE", quantity: a.quantity, unitPrice: line.unitPrice, supplierId: r.supplierId, note: `${r.poNumber} receipt`, idempotencyKey: `${receipt.id}-${a.line}` } });
      }
      if (line.asset) {
        const base = await tx.schoolAsset.count({ where: { requestId: id, description: line.description } });
        for (let n = 1; n <= a.quantity; n++) {
          await tx.schoolAsset.create({ data: { schoolId: user.schoolId, campusId: r.campusId, tag: `${r.poNumber}-L${a.line + 1}-${String(base + n).padStart(3, "0")}`, description: line.description, requestId: id, receiptId: receipt.id, history: [{ at: new Date().toISOString(), action: "RECEIVED", by: user.userId }] } });
        }
      }
    }
    return { receipt, replayed: false, remaining: lines.map((l, i) => l.quantity - (received[i] ?? 0)) };
  });
}

/** Send counted goods back to the supplier; the stock goes down once and the remainder reopens. */
export async function returnToSupplier(user: AuthUser, id: string, raw: unknown) {
  assert(OPS.includes(user.role) || ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"].includes(user.role), "Only store or office staff record returns.");
  const input = parse(z.object({ line: z.number().int().min(0), quantity: z.number().int().min(1), storeId: z.string().min(1).max(120).optional(), reason: text(5, 300), idempotencyKey: key }).strict(), raw);
  return prisma.$transaction(async (tx) => {
    const r = await tx.purchaseRequest.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!r) throw new ApiError("Request not found", 404);
    // The return is recorded in the request's own history, so replay detection works for service lines too.
    const prior = (r.history as Array<{ action?: string; idempotencyKey?: string; line?: number; quantity?: number }>).find(h => h.action === "RETURNED_TO_SUPPLIER" && h.idempotencyKey === input.idempotencyKey);
    if (prior) {
      if (prior.line !== input.line || prior.quantity !== input.quantity) throw new ApiError("This idempotency key was used for a different return.", 409);
      return { replayed: true, remaining: (r.lines as Line[]).map((l, i) => l.quantity - ((r.received as number[])[i] ?? 0)) };
    }
    const lines = r.lines as Line[], received = [...(r.received as number[])];
    const line = lines[input.line];
    if (!line || (received[input.line] ?? 0) < input.quantity) throw new ApiError("You can only return what was received.", 409);
    if (line.itemId) {
      if (!input.storeId) throw new ApiError("Choose the store the goods leave from.", 400);
      const taken = await tx.itemStock.updateMany({ where: { itemId: line.itemId, storeId: input.storeId, quantity: { gte: input.quantity } }, data: { quantity: { decrement: input.quantity } } });
      if (!taken.count) throw new ApiError("Insufficient stock quantity", 409);
      await tx.itemTransaction.create({ data: { schoolId: user.schoolId, campusId: r.campusId, itemId: line.itemId, storeId: input.storeId, kind: "ISSUE", quantity: input.quantity, unitPrice: line.unitPrice, supplierId: r.supplierId, note: `${r.poNumber} returned to supplier: ${input.reason}`, idempotencyKey: input.idempotencyKey } });
    }
    // SKAI-1674: returned asset-tracked units leave the active register (newest tags first) with a return entry,
    // so a later replacement receipt adds exactly the units that are physically at school.
    if (line.asset) {
      const active = await tx.schoolAsset.findMany({ where: { schoolId: user.schoolId, requestId: id, status: "ACTIVE", tag: { startsWith: `${r.poNumber}-L${input.line + 1}-` } }, orderBy: { tag: "desc" }, take: input.quantity });
      if (active.length < input.quantity) throw new ApiError("Some returned units are no longer active in the asset register. Update those assets first.", 409);
      for (const asset of active) await tx.schoolAsset.update({ where: { id: asset.id }, data: { status: "RETURNED", nextServiceOn: null, history: push(asset.history, { action: "RETURNED_TO_SUPPLIER", by: user.userId, reason: input.reason }) } });
      // SKAI-1693: a returned unit has no future maintenance. Its open jobs are cancelled (kept for audit), not deleted.
      if (active.length) await tx.assetService.updateMany({ where: { schoolId: user.schoolId, assetId: { in: active.map(a => a.id) }, status: "SCHEDULED" }, data: { status: "CANCELLED", cancelReason: `Asset returned to supplier: ${input.reason}` } });
    }
    received[input.line] -= input.quantity;
    const done = await tx.purchaseRequest.updateMany({ where: { id, version: r.version }, data: { received, status: "PARTIALLY_RECEIVED", version: { increment: 1 }, history: push(r.history, { by: user.userId, action: "RETURNED_TO_SUPPLIER", line: input.line, quantity: input.quantity, reason: input.reason, idempotencyKey: input.idempotencyKey }) } });
    if (!done.count) throw new ApiError("Another change was saved first.", 409);
    return { replayed: false, remaining: lines.map((l, i) => l.quantity - (received[i] ?? 0)) };
  });
}

/** Match an invoice to what was received. Variances and duplicates become review items. */
export async function recordInvoice(user: AuthUser, id: string, raw: unknown) {
  assert(OPS.includes(user.role) || user.role === "ACCOUNTANT", "Only the office or accounts records supplier invoices.");
  const input = parse(z.object({ invoiceNo: text(2, 60), amount: z.number().int().min(0) }).strict(), raw);
  // SKAI-1461: one canonical number per supplier; a per-supplier lock makes the duplicate check and insert atomic,
  // so a concurrent identical invoice waits, then sees the first and becomes a DUPLICATE review item.
  const invoiceNo = input.invoiceNo.trim().replace(/\s+/g, " ");
  return prisma.$transaction(async (tx) => {
    const r = await tx.purchaseRequest.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!r) throw new ApiError("Request not found", 404);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`supplier-invoice:${user.schoolId}:${r.supplierId ?? "none"}:${invoiceNo.toLowerCase()}`}))`;
    const receivedValue = (r.lines as Line[]).reduce((s, l, i) => s + l.unitPrice * (((r.received as number[])[i]) ?? 0), 0);
    const issues: { code: string; detail: string }[] = [];
    const duplicate = await tx.supplierInvoice.findFirst({ where: { schoolId: user.schoolId, supplierId: r.supplierId, invoiceNo: { equals: invoiceNo, mode: "insensitive" } } });
    if (duplicate) issues.push({ code: "DUPLICATE", detail: `Invoice ${invoiceNo} was already recorded for this supplier.` });
    if (input.amount !== receivedValue) issues.push({ code: "PRICE_VARIANCE", detail: `Invoice ${input.amount} vs received value ${receivedValue}.` });
    if (receivedValue === 0) issues.push({ code: "NOTHING_RECEIVED", detail: "No goods have been received against this order yet." });
    return tx.supplierInvoice.create({ data: { schoolId: user.schoolId, campusId: r.campusId, requestId: id, supplierId: r.supplierId, invoiceNo, amount: input.amount, status: issues.length ? "REVIEW" : "MATCHED", issues, recordedById: user.userId } });
  });
}

export async function resolveInvoice(user: AuthUser, invoiceId: string, raw: unknown) {
  assert(OPS.includes(user.role), "Only a school leader resolves invoice reviews.");
  const input = parse(z.object({ resolution: text(5, 500), decision: z.enum(["ACCEPT", "REJECT"]) }).strict(), raw);
  const done = await prisma.supplierInvoice.updateMany({ where: { id: invoiceId, schoolId: user.schoolId, status: "REVIEW" }, data: { status: input.decision === "ACCEPT" ? "ACCEPTED_WITH_VARIANCE" : "REJECTED", resolution: input.resolution, resolvedById: user.userId } });
  if (!done.count) throw new ApiError("This invoice is not waiting for review.", 409);
  return { id: invoiceId };
}

/** Assign an asset's custodian and location; every change is kept in its history. */
export async function assignAsset(user: AuthUser, assetId: string, raw: unknown) {
  assert(OPS.includes(user.role), "Only school leaders reassign assets.");
  const input = parse(z.object({ custodian: text(2, 120).optional(), location: text(2, 120).optional() }).strict(), raw);
  const campusId = campusOf(user);
  // SKAI-1753: lock the asset row and re-read its history inside the transaction, so overlapping assignments
  // serialise and each appends to the latest history instead of overwriting it from a stale snapshot.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM school_assets WHERE id = ${assetId} AND school_id = ${user.schoolId} AND campus_id = ${campusId} FOR UPDATE`;
    const asset = await tx.schoolAsset.findFirst({ where: { id: assetId, schoolId: user.schoolId, campusId } });
    if (!asset) throw new ApiError("Asset not found", 404);
    return tx.schoolAsset.update({ where: { id: assetId }, data: { ...input, history: push(asset.history, { by: user.userId, action: "ASSIGNED", from: { custodian: asset.custodian, location: asset.location }, to: input }) } });
  });
}

export async function scheduleService(user: AuthUser, assetId: string, raw: unknown) {
  assert(OPS.includes(user.role), "Only school leaders schedule maintenance.");
  const input = parse(z.object({ dueOn: day }).strict(), raw);
  const asset = await prisma.schoolAsset.findFirst({ where: { id: assetId, schoolId: user.schoolId, campusId: campusOf(user) } });
  if (!asset) throw new ApiError("Asset not found", 404);
  if (asset.status !== "ACTIVE") throw new ApiError("Only an active asset can be scheduled for maintenance.", 409);
  const due = new Date(`${input.dueOn}T00:00:00Z`);
  await prisma.schoolAsset.update({ where: { id: assetId }, data: { nextServiceOn: due } });
  return prisma.assetService.create({ data: { schoolId: user.schoolId, assetId, dueOn: due } });
}

/** Close a job with the work done and the next due date, or cancel it with a reason; history stays. */
export async function closeService(user: AuthUser, serviceId: string, raw: unknown) {
  assert(OPS.includes(user.role), "Only school leaders close maintenance jobs.");
  const input = parse(z.object({ action: z.enum(["COMPLETE", "CANCEL"]), work: text(5, 1000).optional(), nextDueOn: day.optional(), reason: text(5, 300).optional() }).strict(), raw);
  const job = await prisma.assetService.findFirst({ where: { id: serviceId, schoolId: user.schoolId, status: "SCHEDULED" } });
  // SKAI-1395: a job on another campus's asset is not disclosed, and nothing is written for it.
  const asset = job ? await prisma.schoolAsset.findFirst({ where: { id: job.assetId, schoolId: user.schoolId, campusId: campusOf(user) }, select: { id: true, status: true } }) : null;
  if (!job || !asset) throw new ApiError("This job is not open.", 409);
  if (input.action === "COMPLETE") {
    // SKAI-1693: a returned or retired asset gets no next job; a stale job on it can only be cancelled.
    if (asset.status !== "ACTIVE") throw new ApiError("This asset is no longer active. Cancel the job instead.", 409);
    if (!input.work || !input.nextDueOn) throw new ApiError("Record the work done and the next due date.", 400);
    const next = new Date(`${input.nextDueOn}T00:00:00Z`);
    // All three writes commit together, so a failed close cannot leave the job DONE with no next job.
    await prisma.$transaction(async (tx) => {
      // SKAI-1463: the job is closed only if it is still SCHEDULED. A concurrent completion waits on the row, then
      // matches nothing and rolls back, so exactly one next job is created per completed job.
      const closed = await tx.assetService.updateMany({ where: { id: serviceId, schoolId: user.schoolId, status: "SCHEDULED" }, data: { status: "DONE", work: input.work, completedOn: new Date(), nextDueOn: next, completedById: user.userId } });
      if (closed.count !== 1) throw new ApiError("This job was already completed. Reload the maintenance list.", 409);
      await tx.assetService.create({ data: { schoolId: user.schoolId, assetId: job.assetId, dueOn: next } });
      await tx.schoolAsset.update({ where: { id: job.assetId }, data: { nextServiceOn: next } });
    });
  } else {
    if (!input.reason) throw new ApiError("Give a reason for cancelling.", 400);
    const cancelled = await prisma.assetService.updateMany({ where: { id: serviceId, schoolId: user.schoolId, status: "SCHEDULED" }, data: { status: "CANCELLED", cancelReason: input.reason } });
    if (cancelled.count !== 1) throw new ApiError("This job is no longer open. Reload the maintenance list.", 409);
  }
  return prisma.assetService.findUnique({ where: { id: serviceId } });
}

/** SKAI-1779: open requests are always listed in full (counts and filters read them); closed history pages by keyset. */
const CLOSED_REQUEST = ["RECEIVED", "REJECTED", "CANCELLED"];
export const CLOSED_REQUEST_PAGE = 100;
export function closedRequestWhere(cursor: string | null | undefined) {
  if (!cursor) return {};
  const [at, id] = Buffer.from(cursor.slice(0, 200), "base64url").toString("utf8").split("|");
  const when = new Date(at ?? "");
  if (!id || Number.isNaN(when.getTime())) throw new ApiError("This list has changed. Reload it.", 400);
  return { OR: [{ createdAt: { lt: when } }, { createdAt: when, id: { lt: id } }] };
}
export function closedRequestCursor(rows: { id: string; createdAt: Date }[]) {
  if (rows.length <= CLOSED_REQUEST_PAGE) return null;
  const last = rows[CLOSED_REQUEST_PAGE - 1];
  return Buffer.from(`${last.createdAt.toISOString()}|${last.id}`, "utf8").toString("base64url");
}
const requestOrder = [{ createdAt: "desc" as const }, { id: "desc" as const }];
const selfApprovedIn = (history: Prisma.JsonValue) => Array.isArray(history) && history.some((entry) => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry) && (entry as { selfApproved?: unknown }).selfApproved === true);

/** The next page of this campus's closed purchase requests (received, rejected, cancelled). */
export async function closedRequests(user: AuthUser, cursor: string | null) {
  assert(STAFF.includes(user.role), "Only school staff use purchasing.");
  const campusId = campusOf(user);
  const rows = await prisma.purchaseRequest.findMany({ where: { schoolId: user.schoolId, campusId, status: { in: CLOSED_REQUEST }, ...closedRequestWhere(cursor) }, orderBy: requestOrder, take: CLOSED_REQUEST_PAGE + 1 });
  return { requests: rows.slice(0, CLOSED_REQUEST_PAGE).map((r) => ({ ...r, selfApproved: selfApprovedIn(r.history) })), requestsCursor: closedRequestCursor(rows) };
}

export async function purchasingOverview(user: AuthUser) {
  assert(STAFF.includes(user.role), "Only school staff use purchasing.");
  const campusId = campusOf(user);
  const budgets = await prisma.purchaseBudget.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: [{ period: "desc" }, { costCenter: "asc" }] });
  const positions = await Promise.all(budgets.map((b) => budgetPosition(prisma, b.id)));
  // SKAI-1395: maintenance jobs are campus-scoped through their asset (AssetService has no campus column).
  const campusAssets = await prisma.schoolAsset.findMany({ where: { schoolId: user.schoolId, campusId }, select: { id: true, status: true } });
  const activeAssetIds = campusAssets.filter((asset) => asset.status === "ACTIVE").map((asset) => asset.id);
  const [requests, invoices, assets, services, stores, items, suppliers] = await Promise.all([
    Promise.all([
      prisma.purchaseRequest.findMany({ where: { schoolId: user.schoolId, campusId, status: { notIn: CLOSED_REQUEST } }, orderBy: requestOrder }),
      prisma.purchaseRequest.findMany({ where: { schoolId: user.schoolId, campusId, status: { in: CLOSED_REQUEST } }, orderBy: requestOrder, take: CLOSED_REQUEST_PAGE + 1 }),
    ]),
    prisma.supplierInvoice.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.schoolAsset.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { tag: "asc" }, take: 300 }),
    prisma.assetService.findMany({ where: { schoolId: user.schoolId, status: "SCHEDULED", assetId: { in: activeAssetIds } }, orderBy: { dueOn: "asc" }, take: 200 }),
    prisma.itemStore.findMany({ where: { campusId }, select: { id: true, name: true } }),
    prisma.item.findMany({ where: { campusId }, select: { id: true, name: true }, take: 300 }),
    prisma.supplier.findMany({ where: { campusId }, select: { id: true, name: true } }),
  ]);
  // SD3 (§2.5): whether this operator is the campus's only checker (it may then decide its own request with a reason),
  // and which decisions were such self-approvals (recorded in each request's history by decideRequest).
  const sole = await soleChecker("purchase", user, campusId);
  const [openRequests, closed] = requests;
  const requestsCursor = closedRequestCursor(closed);
  return { userId: user.userId, canApprove: OPS.includes(user.role), soleChecker: sole, budgets: positions.map((p) => ({ ...p.budget, committed: p.committed, spent: p.spent, available: p.available })), requests: [...openRequests, ...closed.slice(0, CLOSED_REQUEST_PAGE)].map((r) => ({ ...r, selfApproved: selfApprovedIn(r.history) })), requestsCursor, invoices, assets, services, stores, items, suppliers };
}
