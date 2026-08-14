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
}

export async function recordPayment(tx: TxClient, input: RecordPaymentInput) {
  const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) throw new Error("Invoice not found");

  const fineAmount = Math.max(0, Math.round(input.fineAmount ?? 0));
  const discountAmount = Math.max(0, Math.round(input.discountAmount ?? 0));
  const amount = Math.round(input.amount);
  if (amount < 0) throw new Error("Amount cannot be negative");
  if (amount <= 0) throw new Error("Amount must be greater than zero");

  // use unique key
  const shortId = input.campusId.split("-").pop()?.slice(0, 4).toUpperCase() ?? "XX";
  const year = input.paymentDate.getFullYear();
  const maxReceipt = await tx.payment.findFirst({
    where: { campusId: input.campusId },
    orderBy: { createdAt: "desc" },
    select: { receiptNo: true },
  });
  let seq = 1;
  if (maxReceipt?.receiptNo) {
    const parts = maxReceipt.receiptNo.split("-");
    const last = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!isNaN(last)) seq = last + 1;
  }
  const receiptNo = `RCP-${year}-${shortId}-${String(seq).padStart(5, "0")}`;

  const payment = await tx.payment.create({
    data: {
      campusId: input.campusId,
      invoiceId: input.invoiceId,
      studentId: input.studentId,
      amount,
      fineAmount,
      discountAmount,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      note: input.note ?? null,
      receiptNo,
      recordedBy: input.recordedBy ?? null,
    },
  });

  const totalPaid = (await tx.payment.aggregate({
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
  if (newBalance < 0) {
    credit = -newBalance;
    const toYear = year + 1;
    const existing = await tx.feeCarryForward.findUnique({
      where: { studentId_toAcademicYear: { studentId: input.studentId, toAcademicYear: toYear } },
    });
    if (existing) {
      await tx.feeCarryForward.update({
        where: { id: existing.id },
        data: { balance: existing.balance - credit },
      });
    } else {
      await tx.feeCarryForward.create({
        data: {
          campusId: input.campusId,
          studentId: input.studentId,
          fromAcademicYear: year,
          toAcademicYear: toYear,
          balance: -credit,
          note: "Auto credit from overpayment",
        },
      });
    }
  }

  // Ledger: auto-post INCOME (idempotent — paymentId is unique on the entry).
  // The income account is lazily created per campus on first use.
  let incomeAccount = await tx.chartOfAccount.findFirst({
    where: { campusId: input.campusId, name: "Fee Income" },
  });
  if (!incomeAccount) {
    incomeAccount = await tx.chartOfAccount.create({
      data: { campusId: input.campusId, name: "Fee Income", type: "INCOME", isSystem: true },
    });
  }

  await tx.ledgerEntry.create({
    data: {
      campusId: input.campusId,
      kind: "INCOME",
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
      studentId: input.studentId,
      kind: "FEE_PAID",
      title: `Fee payment recorded (${receiptNo})`,
      detail: `PKR ${(amount / 100).toLocaleString()}${fineAmount ? ` · fine PKR ${(fineAmount / 100).toLocaleString()}` : ""}`,
      actorId: input.recordedBy ?? null,
    },
  });

  return { payment, credit, receiptNo, invoiceNumber: invoice.invoiceNumber };
}