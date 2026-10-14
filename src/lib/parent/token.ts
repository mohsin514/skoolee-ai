import { jwtVerify } from "jose";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { JWT_SECRET as SECRET } from "@/lib/auth/secret";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { currentGuardianRelationship, type GuardianPermissions } from "@/lib/parent/guardian-access";

export async function verifyParentToken(
  token: string
): Promise<{ studentId: string; schoolId: string; relationshipId: string; permissions: GuardianPermissions } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.type !== "parent_portal" || typeof payload.studentId !== "string" || typeof payload.relationshipId !== "string" || typeof payload.guardianUserId !== "string") {
      return null;
    }

    const studentId = payload.studentId;
    if (typeof payload.schoolId !== "string" || !payload.schoolId) return null;
    // Capability is single-child and single-school; validate its target on every use.
    const student = await runUnscoped("validate signed parent capability target", () => prisma.student.findFirst({
      where: { id: studentId, schoolId: payload.schoolId as string, status: "active", campus: { school: { status: { in: ["ACTIVE", "TRIAL"] } } } },
      select: { schoolId: true },
    }));
    if (!student) return null;
    const relation = await runWithTenantContext({ schoolId: student.schoolId }, () => currentGuardianRelationship({
      schoolId: student.schoolId, studentId, guardianUserId: payload.guardianUserId as string,
      relationshipId: payload.relationshipId as string,
    }));
    if (!relation || !Object.values(relation.permissions.consents).some(Boolean) && !Object.entries(relation.permissions).some(([key, value]) => key !== "consents" && value === true)) return null;
    return { studentId, schoolId: student.schoolId, relationshipId: relation.id, permissions: relation.permissions };
  } catch {
    return null;
  }
}
