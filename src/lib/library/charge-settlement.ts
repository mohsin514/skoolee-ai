import type { TxClient } from "@/lib/db/prisma";

/** SKAI-1793: the library charge status that follows from its fee invoice. */
export function chargeStatusForInvoice(invoice: { status: string; balanceDue: number; totalAmountPaid: number }) {
  if (invoice.status === "CANCELLED") return "WAIVED";
  if (invoice.balanceDue <= 0) return invoice.totalAmountPaid > 0 ? "PAID" : "WAIVED";
  return "POSTED";
}

/**
 * SKAI-1793: call inside the same transaction that changed an invoice. A library charge posted to that invoice
 * follows it: fully paid → PAID, waived or credited to zero / cancelled → WAIVED, owed again (refund) → POSTED.
 * Idempotent: a charge already in the right status is not touched. Only POSTED/PAID/WAIVED charges linked to
 * this invoice in the invoice's own school are moved.
 */
export async function settleLibraryChargeForInvoice(tx: TxClient, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { schoolId: true, status: true, balanceDue: true, totalAmountPaid: true } });
  if (!invoice) return 0;
  const status = chargeStatusForInvoice(invoice);
  const moved = await tx.libraryCharge.updateMany({ where: { schoolId: invoice.schoolId, invoiceId, status: { in: ["POSTED", "PAID", "WAIVED"], not: status } }, data: { status, decidedAt: new Date() } });
  return moved.count;
}
