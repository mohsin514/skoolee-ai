import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { requireAuthUser, errorResponse, ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { loadPermissionMap } from "@/lib/permissions";
import { launchPlan } from "@/lib/onboarding/launch-plan";
import { candidateExamBoundary } from "@/lib/school-ai/exam-boundary-service";
import { getDisplayLocale } from "@/lib/locale/display";
import { needsInstitutionSetup } from "@/lib/onboarding/setup-routing";
import { canOwnSubscription } from "@/lib/auth/institution";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    // Like profile and tour preferences, this is the caller's own identity.
    // It must not bounce a platform operator out of a suspended institution.
    const user = await requireAuthUser({ allowSuspended: true });
    // Own identity only. New institution owners have no campus yet.
    const account = await runUnscoped("welcome: read only the authenticated account", () => prisma.user.findFirst({
      where: { id: user.userId, schoolId: user.schoolId, isActive: true },
      select: { fullName: true, welcomeCompletedAt: true, onboardingComplete: true, mustChangePassword: true },
    }));
    if (!account) throw new ApiError("Unauthorized", 401);
    if (account.mustChangePassword || user.role === "STUDENT" && await candidateExamBoundary(user)) return Response.json({ context: null }, { headers });
    const [school, campus, permissions, locale, institutionSetup] = await Promise.all([
      prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true } }),
      user.campusId ? prisma.campus.findFirst({ where: { id: user.campusId, schoolId: user.schoolId }, select: { name: true } }) : null,
      loadPermissionMap(user.schoolId, user.role),
      getDisplayLocale(user),
      !account.onboardingComplete ? needsInstitutionSetup(user.userId, user.schoolId) : false,
    ]);
    // The kind and the caller's own subscription right make the story kind-aware from the server (the standalone
    // owner's "Review school" task, billing told only to the payer); unknown kind stays undefined and fails closed.
    const institutionKind = user.institutionKind;
    return Response.json({ context: {
      ...launchPlan({ role: user.role, campusId: user.campusId, onboardingComplete: account.onboardingComplete, institutionSetup, permissions, institutionKind }),
      userId: user.userId, role: user.role, fullName: account.fullName, schoolName: school?.name ?? "",
      campusName: campus?.name ?? null, language: locale.language, completed: Boolean(account.welcomeCompletedAt),
      ...(institutionKind ? { institutionKind, billing: canOwnSubscription(user) } : {}),
    } }, { headers });
  } catch (error) { return errorResponse(error, "Unable to load your welcome guide."); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser({ allowSuspended: true });
    // Idempotent acknowledgement; never accept a user ID, role, campus or setup status from the browser.
    await runUnscoped("welcome: acknowledge only the authenticated account", () => prisma.user.updateMany({
      where: { id: user.userId, schoolId: user.schoolId, isActive: true, mustChangePassword: false, welcomeCompletedAt: null },
      data: { welcomeCompletedAt: new Date() },
    }));
    return Response.json({ ok: true }, { headers });
  } catch (error) { return errorResponse(error, "Unable to save your welcome preference."); }
}
