import "server-only";
import { prisma } from "@/lib/db/prisma";
import { hasGuardianPermission, parseGuardianPermissions, type GuardianPermission, type GuardianPermissions } from "./guardian-permissions";
export { EMPTY_GUARDIAN_PERMISSIONS, hasGuardianPermission, parseGuardianPermissions } from "./guardian-permissions";
export type { GuardianPermission, GuardianPermissions } from "./guardian-permissions";
export { guardianStudentWhere, liveGuardianRelationshipWhere } from "./guardian-query";

export async function currentGuardianRelationship(input: {
  schoolId: string;
  studentId: string;
  guardianUserId: string;
  relationshipId?: string;
  at?: Date;
}) {
  const at = input.at ?? new Date();
  const relation = await prisma.guardianRelationship.findFirst({
    where: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      guardianUserId: input.guardianUserId,
      ...(input.relationshipId ? { id: input.relationshipId } : {}),
      status: "ACTIVE",
      verifiedAt: { not: null },
      validFrom: { lte: at },
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: at } }] }],
    },
    include: {
      accessVersions: {
        where: { effectiveFrom: { lte: at }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }] },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
    },
  });
  if (!relation) return null;
  return { ...relation, permissions: parseGuardianPermissions(relation.accessVersions[0]?.permissions) };
}

export async function guardianHasAccess(input: {
  schoolId: string;
  studentId: string;
  guardianUserId: string;
  permission: GuardianPermission;
  relationshipId?: string;
  at?: Date;
}) {
  const relation = await currentGuardianRelationship(input);
  return relation && hasGuardianPermission(relation.permissions, input.permission) ? relation : null;
}
