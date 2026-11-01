import { ApiError } from "@/lib/api/scope";

export const PAYROLL_ROLES = ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN"] as const;
export type PayrollRole = (typeof PAYROLL_ROLES)[number];

/** SKAI-1429: whole-number period only; "3.9" or "3abc" is a client error, not March. */
export function parsePayrollPeriod(rawMonth: unknown, rawYear: unknown) {
  const whole = (value: unknown) => {
    const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
    return /^\d+$/.test(text) ? Number(text) : NaN;
  };
  const month = whole(rawMonth), year = whole(rawYear);
  if (!(month >= 1 && month <= 12)) throw new ApiError("month must be 1-12", 400);
  if (!(year >= 2000 && year <= 2100)) throw new ApiError("year must be 2000-2100", 400);
  return { month, year };
}

export function parsePayrollRole(raw: unknown): PayrollRole | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const role = String(raw).toUpperCase();
  if (!(PAYROLL_ROLES as readonly string[]).includes(role)) throw new ApiError(`role must be one of ${PAYROLL_ROLES.join(", ")}`, 400);
  return role as PayrollRole;
}
