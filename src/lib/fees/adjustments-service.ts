import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { capturePaymentReceipt } from "./receipt";

// SKO-433: refunds, credit notes and waivers as controlled financial exceptions.
//  - A credit note or waiver reduces what is owed on one invoice; it never moves cash.
//  - A refund returns cash against one payment; approval is not disbursement, and money is recorded
//    as returned only when finance confirms the disbursement.
//  - The requester never decides their own request. Open requests reserve the amount they ask for, so
//    concurrent requests cannot exceed what is refundable or owed. A decision re-checks the source
//    version it was requested against; anything that changed needs a fresh request.

export const ADJUSTMENT_KINDS = ["REFUND", "CREDIT_NOTE", "WAIVER"] as const;
export const REASON_CATEGORIES = ["WITHDRAWAL", "OVERPAYMENT", "BILLING_ERROR", "HARDSHIP", "SCHOLARSHIP", "SIBLING_POLICY", "OTHER"] as const;
export type AdjustmentKind = typeof ADJUSTMENT_KINDS[number];
const OPEN = ["REQUESTED", "APPROVED"];

type InvoiceRow = { id: string; schoolId: string; campusId: string; studentId: string; currency: string; status: string; totalAmount: number; totalAmountPaid: number; balanceDue: number; discountAmount: number };
const invoiceVersion = (invoice: InvoiceRow) => `${invoice.totalAmount}:${invoice.totalAmountPaid}:${invoice.balanceDue}:${invoice.status}`;

async function lockInvoice(tx: TxClient, user: AuthUser, invoiceId: string) {
  const scoped = await tx.invoice.findFirst({ where: { id: invoiceId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true } });
  if (!scoped) throw new ApiError("Invoice not found", 404);
  await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${scoped.id} AND school_id = ${user.schoolId} FOR UPDATE`;
  return tx.invoice.findUniqueOrThrow({ where: { id: scoped.id }, select: { id: true, schoolId: true, campusId: true, studentId: true, currency: true, status: true, totalAmount: true, totalAmountPaid: true, balanceDue: true, discountAmount: true } });
}

/** What can still be refunded on a payment: applied money and unapplied credit, after earlier reversals. */
async function refundable(tx: TxClient, invoice: InvoiceRow, paymentId: string) {
  const payment = await tx.payment.findFirst({ where: { id: paymentId, invoiceId: invoice.id, schoolId: invoice.schoolId, reversalOfId: null, amount: { gt: 0 } }, include: { reversals: { select: { id: true } }, ledgerEntry: { select: { accountId: true, bankAccountId: true } } } });
  if (!payment) throw new ApiError("Choose a confirmed payment on this invoice to refund.", 404);
  if (payment.currency !== invoice.currency) throw new ApiError("Refunds stay in the payment's original currency.", 409);
  const allocations = await tx.paymentAllocation.findMany({ where: { paymentId: { in: [payment.id, ...payment.reversals.map(row => row.id)] } }, select: { amount: true, credit: true } });
  const applied = allocations.reduce((sum, row) => sum + row.amount, 0), credit = allocations.reduce((sum, row) => sum + row.credit, 0);
  return { payment, applied: Math.max(0, Math.min(applied, invoice.totalAmountPaid)), credit: Math.max(0, credit), version: `${payment.id}:${payment.reversals.length}:${applied}:${credit}` };
}

export async function requestAdjustment(user: AuthUser, input: { kind: AdjustmentKind; invoiceId: string; paymentId?: string | null; amount: number; reasonCategory: string; reason: string; publicExplanation: string; privateNote?: string | null; idempotencyKey: string }) {
  if (!ADJUSTMENT_KINDS.includes(input.kind)) throw new ApiError("Choose refund, credit note or waiver.", 400);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new ApiError("Enter a positive amount.", 400);
  if (!(REASON_CATEGORIES as readonly string[]).includes(input.reasonCategory)) throw new ApiError("Choose a reason category.", 400);
  const reason = input.reason.trim().slice(0, 2000), publicExplanation = input.publicExplanation.trim().slice(0, 2000);
  if (reason.length < 3 || publicExplanation.length < 3) throw new ApiError("A reason and a family-facing explanation are required.", 400);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)) throw new ApiError("idempotencyKey is required", 400);
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.financialAdjustment.findFirst({ where: { schoolId: user.schoolId, requesterId: user.userId, idempotencyKey: input.idempotencyKey } });
      if (previous) return previous;
      const invoice = await lockInvoice(tx, user, input.invoiceId);
      if (invoice.status === "CANCELLED") throw new ApiError("A cancelled invoice cannot be adjusted.", 409);
      let invoiceAmount = 0, creditAmount = 0, sourceVersion = invoiceVersion(invoice), paymentId: string | null = null;
      if (input.kind === "REFUND") {
        if (!input.paymentId) throw new ApiError("Choose the payment to refund.", 400);
        const source = await refundable(tx, invoice, input.paymentId);
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${source.payment.id} FOR UPDATE`;
        const open = await tx.financialAdjustment.findMany({ where: { paymentId: source.payment.id, kind: "REFUND", status: { in: OPEN } }, select: { invoiceAmount: true, creditAmount: true } });
        const freeCredit = source.credit - open.reduce((sum, row) => sum + row.creditAmount, 0), freeApplied = source.applied - open.reduce((sum, row) => sum + row.invoiceAmount, 0);
        if (input.amount > freeCredit + freeApplied) throw new ApiError(`Only ${Math.max(0, freeCredit + freeApplied)} can still be refunded on this payment after earlier refunds and open requests.`, 409);
        // Unapplied credit is returned first; only the rest reopens the invoice.
        creditAmount = Math.min(input.amount, Math.max(0, freeCredit)); invoiceAmount = input.amount - creditAmount;
        sourceVersion = `${sourceVersion}|${source.version}`; paymentId = source.payment.id;
      } else {
        const open = await tx.financialAdjustment.findMany({ where: { invoiceId: invoice.id, kind: { in: ["CREDIT_NOTE", "WAIVER"] }, status: "REQUESTED" }, select: { amount: true } });
        const free = invoice.balanceDue - open.reduce((sum, row) => sum + row.amount, 0);
        if (input.amount > free) throw new ApiError(`Only ${Math.max(0, free)} is still owed on this invoice after other open credit and waiver requests.`, 409);
        invoiceAmount = input.amount;
      }
      const requester = await tx.user.findUnique({ where: { id: user.userId }, select: { fullName: true } });
      const created = await tx.financialAdjustment.create({ data: { schoolId: user.schoolId, campusId: invoice.campusId, studentId: invoice.studentId, invoiceId: invoice.id, paymentId, kind: input.kind, currency: invoice.currency, amount: input.amount, invoiceAmount, creditAmount, reasonCategory: input.reasonCategory, reason, publicExplanation, privateNote: input.privateNote?.trim().slice(0, 4000) || null, sourceVersion, requesterId: user.userId, requesterName: requester?.fullName ?? "Staff", idempotencyKey: input.idempotencyKey } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "financial_adjustments", recordId: created.id, userId: user.userId, newValue: { action: "REQUESTED", kind: created.kind, amount: created.amount, invoiceId: created.invoiceId, paymentId } } });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return prisma.financialAdjustment.findFirstOrThrow({ where: { schoolId: user.schoolId, requesterId: user.userId, idempotencyKey: input.idempotencyKey } });
    throw error;
  }
}

