import { studentScope, AccessDenied } from "@/lib/auth/policy";
import type { AuthUser } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { verifyParentToken } from "@/lib/parent/token";
import { currentGuardianRelationship, type GuardianPermissions } from "@/lib/parent/guardian-access";

/**
 * Which child a parent request is about.
 *
 * Every parent endpoint previously did its own `findFirst({ parentUserId })`
 * with no ordering and no way to name a child, so a guardian with siblings at
 * the school could only ever reach whichever row Postgres happened to return
 * first — the other child's attendance, results and timetable were simply
 * unreachable, and the "first" child could change between requests.
 *
 * The `studentId` parameter is accepted only after confirming that child
 * really belongs to the caller; otherwise it would be a trivial IDOR into any
 * other family's record.
 */
export type ParentChild = {
  id: string;
  fullName: string;
  rollNo: string | null;
};

async function childrenOf(user: AuthUser): Promise<ParentChild[]> {
  return prisma.student.findMany({
    where: studentScope(user, "any"),
    select: { id: true, fullName: true, rollNo: true },
    // Deterministic, so the default child does not drift between requests.
    orderBy: [{ rollNo: "asc" }, { fullName: "asc" }],
  });
}

export type ResolvedParentScope = {
  studentId: string | null;
  schoolId: string;
  relationshipId: string | null;
  permissions: GuardianPermissions;
  /** Empty for token links, which are scoped to a single child by design. */
  children: ParentChild[];
};

export async function resolveParentScope(req: NextRequest): Promise<ResolvedParentScope> {
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const result = await verifyParentToken(token);
    if (!result) return { studentId: null, schoolId: "", relationshipId: null, permissions: { learningRecords: false, attendance: false, finances: false, communication: false, pickup: false, consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false } }, children: [] };
    // No session on a token link — the token itself supplies the tenant.
    return { studentId: result.studentId, schoolId: result.schoolId, relationshipId: result.relationshipId, permissions: result.permissions, children: [] };
  }

  const user = await getAuthUser();
  const empty = { learningRecords: false, attendance: false, finances: false, communication: false, pickup: false, consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false } };
  if (!user || user.role !== "PARENT") return { studentId: null, schoolId: "", relationshipId: null, permissions: empty, children: [] };

  const children = await childrenOf(user);
  if (children.length === 0) return { studentId: null, schoolId: "", relationshipId: null, permissions: empty, children: [] };

  const requested = req.nextUrl.searchParams.get("studentId");
  if (requested) {
    const owned = children.find((c) => c.id === requested);
    // Asking for someone else's child resolves to nothing rather than
    // silently falling back to your own — a silent fallback would hide the
    // attempt and return data under a mismatched id.
    if (!owned) throw new AccessDenied("student", "view", user);
    const access = await currentGuardianRelationship({ schoolId: user.schoolId, studentId: owned.id, guardianUserId: user.userId });
    if (!access) throw new AccessDenied("student", "view", user);
    return { studentId: owned.id, schoolId: user.schoolId, relationshipId: access.id, permissions: access.permissions, children };
  }
  const access = await currentGuardianRelationship({ schoolId: user.schoolId, studentId: children[0].id, guardianUserId: user.userId });
  if (!access) throw new AccessDenied("student", "view", user);
  return { studentId: children[0].id, schoolId: user.schoolId, relationshipId: access.id, permissions: access.permissions, children };
}

/** Callback keeps capability-token tenant context alive through every query. */
export async function withParentScope<T>(req: NextRequest, fn: (scope: ResolvedParentScope) => Promise<T>): Promise<T> {
  const scope = await resolveParentScope(req);
  if (!scope.studentId) throw new AccessDenied("student", "view", { schoolId: scope.schoolId });
  return runWithTenantContext({ schoolId: scope.schoolId }, () => fn(scope));
}
