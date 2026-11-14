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

/**
 * SKAI-1976: currentGuardianRelationship for several children in one read, under the same authority rules.
 * Each child's permissions come from that child's own relationship; a child with none (or an ambiguous
 * effective history) is absent from the map, so a sibling's grants never carry over.
 */
export async function currentGuardianPermissionsByStudent(input: { schoolId: string; studentIds: readonly string[]; guardianUserId: string; at?: Date }) {
  const at = input.at ?? new Date();
  const out = new Map<string, GuardianPermissions>();
  if (!input.studentIds.length) return out;
  const relations = await prisma.guardianRelationship.findMany({
    where: { ...guardianRelationshipAuthorityWhere(input.guardianUserId, at, input.schoolId), studentId: { in: [...input.studentIds] } },
    select: {
      studentId: true,
      accessVersions: {
        where: { effectiveFrom: { lte: at }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }] },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: 2,
        select: { permissions: true, effectiveFrom: true, effectiveUntil: true },
      },
    },
  });
  // Like findFirst, the first relationship found for a child decides it.
  const seen = new Set<string>();
  for (const relation of relations) {
    if (seen.has(relation.studentId)) continue;
    seen.add(relation.studentId);
    const permissions = currentGuardianPermissions(relation.accessVersions, at);
    if (permissions) out.set(relation.studentId, permissions);
  }
  return out;
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
