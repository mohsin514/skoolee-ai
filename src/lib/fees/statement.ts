// SKO-431: one statement for a family, built from the ledger columns. Due dates are compared with
// "today" in the school's timezone, a future instalment is never overdue, cancelled invoices carry no
// charge, and the statement proves it reconciles: opening + charges − payments = closing = what is owed.

/** Today's calendar date (YYYY-MM-DD) in the school's timezone. */
export function schoolToday(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export type DueState = "PAID" | "CANCELLED" | "OVERDUE" | "DUE_TODAY" | "NOT_YET_DUE";

export function dueState(invoice: { status: string; balanceDue: number; dueDate: string }, today: string): DueState {
  if (invoice.status === "CANCELLED") return "CANCELLED";
  if (invoice.balanceDue <= 0) return "PAID";
  if (invoice.dueDate < today) return "OVERDUE";
  if (invoice.dueDate === today) return "DUE_TODAY";
  return "NOT_YET_DUE";
}

export interface StatementInvoice { id: string; status: string; totalAmount: number; totalAmountPaid: number; balanceDue: number; dueDate: string;
  /** An approved instalment plan replaces the single due date with its instalments' states. */
  installments?: { state: "PAID" | "PART_PAID" | "OVERDUE" | "DUE_TODAY" | "NOT_YET_DUE"; remaining: number }[] }

function planDueState(invoice: StatementInvoice): DueState | null {
  if (!invoice.installments || invoice.status === "CANCELLED" || invoice.balanceDue <= 0) return null;
  if (invoice.installments.some(item => item.state === "OVERDUE")) return "OVERDUE";
  if (invoice.installments.some(item => item.state === "DUE_TODAY")) return "DUE_TODAY";
  return "NOT_YET_DUE";
}

export function reconcileStatement(invoices: StatementInvoice[], today: string, openingBalance = 0) {
  const live = invoices.filter(invoice => invoice.status !== "CANCELLED");
  const charges = live.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  // Only what was applied to the invoice reduces it; any excess is a separate credit record.
  const payments = live.reduce((sum, invoice) => sum + Math.min(invoice.totalAmountPaid, invoice.totalAmount), 0);
  const closing = openingBalance + charges - payments;
  const outstanding = openingBalance + live.reduce((sum, invoice) => sum + Math.max(invoice.balanceDue, 0), 0);
  const states = Object.fromEntries(invoices.map(invoice => [invoice.id, planDueState(invoice) ?? dueState(invoice, today)])) as Record<string, DueState>;
  // With a plan, each instalment's remaining amount counts under its own state.
  const amountWhere = (state: DueState) => live.reduce((sum, invoice) => {
    if (invoice.installments && invoice.balanceDue > 0) return sum + invoice.installments.filter(item => (item.state === "PART_PAID" ? "NOT_YET_DUE" : item.state) === state).reduce((total, item) => total + item.remaining, 0);
    return states[invoice.id] === state ? sum + Math.max(invoice.balanceDue, 0) : sum;
  }, 0);
  return {
    today, openingBalance, charges, payments, closing, outstanding,
    overdue: amountWhere("OVERDUE"), dueToday: amountWhere("DUE_TODAY"), notYetDue: amountWhere("NOT_YET_DUE"),
    reconciles: closing === outstanding,
    states,
  };
}
