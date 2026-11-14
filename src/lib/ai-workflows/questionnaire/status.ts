import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveWorkspaceCampus } from "@/lib/school-ai/access";
import { aiWorkflowsAvailable } from "../flag";
import { inTenant } from "../jobs/actor";
import { TEACHER_QUESTIONNAIRE } from "./roles/teacher";
import { ADMIN_QUESTIONNAIRE, CAMPUS_ADMIN_QUESTIONNAIRE } from "./roles/operator";
import { STUDENT_QUESTIONNAIRE } from "./roles/student";
import { PARENT_QUESTIONNAIRE } from "./roles/parent";
import { ACCOUNTANT_QUESTIONNAIRE } from "./roles/accountant";
import { LIBRARIAN_QUESTIONNAIRE } from "./roles/librarian";
import { RECEPTIONIST_QUESTIONNAIRE } from "./roles/receptionist";
import { PRINCIPAL_QUESTIONNAIRE } from "./roles/principal";
import { GROUP_QUESTIONNAIRE } from "./roles/group";
import { OWNER_QUESTIONNAIRE } from "./roles/owner";
import type { QuestionnaireDefinition } from "./types";

// SKAI-1977: the first-login status read (GET /api/ai-workflows/questionnaire) sits on every landing page.
// It lives here, apart from service.ts, so that route never loads the capability registry, job-service,
// the planner or the OpenAI SDK. Keep this module free of ../registry, ../jobs/job-service and ../view.

/**
 * Per-user role questionnaires (ai_setup_responses). The definition always comes from the signed-in
 * user's live role; a URL key that does not match it is NOT_FOUND (red team RT14), so a teacher can
 * never open, answer or build another role's sheet.
 */
const DEFINITIONS: readonly QuestionnaireDefinition<any>[] = [TEACHER_QUESTIONNAIRE, ADMIN_QUESTIONNAIRE, CAMPUS_ADMIN_QUESTIONNAIRE, STUDENT_QUESTIONNAIRE, PARENT_QUESTIONNAIRE, ACCOUNTANT_QUESTIONNAIRE, LIBRARIAN_QUESTIONNAIRE, RECEPTIONIST_QUESTIONNAIRE, PRINCIPAL_QUESTIONNAIRE, GROUP_QUESTIONNAIRE, OWNER_QUESTIONNAIRE];

export function definitionForRole(role: string): QuestionnaireDefinition<any> | null {
  return DEFINITIONS.find(definition => definition.roles.includes(role as never)) ?? null;
}

// Families and students act on their own campus; the group owner and platform owner set up without one.
export async function setupCampus(user: AuthUser): Promise<string | null> {
  if (user.role === "PARENT" || user.role === "STUDENT") return user.campusId ?? null;
  if (user.role === "SUPER_ADMIN" || user.role === "APP_OWNER") return null;
  return resolveWorkspaceCampus(user, user.campusId);
}

/**
 * The first-login trigger (Appendix D defect 1): invited teachers arrive with onboardingComplete set,
 * so the prompt reads the per-user response instead. It backs off after three "Not now"s.
 */
export function setupStatus(user: AuthUser) {
  return inTenant(user, async () => {
    const definition = definitionForRole(user.role);
    if (!definition) return null;
    // With AI Workflows off for this school there is no sheet to offer (the earlier setup paths remain).
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { slug: true } });
    if (!(await aiWorkflowsAvailable(user, school?.slug)).ok) return { key: definition.key, status: "OFF", show: false };
    const response = await prisma.aiSetupResponse.findFirst({ where: { schoolId: user.schoolId, userId: user.userId, questionnaireKey: definition.key, campusId: await setupCampus(user) }, select: { status: true, deferrals: true, definitionVersion: true } });
    const status = response?.status ?? "NEW";
    const show = status === "NEW" || status === "DRAFT" || status === "PARTIAL" || status === "APPLYING" || (status === "DEFERRED" && (response?.deferrals ?? 0) < 3) || (status === "READY" && response!.definitionVersion < definition.version);
    return { key: definition.key, status, show };
  });
}
