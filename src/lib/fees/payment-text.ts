import { ApiError } from "@/lib/api/scope";

/** SKAI-2097: reference and note are optional text; anything else (or too long) is a 400, never a raw Prisma 500. */
export function optionalPaymentText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError(`${field} must be text`, 400);
  if (value.length > max) throw new ApiError(`${field} must be at most ${max} characters`, 400);
  return value;
}
