import { randomUUID, createHash } from "node:crypto";
import { getTenantContext } from "@/lib/db/tenant-context";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";

export const POLICY_VERSION = "2026-10-08.1";
export const ACCESS_DENIED = "This account cannot access that record.";
export const publishedMarksWhere = { exam: { status: "PUBLISHED" } };
export const publishedReportsWhere = { status: { in: ["PUBLISHED", "SENT"] } };
export const isFamily = (user: AuthUser) => user.role === "PARENT" || user.role === "STUDENT";

export class AccessDenied extends Error {
  status = 403;
  constructor(resource: string, action = "view", principal?: { userId?: string; schoolId?: string }) {
    super(ACCESS_DENIED);
    // No record IDs, request values, names, email addresses, or content.
    const context = principal ?? getTenantContext();
    const redact = (value?: string) => value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : undefined;
    console.warn(JSON.stringify({ event: "authorization.denied", decisionId: randomUUID(), policy: POLICY_VERSION,
      reason: "scope_or_relationship_denied", resource, action, actor: redact(context?.userId), tenant: redact(context?.schoolId) }));
  }
}

export function campusScope(user: AuthUser): { schoolId: string; campusId?: string } {
  if (user.role === "SUPER_ADMIN" || user.role === "APP_OWNER" || isFamily(user)) return { schoolId: user.schoolId };
  if (!user.campusId) throw new AccessDenied("campus", "view", user);
  return { schoolId: user.schoolId, campusId: user.campusId };
}

/** Families are related through explicit account IDs, never names or email. */
export function studentScope(user: AuthUser): Prisma.StudentWhereInput {
  return { ...campusScope(user),
    ...(user.role === "PARENT" ? { parentUserId: user.userId } : {}),
    ...(user.role === "STUDENT" ? { studentUserId: user.userId } : {}),
  };
}

export function reportScope(user: AuthUser): Prisma.ReportCardWhereInput {
  return { ...campusScope(user), ...(isFamily(user) ? {
    student: studentScope(user), ...publishedReportsWhere,
  } : {}) };
}
