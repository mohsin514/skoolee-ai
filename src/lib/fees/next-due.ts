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
