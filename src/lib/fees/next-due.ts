/** Invoice statuses that still owe money. PARTIAL is an installment balance, not a settled invoice (SKAI-1292). */
export const OUTSTANDING_INVOICE_STATUSES = ["PENDING", "PARTIAL", "OVERDUE"] as const;

type DueInvoice = { status: string; dueDate: Date; balanceDue: number };

/** The earliest-due outstanding invoice with a remaining balance, whatever order the caller loaded them in. */
export function nextDueInvoice<T extends DueInvoice>(invoices: readonly T[]): T | null {
  let next: T | null = null;
  for (const invoice of invoices) {
    if (!(OUTSTANDING_INVOICE_STATUSES as readonly string[]).includes(invoice.status) || invoice.balanceDue <= 0) continue;
    if (!next || invoice.dueDate < next.dueDate) next = invoice;
  }
  return next;
}

/** Invoices a payment can be recorded against: outstanding status with a balance, earliest due first (SKAI-2065). */
export function payableInvoices<T extends { status: string; dueDate: string | Date; balance: number }>(invoices: readonly T[]): T[] {
  const time = (d: string | Date) => new Date(d).getTime();
  return invoices
    .filter((i) => (OUTSTANDING_INVOICE_STATUSES as readonly string[]).includes(i.status) && i.balance > 0)
    .sort((a, b) => time(a.dueDate) - time(b.dueDate));
}

type TotalsInvoice = { status: string; totalAmount: number; totalAmountPaid: number; lateFeeAmount: number };

/** Student fee totals. CANCELLED invoices carry no charge (cancelling keeps balanceDue on the row), so they are excluded. */
export function studentFeeTotals(invoices: readonly TotalsInvoice[]) {
  const live = invoices.filter((inv) => inv.status !== "CANCELLED");
  const totalDue = live.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = live.reduce((sum, inv) => sum + inv.totalAmountPaid, 0);
  const lateFeesAccrued = live.reduce((sum, inv) => sum + inv.lateFeeAmount, 0);
  return { totalDue, totalPaid, balance: totalDue - totalPaid, lateFeesAccrued };
}
