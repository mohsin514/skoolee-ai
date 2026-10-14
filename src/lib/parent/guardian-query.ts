import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { GUARDIAN_CONSENT_KEYS, GUARDIAN_PERMISSION_KEYS, type GuardianPermission } from "./guardian-permissions";

function permissionPath(permission: GuardianPermission): string[] {
  return GUARDIAN_CONSENT_KEYS.includes(permission as typeof GUARDIAN_CONSENT_KEYS[number])
    ? ["consents", permission]
    : [permission];
}

export function liveGuardianRelationshipWhere(guardianUserId: string | null, permission: GuardianPermission, at = new Date()): Prisma.GuardianRelationshipWhereInput {
  return {
    ...(guardianUserId ? { guardianUserId } : {}),
    status: "ACTIVE",
    verifiedAt: { not: null },
    validFrom: { lte: at },
    AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: at } }] }],
    accessVersions: { some: {
      effectiveFrom: { lte: at },
      AND: [{ OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }] }],
      permissions: { path: permissionPath(permission), equals: true },
    } },
  };
}

export function guardianStudentWhere(user: AuthUser, permission: GuardianPermission | "any", at = new Date()): Prisma.StudentWhereInput {
  if (user.role !== "PARENT") return { schoolId: user.schoolId };
  const permissionFilters = permission === "any"
    ? [...GUARDIAN_PERMISSION_KEYS, ...GUARDIAN_CONSENT_KEYS].map((key) => liveGuardianRelationshipWhere(user.userId, key, at))
    : [liveGuardianRelationshipWhere(user.userId, permission, at)];
  return {
    schoolId: user.schoolId,
    guardianRelationships: { some: permission === "any" ? { OR: permissionFilters } : permissionFilters[0] },
  };
}
