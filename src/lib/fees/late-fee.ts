// SKAI-2022: the campus fine rule decides the late fee on a generated invoice, with its grace days.

export type FineRule = { type: string; value: number; graceDays: number };
export type LegacyLateFee = { percentage: number; compound: boolean };

const DAY_MS = 86400000;

/** Whole days between the previous invoice's due date and the new invoice date. */
export function daysOverdue(invoiceDate: Date, dueDate: Date): number {
  return Math.floor((invoiceDate.getTime() - dueDate.getTime()) / DAY_MS);
}

/**
 * Late fee in minor units on the overdue balance. An active campus fine rule wins (nothing is charged inside
 * its grace days); without one the class fee structure's percentage applies as before.
 */
export function lateFeeFor(overdueDays: number, balanceDue: number, rule: FineRule | null, legacy: LegacyLateFee): number {
  if (rule) {
    const pastGrace = overdueDays - Math.max(0, rule.graceDays);
    if (pastGrace <= 0) return 0;
    if (rule.type === "FLAT") return rule.value;
    if (rule.type === "PER_DAY") return rule.value * pastGrace;
    if (rule.type === "PERCENT") return Math.round(balanceDue * rule.value / 100);
    return 0;
  }
  if (overdueDays <= 0) return 0;
  let fee = 0;
  let base = balanceDue;
  for (let i = 0; i < Math.ceil(overdueDays / 30); i++) {
    const step = Math.round(base * legacy.percentage / 100);
    fee += step;
    if (legacy.compound) base += step;
  }
  return fee;
}
