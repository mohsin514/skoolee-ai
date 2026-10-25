// SKO-431: instalment plans for one invoice. Amounts are integer minor units in the invoice currency;
// payments made after the plan started are allocated to instalments in date order, so a future
// instalment is never overdue and a part-paid one shows exactly what remains.

export type Installment = { dueDate: string; amount: number };
export type InstallmentState = "PAID" | "PART_PAID" | "OVERDUE" | "DUE_TODAY" | "NOT_YET_DUE";

const isDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Why a proposed schedule is not acceptable, or null when it is. */
export function validatePlan(installments: Installment[], balance: number, today: string): string | null {
  if (installments.length < 2 || installments.length > 24) return "A plan needs between 2 and 24 instalments.";
  if (installments.some(item => !isDate(item.dueDate))) return "Each instalment needs a valid due date.";
  if (installments.some(item => !Number.isInteger(item.amount) || item.amount <= 0)) return "Each instalment needs a positive amount.";
  if (installments.some((item, index) => index > 0 && item.dueDate <= installments[index - 1].dueDate)) return "Instalment dates must be in order, one per date.";
  if (installments[0].dueDate < today) return "The first instalment cannot be due before today.";
  const total = installments.reduce((sum, item) => sum + item.amount, 0);
  if (total !== balance) return "The instalments must add up exactly to the amount still owed on the invoice.";
  return null;
}

/** An even split with any remainder on the last instalment, due on the same day each month. */
export function splitEvenly(total: number, count: number, firstDueDate: string): Installment[] {
  const base = Math.floor(total / count);
  const [year, month, day] = firstDueDate.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return { dueDate: date.toISOString().slice(0, 10), amount: index === count - 1 ? total - base * (count - 1) : base };
  });
}

/** Each instalment's allocation and state for the amount paid since the plan started. */
export function installmentStates(installments: Installment[], paidTowardPlan: number, today: string) {
  let remainingPaid = Math.max(0, paidTowardPlan);
  return installments.map(item => {
    const paid = Math.min(item.amount, remainingPaid);
    remainingPaid -= paid;
    const remaining = item.amount - paid;
    const state: InstallmentState = remaining === 0 ? "PAID" : item.dueDate < today ? "OVERDUE" : item.dueDate === today ? "DUE_TODAY" : paid > 0 ? "PART_PAID" : "NOT_YET_DUE";
    return { ...item, paid, remaining, state };
  });
}
