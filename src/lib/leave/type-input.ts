import { ApiError } from "@/lib/api/scope";

/**
 * Leave type input rules shared by the create command and the PATCH route (SKAI-446).
 * A missing default means 0 days. Anything non-numeric, non-finite or negative is a 400 that names the field,
 * so no value is silently clamped into storage.
 */
export function parseLeaveTypeDefaultDays(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  const days =
    typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(days) || days < 0) {
    throw new ApiError("defaultDays must be a number of days, 0 or more", 400);
  }
  return days;
}

/** True when Prisma rejected the write on the campus + name unique key (a concurrent identical write won). */
export function isLeaveTypeNameClash(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export function leaveTypeNameTaken(name: string): ApiError {
  return new ApiError(`Leave type "${name}" already exists`, 409);
}
