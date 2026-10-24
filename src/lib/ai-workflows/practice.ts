import { CURRENT_AI_RELEASE_EVALUATION } from "@/config/ai-release-evaluation";
import { prisma } from "@/lib/db/prisma";

/**
 * Practice mode (control P1). Until an educator-reviewed evaluation is recorded (SKO-494), AI
 * Workflows may not change a real school's records in production: steps show what they would do and
 * end "Example · not saved". A school stays live when an APP_OWNER switched it on in the platform
 * console (`School.aiWorkflowsLiveAt`, passed here as `liveSince`), or when its slug is listed in
 * AI_WORKFLOWS_LIVE_SCHOOLS (comma-separated; the older fallback for synthetic demo tenants).
 * Development and test environments are always live. Never invent an evaluation to lift it.
 */
export function practiceModeApplies(schoolSlug: string | null | undefined, env: Record<string, string | undefined> = process.env, evaluation: unknown = CURRENT_AI_RELEASE_EVALUATION, liveSince: Date | string | null = null): boolean {
  if (env.NODE_ENV !== "production" || evaluation) return false;
  if (liveSince) return false;
  const live = new Set((env.AI_WORKFLOWS_LIVE_SCHOOLS ?? "").split(",").map(slug => slug.trim()).filter(Boolean));
  return !schoolSlug || !live.has(schoolSlug);
}

export async function isPracticeSchool(schoolId: string, env: Record<string, string | undefined> = process.env, evaluation: unknown = CURRENT_AI_RELEASE_EVALUATION) {
  if (env.NODE_ENV !== "production" || evaluation) return false;
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { slug: true, aiWorkflowsLiveAt: true } });
  return practiceModeApplies(school?.slug, env, evaluation, school?.aiWorkflowsLiveAt);
}