export async function decideAdjustment(user: AuthUser, id: string, decision: "approve" | "decline") {
  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.financialAdjustment.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
    if (!adjustment) throw new ApiError("Adjustment not found", 404);
    await tx.$queryRaw`SELECT id FROM financial_adjustments WHERE id = ${adjustment.id} FOR UPDATE`;
    const current = await tx.financialAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } });
    if (current.status !== "REQUESTED") return current;
    if (current.requesterId === user.userId) throw new ApiError("You requested this adjustment; another authorized approver must decide.", 403);
    const approver = await tx.user.findUnique({ where: { id: user.userId }, select: { fullName: true } });
    if (decision === "decline") {
      const declined = await tx.financialAdjustment.update({ where: { id: current.id }, data: { status: "DECLINED", approverId: user.userId, approverName: approver?.fullName ?? "Staff", decidedAt: new Date() } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "financial_adjustments", recordId: current.id, userId: user.userId, oldValue: { status: "REQUESTED" }, newValue: { status: "DECLINED" } } });
      return declined;
    }
    const invoice = await lockInvoice(tx, user, current.invoiceId);
    let version = invoiceVersion(invoice);
    if (current.kind === "REFUND") version = `${version}|${(await refundable(tx, invoice, current.paymentId!)).version}`;
    if (version !== current.sourceVersion) throw new ApiError("The invoice or payment changed since this request. Decline it and request again from the current values.", 409);
    let status = "APPROVED";
    if (current.kind !== "REFUND") {
      // Credit notes and waivers reduce what is owed; the reduction is recorded as a discount and no cash moves.
      const total = invoice.totalAmount - current.amount, balance = invoice.balanceDue - current.amount;
      if (balance < 0) throw new ApiError("The adjustment is larger than what is still owed.", 409);
      await tx.invoice.update({ where: { id: invoice.id }, data: { totalAmount: total, balanceDue: balance, discountAmount: invoice.discountAmount + current.amount, status: balance === 0 ? "PAID" : invoice.totalAmountPaid > 0 ? "PARTIAL" : invoice.status === "OVERDUE" ? "OVERDUE" : "PENDING" } });
      status = "APPLIED";
    }
    const decided = await tx.financialAdjustment.update({ where: { id: current.id }, data: { status, approverId: user.userId, approverName: approver?.fullName ?? "Staff", decidedAt: new Date(), ...(status === "APPLIED" ? { executedAt: new Date() } : {}) } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "financial_adjustments", recordId: current.id, userId: user.userId, oldValue: { status: "REQUESTED", invoice: version }, newValue: { status, kind: current.kind, amount: current.amount } } });
    return decided;
  });
}

