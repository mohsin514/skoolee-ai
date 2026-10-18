import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";

/**
 * SKO-435 purchasing on top of the existing inventory (items, stores, suppliers, movements).
 *
 * - A request shows the budget's available amount and what it would commit before submission.
 * - Approval follows the budget's limit (above it: principal or administrator) and is never by the
 *   requester. An approved order commits budget once; changing its lines, supplier or total
 *   withdraws the approval.
 * - Receipts are idempotent and partial: only the counted quantity is received, more than ordered
 *   is flagged, and each counted item line becomes one stock movement. Asset lines become one tagged
 *   asset per unit. Returning goods to the supplier reopens the remainder.
 * - Invoices are matched to what was received; price variance and duplicates go to review.
 */

const OPS = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"];
const SENIOR = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
const STAFF = [...OPS, "ACCOUNTANT", "LIBRARIAN", "TEACHER", "RECEPTIONIST"];
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
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
  const input = parse(z.object({ costCenter: text(2, 80), period: text(4, 20), amount: z.number().int().min(0), currency: z.string().regex(/^[A-Z]{3}$/u), approvalLimit: z.number().int().min(0) }).strict(), raw);
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
    if (!id) {
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

/** Approve (commits budget once) or return with a reason. Never by the requester. */
export async function decideRequest(user: AuthUser, id: string, raw: unknown) {
  const input = parse(z.object({ version: z.number().int().positive(), decision: z.enum(["APPROVE", "RETURN", "CANCEL"]), reason: text(5, 500).optional() }).strict(), raw);
  return prisma.$transaction(async (tx) => {
    const r = await tx.purchaseRequest.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!r) throw new ApiError("Request not found", 404);
    if (r.version !== input.version) throw new ApiError("The order changed since you opened it. Review the new amount.", 409);
    const budget = await tx.purchaseBudget.findUniqueOrThrow({ where: { id: r.budgetId } });
    if (input.decision === "CANCEL") {
      assert(OPS.includes(user.role) || r.requestedById === user.userId, "Only the requester or a school leader can cancel this order.");
      if (!input.reason) throw new ApiError("Give a reason for cancelling.", 400);
      if ((r.received as number[]).some((q) => q > 0)) throw new ApiError("Goods have already been received; return them before cancelling.", 409);
    } else {
      if (r.status !== "SUBMITTED") throw new ApiError("Only a submitted request can be decided.", 409);
      assert(OPS.includes(user.role), "Only assigned approvers can commit this budget.");
      assert(r.requestedById !== user.userId, "You raised this request, so another approver must decide it.");
      if (input.decision === "APPROVE") {
        assert(r.total <= budget.approvalLimit || SENIOR.includes(user.role), "This order is above the approval limit; a principal or administrator must approve it.");
        const pos = await budgetPosition(tx, r.budgetId);
        if (r.total > pos.available) throw new ApiError(`${r.total - pos.available} ${budget.currency} above available budget`, 409);
      } else if (!input.reason) throw new ApiError("Give a reason for returning the request.", 400);
    }
    const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "RETURN" ? "RETURNED" : "CANCELLED";
    const done = await tx.purchaseRequest.updateMany({ where: { id, version: input.version }, data: { status, version: { increment: 1 },
      ...(input.decision === "APPROVE" ? { approvedById: user.userId, approvedAt: new Date(), approvedHash: orderHash(r.lines as Line[], r.supplierId, r.total) } : {}),
      history: push(r.history, { by: user.userId, action: status, reason: input.reason ?? null }) } });
    if (!done.count) throw new ApiError("Another decision was saved first.", 409);
    return tx.purchaseRequest.findUnique({ where: { id } });
  });
}

