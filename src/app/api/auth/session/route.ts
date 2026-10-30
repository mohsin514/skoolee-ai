import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session-cookie";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { dashboardPathForRole, roleLabelFor } from "@/lib/roles";
import { institutionKindOf, isInstitutionAuthority, isStandaloneOwner, kindFor } from "@/lib/auth/institution";
import { getInstitutionContacts } from "@/lib/auth/institution-server";
import { candidateExamBoundary } from "@/lib/school-ai/exam-boundary-service";
import { candidateExamUrl } from "@/lib/school-ai/exam-boundary";
import { loadPermissionMap } from "@/lib/permissions";
import { draftAuthorizationFingerprint } from "@/lib/drafts/scope";
import { getDisplayLocale } from "@/lib/locale/display";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ user: null, activeExamUrl: null }, { status: 401, headers: noStore });
    }

    // SKO-484: the caller's own row, matched on id and school. A standalone owner has no campus until setup
    // activates one, and the campus guard would refuse that read; scoping it to the signed-in identity
    // keeps it as narrow as the guard while serving every valid session.
    const profile = await runUnscoped("session: the signed-in user's own profile", () => prisma.user.findFirst({
      where: { id: user.userId, schoolId: user.schoolId },
      select: { fullName: true, email: true, phone: true, profileImageUrl: true, isActive: true, schoolId: true, role: true, campusId: true },
    }));

    if (!profile?.isActive || profile.schoolId !== user.schoolId || profile.role !== user.role || profile.campusId !== user.campusId) return NextResponse.json({ user: null, activeExamUrl: null }, { status: 401, headers: noStore });

    // SKO-479: the signed-in scope by name, so every workspace can show which school and campus an action affects.
    const [school, campus] = await Promise.all([
      prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, logoUrl: true } }),
      user.campusId ? prisma.campus.findFirst({ where: { id: user.campusId, schoolId: user.schoolId }, select: { name: true, logoUrl: true } }) : null,
    ]);
    // §1.5: who leads and who pays, by name only (never an email). Families and the platform operator get no names.
    // One user read: the resolved session already carries the kind, so no school lookup runs (about ten client
    // components fetch this route).
    const namesVisible = !["PARENT", "STUDENT", "APP_OWNER"].includes(user.role);
    const { authorities, subscriptionOwners: payers } = namesVisible
      ? await getInstitutionContacts(user.schoolId, { kind: kindFor(user) ?? undefined }).catch(() => ({ authorities: [], subscriptionOwners: [] }))
      : { authorities: [], subscriptionOwners: [] };
    // §1.5: the label in the viewer's display language (personal → campus → school → en; never throws).
    const { language } = await getDisplayLocale(user);
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
        // The access cache key's version (addendum 2026-10-22 §3): a membership or permission change bumps it.
        accessVersion: user.accessVersion ?? 0,
        // Campus logo, else school logo — what the console sidebar shows; RoleFrame's fallback for frames that pass none.
        logoUrl: campus?.logoUrl || school?.logoUrl || null,
        // §1.5 roleLabelFor(user, lang): ready to show as is. roleLabelKey is the EN key (role-ux p1 messages) for a
        // client that re-translates after a language switch without refetching the session.
        roleLabel: roleLabelFor(user, language),
        roleLabelKey: roleLabelFor(user),
        dashboardPath: dashboardPathForRole(user.role),
        schoolName: school?.name ?? null,
        campusName: campus?.name ?? null,
        institution: {
          kind: kindFor(user) ?? institutionKindOf({}),
          isAuthority: isInstitutionAuthority(user),
          standaloneOwner: isStandaloneOwner(user),
          isOwner: user.isInstitutionOwner === true,
          schoolName: school?.name ?? null,
          authorityName: namesVisible ? authorities[0]?.fullName ?? null : null,
          subscriptionOwnerName: namesVisible ? payers[0]?.fullName ?? null : null,
        },
      },
    }, { headers: noStore });
  } catch (error) {
    console.error("[auth/session] GET failed", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500, headers: noStore });
  }
}
