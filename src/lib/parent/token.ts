import { jwtVerify } from "jose";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { JWT_SECRET as SECRET } from "@/lib/auth/secret";

export async function verifyParentToken(
  token: string
): Promise<{ studentId: string; schoolId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.type !== "parent_portal" || typeof payload.studentId !== "string") {
      return null;
    }

    const studentId = payload.studentId;
    if (typeof payload.schoolId !== "string" || !payload.schoolId) return null;
    // Capability is single-child and single-school; validate its target on every use.
    const student = await runUnscoped("validate signed parent capability target", () => prisma.student.findFirst({
      where: { id: studentId, schoolId: payload.schoolId as string, status: "active", campus: { school: { status: { in: ["ACTIVE", "TRIAL"] } } } },
      select: { schoolId: true },
    }));
    return student ? { studentId, schoolId: student.schoolId } : null;
  } catch {
    return null;
  }
}
