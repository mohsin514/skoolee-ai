import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, resolveCampusId } from "@/lib/api/scope";
import { recordPayment } from "@/lib/fees/payment";
import { DELIVERY_POLICY_KIND, resolveDeliveryPolicy } from "@/lib/school-ai/delivery-policy";

/**
 * Collecting a fee payment on the Collect desk (POST /api/fees/collect), shared by the route and the AI
 * Workflows hand-off `fees.collect_payment`. One transaction creates the payment, updates the invoice balance
 * and carries any overpayment into credit. The route keeps its guards (staff role, fees.add) and its responses;
 * this command adds the hand-off rules of red team RT6:
 * - a payment posted from an AI-prepared hand-off carries that hand-off's id, written on the payment, and the
 *   unique (school, hand-off) index lets it post exactly once, from any device or retry;
 * - while a prepared collection for the invoice is OPEN or CLAIMED, a payment that does not carry it is
 *   refused (409), so a payment typed by hand and the prepared one cannot both post;
 * - the id must be an open collection prepared for this invoice and claimed by the person posting; anything
 *   else (a forged id, another invoice's hand-off, someone else's claim) is refused with 409.
 */

export const COLLECT_CAPABILITY = "fees.collect_payment";
export const COLLECT_METHODS = ["CASH", "BANK", "CHEQUE", "SAFEPAY", "MOBILE_WALLET"] as const;
export type CollectMethod = typeof COLLECT_METHODS[number];

const conflict = (message: string, code: string) => new ApiError(message, 409, code);

// SKAI-1305: stored money is Int32 minor units, so an amount must be a whole number inside that range.
// Rounding it first would silently post a different amount than the one requested.
const MAX_MINOR_UNITS = 2147483647;
function minorUnits(value: unknown, field: string, fallback?: number) {
  const raw = value === undefined || value === null ? fallback : value;
  const amount = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (raw === "" || !Number.isSafeInteger(amount) || amount < 0 || amount > MAX_MINOR_UNITS) {
    throw new ApiError(`${field} must be a whole number of paisa between 0 and ${MAX_MINOR_UNITS}`, 400);
  }
  return amount;
}

// SKAI-1307: strict YYYY-MM-DD calendar day. 2026-02-30 must not roll over into another accounting day.
function calendarDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

/**
 * Whether the school's approved Delivery Policy for this campus requires a second person (separationOfDuties
 * REQUIRED). The platform default is NOT_REQUIRED. Used by the hand-off (to target someone other than the
 * requester) and here (so the requester cannot post the hand-off they asked for).
 */
export async function moneySeparationRequired(user: Pick<AuthUser, "schoolId">, campusId: string | null) {
  const approved = await prisma.schoolAiRevision.findFirst({
    where: { schoolId: user.schoolId, campusId, status: "APPROVED", record: { schoolId: user.schoolId, kind: DELIVERY_POLICY_KIND } },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    select: { recordId: true, version: true, data: true },
  });
  return resolveDeliveryPolicy(approved ? { recordId: approved.recordId, version: approved.version, data: approved.data } : null).policy.separationOfDuties === "REQUIRED";
}

/**
 * AI-prepared collections still waiting on this invoice: OPEN or CLAIMED, not expired, made by the
 * `fees.collect_payment` capability, and not already posted (a payment already carries the hand-off).
 */
export async function openPreparedCollections(schoolId: string, invoiceId: string, now = new Date()) {
  const handoffs = await prisma.aiWorkflowHandoff.findMany({
    where: { schoolId, kind: "DOMAIN_SCREEN", status: { in: ["OPEN", "CLAIMED"] }, expiresAt: { gt: now }, prefill: { path: ["invoiceId"], equals: invoiceId } },
    select: { id: true, stepId: true, campusId: true, status: true, targetRoles: true, originUserId: true, claimedById: true, claimExpiresAt: true },
  });
  if (!handoffs.length) return [];
  const [steps, posted] = await Promise.all([
    prisma.aiWorkflowStep.findMany({ where: { schoolId, id: { in: handoffs.map(row => row.stepId) }, capabilityKey: COLLECT_CAPABILITY }, select: { id: true } }),
    prisma.payment.findMany({ where: { schoolId, workflowHandoffId: { in: handoffs.map(row => row.id) } }, select: { workflowHandoffId: true } }),
  ]);
  const collect = new Set(steps.map(step => step.id)), done = new Set(posted.map(row => row.workflowHandoffId));
  return handoffs.filter(row => collect.has(row.stepId) && !done.has(row.id));
}