/** Finance records what happened to an approved refund. Money counts as returned only when confirmed. */
export async function recordDisbursement(user: AuthUser, id: string, outcome: "confirmed" | "failed", reference: string) {
  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.financialAdjustment.findFirst({ where: { id, schoolId: user.schoolId, kind: "REFUND", ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
    if (!adjustment) throw new ApiError("Refund not found", 404);
    await tx.$queryRaw`SELECT id FROM financial_adjustments WHERE id = ${adjustment.id} FOR UPDATE`;
    const current = await tx.financialAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } });
    if (current.status === "DISBURSED" || current.status === "FAILED") return current;
    if (current.status !== "APPROVED") throw new ApiError("Only an approved refund can be recorded as paid out.", 409);
    const ref = reference.trim().slice(0, 120);
    if (outcome === "failed") {
      const failed = await tx.financialAdjustment.update({ where: { id: current.id }, data: { status: "FAILED", disbursementRef: ref || null, executedAt: new Date() } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "financial_adjustments", recordId: current.id, userId: user.userId, oldValue: { status: "APPROVED" }, newValue: { status: "FAILED", reference: ref } } });
      return failed;
    }
    if (ref.length < 3) throw new ApiError("Enter the bank or cash reference for the refund.", 400);
    const invoice = await lockInvoice(tx, user, current.invoiceId);
    const source = await refundable(tx, invoice, current.paymentId!);
    if (current.invoiceAmount > source.applied || current.creditAmount > source.credit) throw new ApiError("The payment no longer has this much to refund. Review it before recording.", 409);
    await capturePaymentReceipt(tx, source.payment.id);
    const reversal = await tx.payment.create({ data: { schoolId: invoice.schoolId, campusId: invoice.campusId, studentId: invoice.studentId, invoiceId: invoice.id, amount: -current.amount, currency: current.currency, paymentDate: new Date(), paymentMethod: source.payment.paymentMethod, referenceNumber: `REFUND-${current.id.slice(0, 8)}`, receiptNo: `RFD-${current.id.slice(0, 8).toUpperCase()}`, note: `Refund: ${current.publicExplanation}`.slice(0, 300), recordedBy: user.userId, reversalOfId: source.payment.id } });
    await tx.paymentAllocation.create({ data: { schoolId: invoice.schoolId, campusId: invoice.campusId, paymentId: reversal.id, invoiceId: invoice.id, amount: -current.invoiceAmount, credit: -current.creditAmount, currency: current.currency } });
    if (current.invoiceAmount) {
      const paid = invoice.totalAmountPaid - current.invoiceAmount, balance = invoice.balanceDue + current.invoiceAmount;
      await tx.invoice.update({ where: { id: invoice.id }, data: { totalAmountPaid: paid, balanceDue: balance, status: balance === 0 ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING" } });
    }
    if (current.creditAmount) {
      const carry = await tx.feeCarryForward.findFirst({ where: { studentId: invoice.studentId, schoolId: invoice.schoolId, balance: { lt: 0 }, currency: current.currency }, orderBy: { toAcademicYear: "desc" } });
      if (!carry || carry.balance > -current.creditAmount) throw new ApiError("The unapplied credit has already been used. Review it before recording.", 409);
      await tx.feeCarryForward.update({ where: { id: carry.id }, data: { balance: { increment: current.creditAmount } } });
    }
    if (source.payment.ledgerEntry) await tx.ledgerEntry.create({ data: { schoolId: invoice.schoolId, campusId: invoice.campusId, kind: "INCOME", accountId: source.payment.ledgerEntry.accountId, bankAccountId: source.payment.ledgerEntry.bankAccountId, sourceName: reversal.receiptNo!, amount: reversal.amount, currency: current.currency, date: new Date(), paymentMethod: source.payment.paymentMethod, note: `Refund of ${source.payment.receiptNo ?? source.payment.id} (${ref})`, paymentId: reversal.id, createdById: user.userId } });
    await capturePaymentReceipt(tx, reversal.id);
    const disbursed = await tx.financialAdjustment.update({ where: { id: current.id }, data: { status: "DISBURSED", disbursementRef: ref, successorPaymentId: reversal.id, executedAt: new Date() } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "financial_adjustments", recordId: current.id, userId: user.userId, oldValue: { status: "APPROVED" }, newValue: { status: "DISBURSED", reference: ref, reversalPaymentId: reversal.id } } });
    return disbursed;
  }, { timeout: 30000 });
}

/** Staff see everything; families see only decided outcomes with the public explanation. */
export function familyAdjustment(row: { id: string; kind: string; status: string; amount: number; currency: string; publicExplanation: string; decidedAt: Date | null; executedAt: Date | null; invoiceId: string }) {
  if (!["APPLIED", "APPROVED", "DISBURSED"].includes(row.status)) return null;
  return { id: row.id, kind: row.kind, status: row.status, amount: row.amount, currency: row.currency, publicExplanation: row.publicExplanation, decidedAt: row.decidedAt?.toISOString() ?? null, executedAt: row.executedAt?.toISOString() ?? null, invoiceId: row.invoiceId };
}
