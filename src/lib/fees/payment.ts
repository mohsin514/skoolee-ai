import { capturePaymentReceipt } from "./receipt";
import { type TxClient } from "@/lib/db/prisma";
// ─── Payment recording (single source for collecting fees) ──
// Used by POST /api/fees/collect, POST /api/fees/payment, and the SafePay
// webhook. Every amount is Int paisa.
//
// Overpayment rule: any excess over the invoice balance becomes a credit and
// is stored as a NEGATIVE FeeCarryForward balance for the student's next
// academic year (upserted per (studentId, toYear)). Refunds are an explicit
// negative payment — payments are never deleted.

import { Prisma } from "@prisma/client";

export interface RecordPaymentInput {
  campusId: string;
  invoiceId: string;
  studentId: string;
  amount: number; // paisa — the cash collected
  fineAmount?: number;
  discountAmount?: number;
  paymentDate: Date;
  paymentMethod: string;
  referenceNumber?: string | null;
  note?: string | null;
  recordedBy?: string | null;
  orderRef?: string | null;
  /** SKO-475: the caller's operation key and request fingerprint for manual collections. */
  idempotencyKey?: string | null;
  requestHash?: string | null;
  /** RT6: the claimed AI Workflows hand-off this payment completes; unique per school, so it posts once. */
  workflowHandoffId?: string | null;
}

