import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/**
 * Price a fee type inside a fee group (POST /api/fees/master-lines), extracted so the route and the AI
 * Workflows `fees.create_master_line` capability run the same command.
 * Body: { campusId?, feeGroupId, feeTypeId, amount (paisa), currency?, dueDate? }.
 * The caller has already checked canManageFinance and fees.edit. Throws ApiError with the route's messages.
 */
export async function createMasterLine(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  if (!body.feeGroupId || !body.feeTypeId) throw new ApiError("feeGroupId and feeTypeId required", 400);
  const feeGroupId = String(body.feeGroupId), feeTypeId = String(body.feeTypeId);
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 0) throw new ApiError("amount must be a non-negative integer (paisa)", 400);

  const [group, type] = await Promise.all([
    prisma.feeGroup.findFirst({ where: { id: feeGroupId, campusId } }),
    prisma.feeType.findFirst({ where: { id: feeTypeId, campusId } }),
  ]);
  if (!group) throw new ApiError("Fee group not found", 404);
  if ((body.currency || "PKR") !== group.currency) throw new ApiError("Currency does not match fee group", 409);
  if (!type) throw new ApiError("Fee type not found", 404);

  const existing = await prisma.feesMasterLine.findUnique({
    where: { feeGroupId_feeTypeId: { feeGroupId, feeTypeId } },
  });
  if (existing) throw new ApiError("This fee type already exists in the group", 409);

  return prisma.$transaction(async (tx) => {
    const created = await tx.feesMasterLine.create({
      data: { campusId, feeGroupId, feeTypeId, amount, dueDate: body.dueDate ? new Date(String(body.dueDate)) : null },
      include: { feeType: { select: { id: true, name: true, code: true } } },
    });
    await writeAuditEvent(tx, user, { table: "fees_master_lines", recordId: created.id, action: "CREATE", campusId, after: { feeGroupId: created.feeGroupId, feeTypeId: created.feeTypeId, amount: created.amount, dueDate: created.dueDate?.toISOString() ?? null } });
    return created;
  });
}
