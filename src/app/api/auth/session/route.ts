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
import { createTtlMemo } from "@/lib/cache/ttl-memo";

/** Names of who leads and who pays, shown in the shell: display only, so shared per school for 60 s. */
const institutionContacts = createTtlMemo({ ttlMs: 60_000 });
import { isDatabaseUnavailable, ServiceUnavailableError, unavailableReason } from "@/lib/db/availability";

const noStore = { "Cache-Control": "private, no-store" };

type SessionRow = {
  fullName: string; email: string; phone: string | null; profileImageUrl: string | null; isActive: boolean; schoolId: string; role: string; campusId: string | null;
  schoolName: string; schoolLogoUrl: string | null; campusSchoolId: string | null; campusName: string | null; campusLogoUrl: string | null; campusArchivedAt: Date | null;
};

export async function GET() {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ user: null, activeExamUrl: null }, { status: 401, headers: noStore });
    }

    // SKO-484: the caller's own row, matched on id and school. A standalone owner has no campus until setup
    // activates one, and the campus guard would refuse that read; scoping it to the signed-in identity
    // keeps it as narrow as the guard while serving every valid session.
    // Scale: profile, campus status and the school/campus names in ONE read (was four queries on every page load).
    // Same rules as before: the caller's own row by id and school, its campus must belong to the school.
    const [row] = await runUnscoped("session: the signed-in user's own profile", () => prisma.$queryRaw<SessionRow[]>`
      SELECT u.full_name AS "fullName", u.email, u.phone, u.profile_image_url AS "profileImageUrl", u.is_active AS "isActive",
             u.school_id AS "schoolId", u.role::text AS role, u.campus_id AS "campusId",
             s.name AS "schoolName", s.logo_url AS "schoolLogoUrl",
             c.school_id AS "campusSchoolId", c.name AS "campusName", c.logo_url AS "campusLogoUrl", c.archived_at AS "campusArchivedAt"
      FROM users u
      JOIN schools s ON s.id = u.school_id
      LEFT JOIN campuses c ON c.id = u.campus_id
      WHERE u.id = ${user.userId} AND u.school_id = ${user.schoolId}
      LIMIT 1`);
    const profile = row ?? null;

    if (!profile?.isActive || profile.schoolId !== user.schoolId || profile.role !== user.role || profile.campusId !== user.campusId) return NextResponse.json({ user: null, activeExamUrl: null }, { status: 401, headers: noStore });
    // SKAI-1361: a session bound to an archived campus (or one outside the school) is no longer usable.
    const campusUsable = profile.campusSchoolId === user.schoolId && profile.campusArchivedAt === null;
    if (profile.campusId && !campusUsable) return NextResponse.json({ user: null, activeExamUrl: null }, { status: 401, headers: noStore });

    // SKO-479: the signed-in scope by name, so every workspace can show which school and campus an action affects.
    const school = { name: profile.schoolName, logoUrl: profile.schoolLogoUrl };
    const campus = user.campusId && profile.campusSchoolId === user.schoolId ? { name: profile.campusName, logoUrl: profile.campusLogoUrl } : null;
    // §1.5: who leads and who pays, by name only (never an email). Families and the platform operator get no names.
    // One user read: the resolved session already carries the kind, so no school lookup runs (about ten client
    // components fetch this route).
    const namesVisible = !["PARENT", "STUDENT", "APP_OWNER"].includes(user.role);
    const { authorities, subscriptionOwners: payers } = namesVisible
      ? await institutionContacts.get(JSON.stringify([user.schoolId, kindFor(user) ?? null]), () => getInstitutionContacts(user.schoolId, { kind: kindFor(user) ?? undefined })).catch(() => ({ authorities: [], subscriptionOwners: [] }))
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
    if (error instanceof ServiceUnavailableError || isDatabaseUnavailable(error)) {
      const reason = unavailableReason(error);
      console.warn("[auth/session] database unavailable", { reason });
      return NextResponse.json({ error: "The service is busy. Please try again in a moment.", code: "SERVICE_UNAVAILABLE" }, { status: 503, headers: { ...noStore, "Retry-After": "5", "x-db-unavailable": reason } });
    }
    console.error("[auth/session] GET failed", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500, headers: noStore });
  }
}