/** The prepared collection this request may post, or a 409 saying why it may not. */
async function bindHandoff(user: AuthUser, invoiceId: string, campusId: string, handoffId: string | null) {
  const prepared = await openPreparedCollections(user.schoolId, invoiceId);
  if (!handoffId) {
    if (prepared.length) throw conflict("A prepared collection exists for this invoice. Open it from AI Workflows to record this payment, so it is posted only once.", "PREPARED_COLLECTION_OPEN");
    return null;
  }
  const handoff = prepared.find(row => row.id === handoffId);
  if (!handoff || handoff.campusId !== campusId || !handoff.targetRoles.includes(user.role)) throw conflict("This prepared collection is not open for this invoice. Open it again from AI Workflows.", "HANDOFF_NOT_OPEN");
  if (handoff.claimedById !== user.userId) {
    const leased = handoff.claimedById && handoff.claimExpiresAt && handoff.claimExpiresAt > new Date();
    throw leased
      ? conflict("Another person is handling this prepared collection.", "HANDOFF_LEASED")
      : conflict("Claim this prepared collection from AI Workflows before recording it.", "HANDOFF_NOT_CLAIMED");
  }
  if (handoff.originUserId === user.userId && await moneySeparationRequired(user, campusId)) {
    throw conflict("School policy requires another authorised person to record a collection you asked for.", "HANDOFF_SEPARATION");
  }
  return handoff.id;
}

type CollectInvoice = { id: string; invoiceNumber: string | null; currency: string; studentId: string; student: { id: string; fullName: string; campusId: string } };
type CollectPayment = { id: string; fineAmount: number; discountAmount: number; receiptNo: string | null; note: string | null; amount: number };
export interface CollectOutcome { invoice: CollectInvoice; payment: CollectPayment; credit: number; replayed: boolean; campusId: string; amount: number }

/** The route's `data` object (unchanged since SKO-475). */
export function collectReceipt({ invoice, payment, credit, replayed }: CollectOutcome) {
  return {
    id: payment.id, paymentId: payment.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, currency: invoice.currency,
    studentId: invoice.studentId, studentName: invoice.student.fullName, amount: payment.amount,
    fineAmount: payment.fineAmount, discountAmount: payment.discountAmount, receiptNumber: payment.receiptNo,
    credit, creditAmount: credit, note: payment.note, status: "recorded", replayed,
    message: replayed ? "This payment was already recorded; no duplicate was posted." : credit > 0 ? "Payment recorded with credit carried forward" : "Payment recorded",
  };
}

/**
 * Validates and records one collection for an already authorised staff user (the route asserts the staff role
 * and fees.add first). body: { studentId, invoiceId, amount (minor units), fineAmount?, discountAmount?,
 * paymentDate, paymentMethod, referenceNumber?, note?, idempotencyKey, workflowHandoffId? }.
 */