/** Record a delivery. The same idempotency key returns the first receipt and changes nothing. */
export async function receiveGoods(user: AuthUser, id: string, raw: unknown) {
  assert(OPS.includes(user.role) || ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"].includes(user.role), "Only store or office staff record deliveries.");
  const input = parse(z.object({ idempotencyKey: key, deliveryNote: text(2, 120).optional(), lines: z.array(z.object({ line: z.number().int().min(0), quantity: z.number().int().min(1).max(100000), storeId: z.string().min(1).max(120).optional() }).strict()).min(1).max(50) }).strict(), raw);
  return prisma.$transaction(async (tx) => {
    const prior = await tx.goodsReceipt.findFirst({ where: { requestId: id, idempotencyKey: input.idempotencyKey } });
    if (prior) return { receipt: prior, replayed: true };
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
    if (await tx.itemTransaction.findFirst({ where: { schoolId: user.schoolId, idempotencyKey: input.idempotencyKey }, select: { id: true } })) return { replayed: true };
    const r = await tx.purchaseRequest.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!r) throw new ApiError("Request not found", 404);
    const lines = r.lines as Line[], received = [...(r.received as number[])];
    const line = lines[input.line];
    if (!line || (received[input.line] ?? 0) < input.quantity) throw new ApiError("You can only return what was received.", 409);
    if (line.itemId) {
      if (!input.storeId) throw new ApiError("Choose the store the goods leave from.", 400);
      const taken = await tx.itemStock.updateMany({ where: { itemId: line.itemId, storeId: input.storeId, quantity: { gte: input.quantity } }, data: { quantity: { decrement: input.quantity } } });
      if (!taken.count) throw new ApiError("Insufficient stock quantity", 409);
      await tx.itemTransaction.create({ data: { schoolId: user.schoolId, campusId: r.campusId, itemId: line.itemId, storeId: input.storeId, kind: "ISSUE", quantity: input.quantity, unitPrice: line.unitPrice, supplierId: r.supplierId, note: `${r.poNumber} returned to supplier: ${input.reason}`, idempotencyKey: input.idempotencyKey } });
    }
    received[input.line] -= input.quantity;
    const done = await tx.purchaseRequest.updateMany({ where: { id, version: r.version }, data: { received, status: "PARTIALLY_RECEIVED", version: { increment: 1 }, history: push(r.history, { by: user.userId, action: "RETURNED_TO_SUPPLIER", line: input.line, quantity: input.quantity, reason: input.reason }) } });
    if (!done.count) throw new ApiError("Another change was saved first.", 409);
    return { replayed: false, remaining: lines.map((l, i) => l.quantity - (received[i] ?? 0)) };
  });
}

/** Match an invoice to what was received. Variances and duplicates become review items. */
export async function recordInvoice(user: AuthUser, id: string, raw: unknown) {
  assert(OPS.includes(user.role) || user.role === "ACCOUNTANT", "Only the office or accounts records supplier invoices.");
  const input = parse(z.object({ invoiceNo: text(2, 60), amount: z.number().int().min(0) }).strict(), raw);
  const r = await prisma.purchaseRequest.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!r) throw new ApiError("Request not found", 404);
  const receivedValue = (r.lines as Line[]).reduce((s, l, i) => s + l.unitPrice * (((r.received as number[])[i]) ?? 0), 0);
  const issues: { code: string; detail: string }[] = [];
  const duplicate = await prisma.supplierInvoice.findFirst({ where: { schoolId: user.schoolId, invoiceNo: input.invoiceNo, supplierId: r.supplierId } });
  if (duplicate) issues.push({ code: "DUPLICATE", detail: `Invoice ${input.invoiceNo} was already recorded for this supplier.` });
  if (input.amount !== receivedValue) issues.push({ code: "PRICE_VARIANCE", detail: `Invoice ${input.amount} vs received value ${receivedValue}.` });
  if (receivedValue === 0) issues.push({ code: "NOTHING_RECEIVED", detail: "No goods have been received against this order yet." });
  return prisma.supplierInvoice.create({ data: { schoolId: user.schoolId, campusId: r.campusId, requestId: id, supplierId: r.supplierId, invoiceNo: input.invoiceNo, amount: input.amount, status: issues.length ? "REVIEW" : "MATCHED", issues, recordedById: user.userId } });
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
  const asset = await prisma.schoolAsset.findFirst({ where: { id: assetId, schoolId: user.schoolId, campusId: campusOf(user) } });
  if (!asset) throw new ApiError("Asset not found", 404);
  return prisma.schoolAsset.update({ where: { id: assetId }, data: { ...input, history: push(asset.history, { by: user.userId, action: "ASSIGNED", from: { custodian: asset.custodian, location: asset.location }, to: input }) } });
}

