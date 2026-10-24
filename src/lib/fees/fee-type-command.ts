import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/** The route's code normalisation: trimmed, upper case, spaces as underscores ("late fee" → "LATE_FEE"). */
export const feeTypeCode = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");

/**
 * Create a fee type (POST /api/fees/types), extracted so the route and the AI Workflows
 * `fees.create_fee_type` capability run the same command. Body: { campusId?, name, code, description? }.
 * The caller has already checked canManageFinance and fees.add. Throws ApiError with the route's messages.
 */
export async function createFeeType(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const name = String(body.name ?? "").trim();
  const code = feeTypeCode(body.code);

  if (!name || !code) throw new ApiError("name and code are required", 400);

  const existing = await prisma.feeType.findUnique({ where: { campusId_code: { campusId, code } } });
  if (existing) throw new ApiError("A fee type with this code already exists", 409);

  return prisma.$transaction(async (tx) => {
    const created = await tx.feeType.create({
      data: { campusId, name, code, description: (body.description as string | null | undefined) ?? null },
    });
    await writeAuditEvent(tx, user, { table: "fee_types", recordId: created.id, action: "CREATE", campusId });
    return created;
  });
}
