import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { requireAuthUser, errorResponse, ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { loadPermissionMap } from "@/lib/permissions";
import { launchPlan } from "@/lib/onboarding/launch-plan";
import { candidateExamBoundary } from "@/lib/school-ai/exam-boundary-service";
import { getDisplayLocale } from "@/lib/locale/display";
import { needsInstitutionSetup } from "@/lib/onboarding/setup-routing";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await requireAuthUser();
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
    return Response.json({ context: {
      ...launchPlan({ role: user.role, campusId: user.campusId, onboardingComplete: account.onboardingComplete, institutionSetup, permissions }),
      userId: user.userId, role: user.role, fullName: account.fullName, schoolName: school?.name ?? "",
      campusName: campus?.name ?? null, language: locale.language, completed: Boolean(account.welcomeCompletedAt),
    } }, { headers });
  } catch (error) { return errorResponse(error, "Unable to load your welcome guide."); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    // Idempotent acknowledgement; never accept a user ID, role, campus or setup status from the browser.
    await runUnscoped("welcome: acknowledge only the authenticated account", () => prisma.user.updateMany({
      where: { id: user.userId, schoolId: user.schoolId, isActive: true, mustChangePassword: false, welcomeCompletedAt: null },
      data: { welcomeCompletedAt: new Date() },
    }));
    return Response.json({ ok: true }, { headers });
  } catch (error) { return errorResponse(error, "Unable to save your welcome preference."); }
}
