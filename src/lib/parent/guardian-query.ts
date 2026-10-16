import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { GUARDIAN_CONSENT_KEYS, GUARDIAN_PERMISSION_KEYS, type GuardianPermission } from "./guardian-permissions";

function permissionPath(permission: GuardianPermission): string[] {
  return GUARDIAN_CONSENT_KEYS.includes(permission as typeof GUARDIAN_CONSENT_KEYS[number])
    ? ["consents", permission]
    : [permission];
}

/** Shared by session reads and signed links: a retained relationship cannot outlive either account or child access. */
export function guardianRelationshipAuthorityWhere(guardianUserId: string | null, at = new Date(), schoolId?: string): Prisma.GuardianRelationshipWhereInput {
  return {
    ...(schoolId ? { schoolId } : {}),
    ...(guardianUserId ? { guardianUserId } : {}),
    guardian: { isActive: true, role: "PARENT", ...(schoolId ? { schoolId } : {}) },
    student: { archivedAt: null, consolidatedIntoId: null, status: { equals: "active", mode: "insensitive" }, ...(schoolId ? { schoolId } : {}), campus: { archivedAt: null, ...(schoolId ? { schoolId } : {}) } },
    status: "ACTIVE",
    verifiedAt: { not: null },
    validFrom: { lte: at },
    AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: at } }] }],
  };
}

export function liveGuardianRelationshipWhere(guardianUserId: string | null, permission: GuardianPermission, at = new Date(), schoolId?: string): Prisma.GuardianRelationshipWhereInput {
  const effective = { effectiveFrom: { lte: at }, AND: [{ OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }] }] };
  // The database exclusion constraint permits at most one effective version. This extra negative
  // check also refuses an explicit conflicting denial while an older deployment is being repaired.
  return { ...guardianRelationshipAuthorityWhere(guardianUserId, at, schoolId), accessVersions: { some: {
      ...effective,
      permissions: { path: permissionPath(permission), equals: true },
    }, none: {
      ...effective,
      permissions: { path: permissionPath(permission), equals: false },
    } } };
}

export function guardianStudentWhere(user: AuthUser, permission: GuardianPermission | "any", at = new Date()): Prisma.StudentWhereInput {
  if (user.role !== "PARENT") return { schoolId: user.schoolId };
  const permissionFilters = permission === "any"
    ? [...GUARDIAN_PERMISSION_KEYS, ...GUARDIAN_CONSENT_KEYS].map((key) => liveGuardianRelationshipWhere(user.userId, key, at, user.schoolId))
    : [liveGuardianRelationshipWhere(user.userId, permission, at, user.schoolId)];
  return {
    schoolId: user.schoolId,
    guardianRelationships: { some: permission === "any" ? { OR: permissionFilters } : permissionFilters[0] },
  };
}