export async function recordPayment(tx: TxClient, input: RecordPaymentInput) {
  // Serialize allocation against collection/reversal for the same invoice.
  // Resolve through the tenant guard before obtaining the database row lock.
  const scopedInvoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!scopedInvoice || scopedInvoice.campusId !== input.campusId || scopedInvoice.studentId !== input.studentId) throw new Error("Invoice unavailable for this student and campus");
  await tx.$queryRaw`SELECT id FROM invoices WHERE id=${scopedInvoice.id} AND school_id=${scopedInvoice.schoolId} FOR UPDATE`;
  const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) throw new Error("Invoice not found");

  const fineAmount = Math.max(0, Math.round(input.fineAmount ?? 0));
  const discountAmount = Math.max(0, Math.round(input.discountAmount ?? 0));
  const amount = Math.round(input.amount);
  if (amount < 0) throw new Error("Amount cannot be negative");
  if (amount <= 0) throw new Error("Amount must be greater than zero");

  // SKO-432: one atomic counter per campus and year. The first issue for a campus/year continues
  // from the highest number already printed, and (campus, receipt_no) is unique in the database.
  const shortId = input.campusId.split("-").pop()?.slice(0, 4).toUpperCase() ?? "XX";
  const year = input.paymentDate.getFullYear();
  const [{ last_value: seq }] = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO receipt_sequences (campus_id, school_id, year, last_value)
    VALUES (${input.campusId}, ${invoice.schoolId}, ${year}, COALESCE((
      SELECT MAX(NULLIF(substring(receipt_no from '-([0-9]+)$'), '')::int) FROM payments
      WHERE campus_id = ${input.campusId} AND receipt_no LIKE ${`RCP-${year}-%`}), 0) + 1)
    ON CONFLICT (campus_id, year) DO UPDATE SET last_value = receipt_sequences.last_value + 1
    RETURNING last_value`;
  const receiptNo = `RCP-${year}-${shortId}-${String(seq).padStart(5, "0")}`;

  // SKO-431: ownership comes from the locked invoice, not the request context, because verified
  // provider callbacks run without a signed-in school.
  const payment = await tx.payment.create({
    data: {
      schoolId: invoice.schoolId,
      campusId: input.campusId,
      invoiceId: input.invoiceId,
      studentId: input.studentId,
      amount,
      currency: invoice.currency,
      fineAmount,
      discountAmount,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      note: input.note ?? null,
      receiptNo,
      recordedBy: input.recordedBy ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash: input.requestHash ?? null,
      ...(input.workflowHandoffId ? { workflowHandoffId: input.workflowHandoffId } : {}),
    },
  });

  const applied = Math.min(amount, Math.max(0, invoice.balanceDue));
  const newCredit = amount - applied;
  await tx.paymentAllocation.create({ data: { schoolId: invoice.schoolId, campusId: invoice.campusId, paymentId: payment.id, invoiceId: invoice.id, amount: applied, credit: newCredit, currency: invoice.currency } });

  const totalPaid = (await tx.paymentAllocation.aggregate({
    where: { invoiceId: input.invoiceId },
    _sum: { amount: true },
  }))._sum.amount ?? 0;

  const newBalance = invoice.totalAmount - totalPaid;
  const newStatus = newBalance <= 0 ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";

  // Only what this invoice can absorb counts as paid against it. Any excess is
  // carried into next year as credit just below, so storing the raw payment sum
  // here counted the overpayment twice: once as collected, once as credit. That
  // broke the invariant `totalAmountPaid + balanceDue === totalAmount`, which
  // the campus summary sums directly — it reported collected > receivable and a
  // collection rate above 100%.
  const appliedToInvoice = Math.min(totalPaid, invoice.totalAmount);

  await tx.invoice.update({
    where: { id: input.invoiceId },
    data: {
      totalAmountPaid: appliedToInvoice,
      balanceDue: Math.max(0, newBalance),
      status: newStatus,
    },
  });

  // Overpayment → credit carried forward into the next academic year.
  let credit = 0;
  if (newCredit > 0) {
    credit = newCredit;
    const toYear = year + 1;
    const existing = await tx.feeCarryForward.findUnique({
      where: { studentId_toAcademicYear: { studentId: input.studentId, toAcademicYear: toYear } },
    });
    if (existing) {
      if (existing.currency !== invoice.currency) throw new Error("Cannot combine overpayment credit across currencies");
      await tx.feeCarryForward.update({
        where: { id: existing.id },
        data: { balance: existing.balance - credit },
      });
    } else {
      await tx.feeCarryForward.create({
        data: {
          schoolId: invoice.schoolId,
          campusId: input.campusId,
          studentId: input.studentId,
          fromAcademicYear: year,
          toAcademicYear: toYear,
          balance: -credit,
          currency: invoice.currency,
          note: "Auto credit from overpayment",
        },
      });
    }
  }

  // Ledger: auto-post INCOME (idempotent — paymentId is unique on the entry).
  // The income account is lazily created per campus on first use.
  let incomeAccount = await tx.chartOfAccount.findFirst({
    where: { schoolId: invoice.schoolId, campusId: input.campusId, name: "Fee Income" },
  });
  if (!incomeAccount) {
    incomeAccount = await tx.chartOfAccount.create({
      data: { schoolId: invoice.schoolId, campusId: input.campusId, name: "Fee Income", type: "INCOME", isSystem: true },
    });
  }

  await tx.ledgerEntry.create({
    data: {
      schoolId: invoice.schoolId,
      campusId: input.campusId,
      kind: "INCOME",
      currency: invoice.currency,
      sourceName: `Fee payment ${receiptNo}`,
      accountId: incomeAccount.id,
      paymentMethod: input.paymentMethod,
      date: input.paymentDate,
      amount,
      note: input.note ?? "Auto-posted fee collection",
      paymentId: payment.id,
      createdById: input.recordedBy ?? null,
    },
  });

  await tx.studentTimelineEvent.create({
    data: {
      schoolId: invoice.schoolId,
      studentId: input.studentId,
      kind: "FEE_PAID",
      title: `Fee payment recorded (${receiptNo})`,
      detail: `${invoice.currency} ${amount} minor units`,
      actorId: input.recordedBy ?? null,
    },
  });

  await capturePaymentReceipt(tx, payment.id);
  return { payment, credit, receiptNo, invoiceNumber: invoice.invoiceNumber };
}