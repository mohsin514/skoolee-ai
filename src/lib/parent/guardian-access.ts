import "server-only";
import { prisma } from "@/lib/db/prisma";
import { currentGuardianPermissions, hasGuardianPermission, type GuardianPermission, type GuardianPermissions } from "./guardian-permissions";
import { guardianRelationshipAuthorityWhere } from "./guardian-query";
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
      ...guardianRelationshipAuthorityWhere(input.guardianUserId, at, input.schoolId),
      studentId: input.studentId,
      ...(input.relationshipId ? { id: input.relationshipId } : {}),
    },
    include: {
      accessVersions: {
        where: { effectiveFrom: { lte: at }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }] },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: 2,
      },
    },
  });
  if (!relation) return null;
  const permissions = currentGuardianPermissions(relation.accessVersions, at);
  return permissions ? { ...relation, permissions } : null;
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