export async function collectPaymentCore(user: AuthUser, body: Record<string, unknown>): Promise<CollectOutcome> {
  if (!body.studentId || !body.invoiceId) throw new ApiError("studentId and invoiceId required", 400);

  const amount = minorUnits(body.amount, "amount");
  if (amount <= 0) throw new ApiError("amount must be a positive integer (paisa)", 400);

  const paymentDate = calendarDate(body.paymentDate ?? new Date().toISOString().split("T")[0]);
  if (!paymentDate) throw new ApiError("paymentDate must be a real calendar date (YYYY-MM-DD)", 400);
  const paymentMethod = String(body.paymentMethod ?? "").toUpperCase();
  if (!(COLLECT_METHODS as readonly string[]).includes(paymentMethod)) {
    throw new ApiError("paymentMethod must be CASH, BANK, CHEQUE, SAFEPAY or MOBILE_WALLET", 400);
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: body.invoiceId as string,
      studentId: body.studentId as string,
      student: { campus: { schoolId: user.schoolId } },
    },
    include: { student: { select: { id: true, fullName: true, campusId: true } } },
  });
  if (!invoice) throw new ApiError("Invoice not found for this student", 404);
  // SKAI-1309: a cancelled invoice is terminal, so this is a business-rule rejection (409), not a server fault.
  if (invoice.status === "CANCELLED") throw conflict("Cancelled invoices cannot accept payments.", "INVOICE_CANCELLED");

  const campusId = await resolveCampusId(user, invoice.student.campusId);

  // SKO-475: the operation key binds this collection to its exact request. A retry after a dropped
  // response replays the original receipt; the same key with a different request is a conflict.
  const idempotencyKey = typeof body.idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
  if (!idempotencyKey) throw new ApiError("idempotencyKey is required for a manual collection", 400);
  const fineAmount = minorUnits(body.fineAmount, "fineAmount", 0), discountAmount = minorUnits(body.discountAmount, "discountAmount", 0);
  const referenceNumber = (body.referenceNumber ?? null) as string | null, note = (body.note ?? null) as string | null;
  const requestHash = createHash("sha256").update(JSON.stringify({ invoiceId: invoice.id, studentId: invoice.studentId, amount, fineAmount, discountAmount, paymentDate: paymentDate.toISOString().slice(0, 10), paymentMethod, referenceNumber, note })).digest("hex");
  const outcome = (payment: CollectPayment, credit: number, replayed: boolean): CollectOutcome => ({ invoice, payment, credit, replayed, campusId, amount });
  const replay = async () => {
    const previous = await prisma.payment.findFirst({ where: { schoolId: user.schoolId, recordedBy: user.userId, idempotencyKey } });
    if (!previous) return null;
    if (previous.requestHash !== requestHash) throw Object.assign(new ApiError("This payment key was already used for a different payment. Check the existing receipt before recording again.", 409), { code: "IDEMPOTENCY_CONFLICT" });
    const allocation = await prisma.paymentAllocation.findFirst({ where: { paymentId: previous.id }, select: { credit: true } });
    return outcome(previous, allocation?.credit ?? 0, true);
  };
  const earlier = await replay();
  if (earlier) return earlier;

  // RT6: a prepared collection for this invoice is posted only through its own hand-off, and only once.
  const workflowHandoffId = await bindHandoff(user, invoice.id, campusId, typeof body.workflowHandoffId === "string" && body.workflowHandoffId ? body.workflowHandoffId : null);

  try {
    // The payment, allocation, ledger entry, hand-off link and audit record commit together or not at all.
    const recorded = await prisma.$transaction(async (tx) => {
      const result = await recordPayment(tx, {
        campusId,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amount,
        fineAmount,
        discountAmount,
        paymentDate,
        paymentMethod,
        referenceNumber,
        note,
        recordedBy: user.userId,
        idempotencyKey,
        requestHash,
        // Payments are immutable once issued, so the hand-off is written on create; the unique (school, hand-off)
        // index refuses a second payment from the same hand-off and rolls this transaction back.
        workflowHandoffId,
      });
      await tx.auditLog.create({ data: { tableName: "payment", recordId: result.payment.id, newValue: { invoiceId: invoice.id, amount, fineAmount: result.payment.fineAmount, discountAmount: result.payment.discountAmount, receiptNo: result.receiptNo, credit: result.credit, ...(workflowHandoffId ? { workflowHandoffId } : {}) }, userId: user.userId } });
      return result;
    }, { timeout: 20000 });
    return outcome(recorded.payment, recorded.credit, false);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = JSON.stringify(error.meta ?? {});
      // A concurrent retry with the same key committed first: answer with its receipt.
      if (target.includes("idempotency")) {
        const winner = await replay();
        if (winner) return winner;
      }
      // SKAI-1310: the same campus, date and reference number already exist on another payment.
      if (/reference/i.test(target)) throw conflict("A payment with this reference number already exists for this campus and date.", "DUPLICATE_REFERENCE");
      if (/workflow_?handoff/i.test(target)) throw conflict("This prepared collection was already recorded. Check its receipt before recording again.", "HANDOFF_ALREADY_POSTED");
    }
    throw error;
  }
}
