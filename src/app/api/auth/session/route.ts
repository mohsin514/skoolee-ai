import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session-cookie";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { dashboardPathForRole, roleLabel } from "@/lib/roles";
import { candidateExamBoundary } from "@/lib/school-ai/exam-boundary-service";
import { candidateExamUrl } from "@/lib/school-ai/exam-boundary";
import { loadPermissionMap } from "@/lib/permissions";
import { draftAuthorizationFingerprint } from "@/lib/drafts/scope";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ user: null, activeExamUrl: null }, { status: 401, headers: noStore });
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { fullName: true, email: true, phone: true, profileImageUrl: true, isActive: true, schoolId: true, role: true, campusId: true },
    });

    if (!profile?.isActive || profile.schoolId !== user.schoolId || profile.role !== user.role || profile.campusId !== user.campusId) return NextResponse.json({ user: null, activeExamUrl: null }, { status: 401, headers: noStore });

    // SKO-479: the signed-in scope by name, so every workspace can show which school and campus an action affects.
    const [school, campus] = await Promise.all([
      prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true } }),
      user.campusId ? prisma.campus.findFirst({ where: { id: user.campusId, schoolId: user.schoolId }, select: { name: true } }) : null,
    ]);
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const draftAuthorization = draftAuthorizationFingerprint(user, await loadPermissionMap(user.schoolId, user.role));
    const activeExam = user.role === "STUDENT" ? await candidateExamBoundary(user) : null;
    return NextResponse.json({
      activeExamUrl: activeExam ? candidateExamUrl(activeExam.assignmentId) : null,
      user: {
        id: user.userId,
        schoolId: user.schoolId,
        // A purpose-scoped digest is not a bearer credential. New logins cannot recover old drafts.
        draftScope: token ? hashSessionToken(`device-draft:${token}:${user.schoolId}:${user.campusId}:${user.role}:${draftAuthorization}`) : null,
        email: profile?.email || user.email,
        fullName: profile?.fullName || user.fullName || user.email,
        phone: profile?.phone || "",
        profileImageUrl: profile?.profileImageUrl || "",
        role: user.role,
        roleLabel: roleLabel(user.role),
        dashboardPath: dashboardPathForRole(user.role),
        schoolName: school?.name ?? null,
        campusName: campus?.name ?? null,
      },
    }, { headers: noStore });
  } catch (error) {
    console.error("[auth/session] GET failed", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500, headers: noStore });
  }
}
