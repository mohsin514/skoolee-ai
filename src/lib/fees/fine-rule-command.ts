import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/** Fine value and grace days are Postgres Int4 columns: anything above this overflows into a raw 500. */
export const MAX_FINE_INT = 2147483647;

export const FINE_TYPES = ["PERCENT", "FLAT", "PER_DAY"];

/** SKAI-2023: one validator for POST and PATCH so both reject the same inputs with 400. */
export function parseFineName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) throw new ApiError("name required", 400);
  return name;
}

export function parseFineType(raw: unknown): string {
  const type = String(raw ?? "").toUpperCase();
  if (!FINE_TYPES.includes(type)) throw new ApiError("type must be PERCENT, FLAT or PER_DAY", 400);
  return type;
}

export function parseFineValue(raw: unknown, type: string): number {
  const value = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (raw === "" || !Number.isInteger(value) || value < 0) throw new ApiError("value must be a non-negative integer", 400);
  if (type === "PERCENT" && value > 100) throw new ApiError("percent fine cannot exceed 100", 400);
  if (value > MAX_FINE_INT) throw new ApiError(`value cannot exceed ${MAX_FINE_INT}`, 400);
  return value;
}

// SKAI-1308: a malformed grace period is a validation error, not NaN reaching the database.
export function parseFineGraceDays(raw: unknown): number {
  const graceDays = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (raw === "" || !Number.isInteger(graceDays) || graceDays < 0) throw new ApiError("graceDays must be a non-negative whole number of days", 400);
  if (graceDays > MAX_FINE_INT) throw new ApiError(`graceDays cannot exceed ${MAX_FINE_INT}`, 400);
  return graceDays;
}

export function parseFineIsActive(raw: unknown): boolean {
  if (typeof raw !== "boolean") throw new ApiError("isActive must be true or false", 400);
  return raw;
}

/**
 * Create a late-payment fine rule (POST /api/fees/fine-rules), extracted so the route and the AI
 * Workflows `fees.create_fine_rule` capability run the same command.
 * Body: { campusId?, name, type: PERCENT|FLAT|PER_DAY, value (percent or paisa), graceDays?, isActive? }.
 * The caller has already checked canManageFinance and fees.add. Throws ApiError with the route's messages.
 */
export async function createFineRule(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const name = parseFineName(body.name);
  const type = parseFineType(body.type);
  const value = parseFineValue(body.value, type);
  const graceDays = parseFineGraceDays(body.graceDays ?? 0);

  const existing = await prisma.feeFineRule.findFirst({ where: { campusId, name: { equals: name, mode: "insensitive" } } });
  if (existing) throw new ApiError("A fine rule with this name already exists", 409);

  return prisma.$transaction(async (tx) => {
    const created = await tx.feeFineRule.create({
      data: { campusId, name, type, value, graceDays, isActive: body.isActive !== false },
    });
    await writeAuditEvent(tx, user, { table: "fee_fine_rules", recordId: created.id, action: "CREATE", campusId, after: { type, value, graceDays, isActive: created.isActive } });
    return created;
  });
}
