/**
 * SKO-434 payroll calculation under a school-configured policy. Pure: the same frozen inputs and
 * policy always give the same lines, and every amount carries the rule and the input it came from.
 *
 * Amounts are integers in the currency's minor unit. Leave days are tenths, as LeaveRequest stores
 * them. Dates are YYYY-MM-DD strings (UTC calendar dates).
 */

export type Basis = "CALENDAR_DAYS" | "FIXED_30";
export type Rounding = "HALF_UP" | "DOWN";

export interface PolicyRules {
  id: string;
  version: number;
  packageLabel: string;
  currency: string;
  prorationBasis: Basis;
  leaveDivisor: Basis;
  leaveYearStartMonth: number;
  rounding: Rounding;
}

export interface LeaveInput { requestId: string; leaveTypeId: string; typeName: string; from: string; to: string; days: number }
export interface AdjustmentInput { id: string; kind: "EARNING" | "DEDUCTION"; label: string; amount: number; reason: string; enteredById: string }
export interface EmployeeInput {
  userId: string;
  name: string;
  role: string;
  joiningDate: string | null;
  leavingDate: string | null;
  basic: number;
  allowances: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  salarySource: string;
  providerEmployeeId: string | null;
  /** APPROVED leave in the leave year up to the end of the period, any type. */
  leave: LeaveInput[];
  /** tenths allowed per leave type for the leave year; a type with no allocation is unpaid. */
  allocations: Record<string, number>;
  adjustments: AdjustmentInput[];
}

export interface Component { code: string; label: string; kind: "EARNING" | "DEDUCTION"; amount: number; exact: number; rule: string; source: string }
export interface PayLine { userId: string; name: string; providerEmployeeId: string | null; employedDays: number; periodDays: number; components: Component[]; gross: number; deductions: number; net: number; unpaidLeaveDays: number }
export interface PayException { code: "MISSING_PROVIDER_ID" | "NEGATIVE_NET" | "UNSUPPORTED_CURRENCY"; userId?: string; message: string; blocking: boolean }

