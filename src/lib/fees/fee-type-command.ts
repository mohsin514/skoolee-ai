import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/** The route's code normalisation: trimmed, upper case, spaces as underscores ("late fee" → "LATE_FEE"). */
export const feeTypeCode = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");
/** SKAI-2221: create and update share these checks: text only, name 1-120 and code 1-40 characters, description text or empty. */
const text = (value: unknown, field: string, max: number) => {
  if (typeof value !== "string") throw new ApiError(`${field} must be text`, 400);
  const trimmed = value.trim();
  if (!trimmed) throw new ApiError(`${field} is required`, 400);
  if (trimmed.length > max) throw new ApiError(`${field} must be at most ${max} characters`, 400);
  return trimmed;
};
export const feeTypeName = (value: unknown) => text(value, "name", 120);
export const feeTypeCodeField = (value: unknown) => feeTypeCode(text(value, "code", 40));
export function feeTypeDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError("description must be text", 400);
  if (value.trim().length > 500) throw new ApiError("description must be at most 500 characters", 400);
  return value.trim() || null;
}

/**
 * Create a fee type (POST /api/fees/types), extracted so the route and the AI Workflows
 * `fees.create_fee_type` capability run the same command. Body: { campusId?, name, code, description? }.
 * The caller has already checked canManageFinance and fees.add. Throws ApiError with the route's messages.
 */
export async function createFeeType(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  if (body.name === undefined || body.code === undefined) throw new ApiError("name and code are required", 400);
  const name = feeTypeName(body.name);
  const code = feeTypeCodeField(body.code);

  // Normalised like the code: a blank description is no description, so "" and a missing value are the same request.
  const wanted = { name, description: feeTypeDescription(body.description) };
  const replayOrConflict = async () => {
    const existing = await prisma.feeType.findUnique({ where: { campusId_code: { campusId, code } } });
    if (!existing) return null;
    // SKAI-1632: an identical request replays the committed row; a different payload is a controlled conflict.
    if (existing.name === wanted.name && existing.description === wanted.description) return existing;
    throw new ApiError("A fee type with this code already exists with different details", 409);
  };

  const existing = await replayOrConflict();
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.feeType.create({ data: { campusId, ...wanted, code } });
      await writeAuditEvent(tx, user, { table: "fee_types", recordId: created.id, action: "CREATE", campusId });
      return created;
    });
  } catch (error) {
    // A concurrent identical create committed first: reload it instead of exposing the unique-constraint failure.
    if ((error as { code?: string }).code !== "P2002") throw error;
    const raced = await replayOrConflict();
    if (raced) return raced;
    throw error;
  }
}