export async function scheduleService(user: AuthUser, assetId: string, raw: unknown) {
  assert(OPS.includes(user.role), "Only school leaders schedule maintenance.");
  const input = parse(z.object({ dueOn: day }).strict(), raw);
  const asset = await prisma.schoolAsset.findFirst({ where: { id: assetId, schoolId: user.schoolId, campusId: campusOf(user) } });
  if (!asset) throw new ApiError("Asset not found", 404);
  const due = new Date(`${input.dueOn}T00:00:00Z`);
  await prisma.schoolAsset.update({ where: { id: assetId }, data: { nextServiceOn: due } });
  return prisma.assetService.create({ data: { schoolId: user.schoolId, assetId, dueOn: due } });
}

/** Close a job with the work done and the next due date, or cancel it with a reason; history stays. */
export async function closeService(user: AuthUser, serviceId: string, raw: unknown) {
  assert(OPS.includes(user.role), "Only school leaders close maintenance jobs.");
  const input = parse(z.object({ action: z.enum(["COMPLETE", "CANCEL"]), work: text(5, 1000).optional(), nextDueOn: day.optional(), reason: text(5, 300).optional() }).strict(), raw);
  const job = await prisma.assetService.findFirst({ where: { id: serviceId, schoolId: user.schoolId, status: "SCHEDULED" } });
  if (!job) throw new ApiError("This job is not open.", 409);
  if (input.action === "COMPLETE") {
    if (!input.work || !input.nextDueOn) throw new ApiError("Record the work done and the next due date.", 400);
    const next = new Date(`${input.nextDueOn}T00:00:00Z`);
    await prisma.assetService.update({ where: { id: serviceId }, data: { status: "DONE", work: input.work, completedOn: new Date(), nextDueOn: next, completedById: user.userId } });
    await prisma.assetService.create({ data: { schoolId: user.schoolId, assetId: job.assetId, dueOn: next } });
    await prisma.schoolAsset.update({ where: { id: job.assetId }, data: { nextServiceOn: next } });
  } else {
    if (!input.reason) throw new ApiError("Give a reason for cancelling.", 400);
    await prisma.assetService.update({ where: { id: serviceId }, data: { status: "CANCELLED", cancelReason: input.reason } });
  }
  return prisma.assetService.findUnique({ where: { id: serviceId } });
}

export async function purchasingOverview(user: AuthUser) {
  assert(STAFF.includes(user.role), "Only school staff use purchasing.");
  const campusId = campusOf(user);
  const budgets = await prisma.purchaseBudget.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: [{ period: "desc" }, { costCenter: "asc" }] });
  const positions = await Promise.all(budgets.map((b) => budgetPosition(prisma, b.id)));
  const [requests, invoices, assets, services, stores, items, suppliers] = await Promise.all([
    prisma.purchaseRequest.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.supplierInvoice.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.schoolAsset.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { tag: "asc" }, take: 300 }),
    prisma.assetService.findMany({ where: { schoolId: user.schoolId, status: "SCHEDULED" }, orderBy: { dueOn: "asc" }, take: 200 }),
    prisma.itemStore.findMany({ where: { campusId }, select: { id: true, name: true } }),
    prisma.item.findMany({ where: { campusId }, select: { id: true, name: true }, take: 300 }),
    prisma.supplier.findMany({ where: { campusId }, select: { id: true, name: true } }),
  ]);
  return { userId: user.userId, canApprove: OPS.includes(user.role), budgets: positions.map((p) => ({ ...p.budget, committed: p.committed, spent: p.spent, available: p.available })), requests, invoices, assets, services, stores, items, suppliers };
}
