import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/**
 * Assign a fee group to one class for an academic year (POST /api/fees/assignments), extracted so the
 * route and the AI Workflows `fees.assign_fee_group` capability run the same command.
 * Body: { campusId?, feeGroupId, classId, academicYear? }. The caller has already checked
 * canManageFinance and fees.add. Throws ApiError with the route's messages.
 */
export async function assignFeeGroup(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  if (!body.feeGroupId || !body.classId) throw new ApiError("feeGroupId and classId required", 400);
  const feeGroupId = String(body.feeGroupId), classId = String(body.classId);
  const academicYear = Number(body.academicYear ?? new Date().getFullYear());
  if (!Number.isInteger(academicYear) || academicYear < 2000) throw new ApiError("invalid academicYear", 400);

  const [group, cls] = await Promise.all([
    prisma.feeGroup.findFirst({ where: { id: feeGroupId, campusId } }),
    prisma.class.findFirst({ where: { id: classId, campusId } }),
  ]);
  if (!group) throw new ApiError("Fee group not found", 404);
  if (!cls) throw new ApiError("Class not found", 404);

  const existing = await prisma.feeGroupAssignment.findUnique({
    where: { feeGroupId_classId_academicYear: { feeGroupId, classId, academicYear } },
  });
  if (existing) throw new ApiError("This class already has this group for the year", 409);

  return prisma.$transaction(async (tx) => {
    const created = await tx.feeGroupAssignment.create({
      data: { campusId, feeGroupId, classId, academicYear },
      include: { feeGroup: { select: { id: true, name: true } }, class: { select: { id: true, name: true, section: true } } },
    });
    await writeAuditEvent(tx, user, { table: "fee_group_assignments", recordId: created.id, action: "CREATE", campusId, after: { feeGroupId: created.feeGroupId, classId: created.classId, academicYear: created.academicYear } });
    return created;
  });
}
