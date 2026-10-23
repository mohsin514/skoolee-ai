import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { getLocalePackage } from "@/lib/locale/store";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/**
 * Create a fee group (POST /api/fees/groups), extracted so the route and the AI Workflows
 * `fees.create_fee_group` capability run the same command. Body: { campusId?, name, description? }.
 * The caller has already checked canManageFinance and fees.add. Throws ApiError with the route's messages.
 */
export async function createFeeGroup(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError("name required", 400);

  const existing = await prisma.feeGroup.findFirst({ where: { campusId, name } });
  if (existing) throw new ApiError("A fee group with this name already exists", 409);

  const currency = (await getLocalePackage(user.schoolId, campusId)).currency;
  return prisma.$transaction(async (tx) => {
    const created = await tx.feeGroup.create({
      data: { campusId, currency, name, description: (body.description as string | null | undefined) ?? null },
    });
    await writeAuditEvent(tx, user, { table: "fee_groups", recordId: created.id, action: "CREATE", campusId, after: { currency } });
    return created;
  });
}
