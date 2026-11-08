/**
 * SKO-436 library rules, pure so a fine can be previewed and explained exactly as it is charged.
 *
 * - Due dates never fall on a closure day; they move to the next open day.
 * - A fine counts only open days after the due date and after the grace days; closure days are
 *   listed but never charged; the total is capped.
 */

export type LoanRules = { version: number; loanDays: number; maxLoans: number; maxRenewals: number; graceDays: number; finePerDay: number; fineCap: number; lostCharge: number; holdDays: number; currency: string; closures: string[] };

export const DEFAULT_RULES: Omit<LoanRules, "version"> = { loanDays: 14, maxLoans: 3, maxRenewals: 2, graceDays: 0, finePerDay: 0, fineCap: 0, lostCharge: 0, holdDays: 3, currency: "PKR", closures: [] };

const DAY = 86_400_000;
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function dueDate(from: Date, rules: Pick<LoanRules, "loanDays" | "closures">): Date {
  let due = new Date(midnight(from).getTime() + rules.loanDays * DAY);
  const closed = new Set(rules.closures);
  for (let i = 0; i < 60 && closed.has(ymd(due)); i++) due = new Date(due.getTime() + DAY);
  return due;
}

export type FinePreview = { overdueDays: number; graceDays: number; closureDays: string[]; chargeableDays: number; perDay: number; uncapped: number; cap: number; amount: number; currency: string };

export function finePreview(dueAt: Date, returnedAt: Date, rules: Pick<LoanRules, "graceDays" | "finePerDay" | "fineCap" | "closures" | "currency">): FinePreview {
  const due = midnight(dueAt), back = midnight(returnedAt);
  const closed = new Set(rules.closures);
  const days: string[] = [];
  for (let t = due.getTime() + DAY; t <= back.getTime(); t += DAY) days.push(ymd(new Date(t)));
  const closureDays = days.filter((d) => closed.has(d));
  const open = days.filter((d) => !closed.has(d));
  const chargeableDays = Math.max(0, open.length - rules.graceDays);
  const uncapped = chargeableDays * rules.finePerDay;
  const amount = rules.fineCap > 0 ? Math.min(uncapped, rules.fineCap) : uncapped;
  return { overdueDays: days.length, graceDays: Math.min(rules.graceDays, open.length), closureDays, chargeableDays, perDay: rules.finePerDay, uncapped, cap: rules.fineCap, amount, currency: rules.currency };
}