const ms = 86_400_000;
const toDay = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / ms);
const fromDay = (day: number) => new Date(day * ms).toISOString().slice(0, 10);
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");
export const periodStart = (year: number, month: number) => `${year}-${pad(month)}-01`;
export const periodEnd = (year: number, month: number) => `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;

export function round(value: number, rule: Rounding) {
  if (rule === "DOWN") return Math.sign(value) * Math.floor(Math.abs(value) + 1e-9);
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** The first month of the leave year containing this period. */
export function leaveYearStart(policy: PolicyRules, year: number, month: number) {
  const startYear = month >= policy.leaveYearStartMonth ? year : year - 1;
  return `${startYear}-${pad(policy.leaveYearStartMonth)}-01`;
}

/** Day-of-month on a 30-day basis: the last day of any month (28, 29, 30 or 31) counts as day 30. */
function day30(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return d === daysInMonth(y, m) ? 30 : Math.min(d, 30);
}

/** Employed days in the period on the policy's basis, out of the basis' month length. */
export function employment(policy: PolicyRules, year: number, month: number, joining: string | null, leaving: string | null) {
  const start = periodStart(year, month), end = periodEnd(year, month);
  const from = joining && joining > start ? joining : start;
  const to = leaving && leaving < end ? leaving : end;
  if (to < from) return { from, to, days: 0, of: policy.prorationBasis === "FIXED_30" ? 30 : daysInMonth(year, month) };
  if (policy.prorationBasis === "FIXED_30") return { from, to, days: day30(to) - (from === start ? 1 : day30(from)) + 1, of: 30 };
  return { from, to, days: toDay(to) - toDay(from) + 1, of: daysInMonth(year, month) };
}

/**
 * Leave tenths per type inside [from, to], with each calendar day counted once even when approved
 * requests overlap (the earlier request keeps the day). A one-day request may be a half day.
 */
function leaveDays(leave: LeaveInput[], from: string, to: string) {
  const taken = new Set<number>();
  const byType = new Map<string, { tenths: number; requests: string[] }>();
  for (const r of [...leave].sort((a, b) => a.from.localeCompare(b.from) || a.requestId.localeCompare(b.requestId))) {
    const single = r.from === r.to;
    for (let d = Math.max(toDay(r.from), toDay(from)); d <= Math.min(toDay(r.to), toDay(to)); d++) {
      if (taken.has(d)) continue;
      taken.add(d);
      const entry = byType.get(r.leaveTypeId) ?? { tenths: 0, requests: [] };
      entry.tenths += single ? Math.min(10, Math.max(1, r.days)) : 10;
      if (!entry.requests.includes(r.requestId)) entry.requests.push(r.requestId);
      byType.set(r.leaveTypeId, entry);
    }
  }
  return byType;
}

export function calculateLine(policy: PolicyRules, year: number, month: number, input: EmployeeInput): PayLine {
  const job = employment(policy, year, month, input.joiningDate, input.leavingDate);
  const factor = job.days / job.of;
  const prorated = job.days < job.of;
  const prorationRule = prorated ? `${policy.packageLabel} · ${policy.prorationBasis === "FIXED_30" ? "30-day month" : "calendar days"} · ${job.days}/${job.of} days employed (${job.from} to ${job.to})` : `${policy.packageLabel} · full period`;
  const components: Component[] = [];
  const add = (c: Omit<Component, "amount">) => components.push({ ...c, amount: round(c.exact, policy.rounding) });

  add({ code: "BASIC", label: "Basic salary", kind: "EARNING", exact: input.basic * factor, rule: prorationRule, source: input.salarySource });
  for (const a of input.allowances) add({ code: "ALLOWANCE", label: a.name, kind: "EARNING", exact: a.amount * factor, rule: prorationRule, source: input.salarySource });

  // Unpaid leave: days in this period beyond what is left of the leave year's allocation.
  const yearStart = leaveYearStart(policy, year, month);
  const before = leaveDays(input.leave, yearStart, fromDay(toDay(periodStart(year, month)) - 1));
  const inPeriod = leaveDays(input.leave, job.from, job.to);
  const monthlyGross = input.basic + input.allowances.reduce((s, a) => s + a.amount, 0);
  const divisor = policy.leaveDivisor === "FIXED_30" ? 30 : daysInMonth(year, month);
  let unpaidTenths = 0;
  for (const [typeId, used] of inPeriod) {
    const allowed = input.allocations[typeId] ?? 0;
    const remaining = Math.max(0, allowed - (before.get(typeId)?.tenths ?? 0));
    const unpaid = Math.max(0, used.tenths - remaining);
    if (!unpaid) continue;
    unpaidTenths += unpaid;
    const typeName = input.leave.find((l) => l.leaveTypeId === typeId)?.typeName ?? "Leave";
    add({ code: "UNPAID_LEAVE", label: `Unpaid leave · ${typeName}`, kind: "DEDUCTION", exact: (monthlyGross / divisor) * (unpaid / 10), rule: `${policy.packageLabel} · ${unpaid / 10} day(s) beyond the ${allowed / 10}-day allocation (${(before.get(typeId)?.tenths ?? 0) / 10} used since ${yearStart}) · gross ÷ ${divisor}`, source: `Approved leave ${used.requests.join(", ")}` });
  }
  for (const d of input.deductions) add({ code: "DEDUCTION", label: d.name, kind: "DEDUCTION", exact: d.amount, rule: `${policy.packageLabel} · recurring deduction, not prorated`, source: input.salarySource });
  for (const a of input.adjustments) add({ code: a.kind === "EARNING" ? "ADJUSTMENT_EARNING" : "ADJUSTMENT_DEDUCTION", label: a.label, kind: a.kind, exact: a.amount, rule: "One-off adjustment for this period", source: `Adjustment ${a.id} by ${a.enteredById}: ${a.reason}` });

  const gross = components.filter((c) => c.kind === "EARNING").reduce((s, c) => s + c.amount, 0);
  const deductions = components.filter((c) => c.kind === "DEDUCTION").reduce((s, c) => s + c.amount, 0);
  return { userId: input.userId, name: input.name, providerEmployeeId: input.providerEmployeeId, employedDays: job.days, periodDays: job.of, components, gross, deductions, net: gross - deductions, unpaidLeaveDays: unpaidTenths / 10 };
}

export function calculateRun(policy: PolicyRules, year: number, month: number, inputs: EmployeeInput[], providerCurrencies: string[]) {
  const lines = inputs.map((input) => calculateLine(policy, year, month, input));
  const exceptions: PayException[] = [];
  if (!providerCurrencies.includes(policy.currency)) exceptions.push({ code: "UNSUPPORTED_CURRENCY", message: `The provider does not accept ${policy.currency}.`, blocking: true });
  for (const line of lines) {
    if (!line.providerEmployeeId) exceptions.push({ code: "MISSING_PROVIDER_ID", userId: line.userId, message: `${line.name} has no provider employee id.`, blocking: true });
    if (line.net < 0) exceptions.push({ code: "NEGATIVE_NET", userId: line.userId, message: `${line.name} has negative net pay (${line.net}). Add an authorized adjustment before approval.`, blocking: true });
  }
  return { lines, exceptions, totalNet: lines.reduce((s, l) => s + l.net, 0) };
}

const FIELDS = ["providerEmployeeId", "name", "gross", "deductions", "net", "currency", "period", "reference"] as const;
export type ExportField = (typeof FIELDS)[number];
export const EXPORT_FIELDS: readonly ExportField[] = FIELDS;

const cell = (value: string) => (/[",\n\r]/u.test(value) || /^[=+\-@\t]/u.test(value) ? `"${(/^[=+\-@\t]/u.test(value) ? "'" : "") + value.replace(/"/g, '""')}"` : value);

/** CSV in the provider's column order; amounts are written in major units with two decimals. */
export function exportFile(columns: { header: string; field: ExportField }[], lines: PayLine[], meta: { currency: string; period: string; reference: string }) {
  const money = (n: number) => (n / 100).toFixed(2);
  const value = (line: PayLine, field: ExportField) => {
    switch (field) {
      case "providerEmployeeId": return line.providerEmployeeId ?? "";
      case "name": return line.name;
      case "gross": return money(line.gross);
      case "deductions": return money(line.deductions);
      case "net": return money(line.net);
      case "currency": return meta.currency;
      case "period": return meta.period;
      default: return meta.reference;
    }
  };
  return [columns.map((c) => cell(c.header)).join(","), ...lines.map((l) => columns.map((c) => cell(value(l, c.field))).join(","))].join("\n") + "\n";
}
