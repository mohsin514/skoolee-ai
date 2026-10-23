import { CURRENT_AI_RELEASE_EVALUATION } from "@/config/ai-release-evaluation";
import { prisma } from "@/lib/db/prisma";

/**
 * Practice mode (control P1). Until an educator-reviewed evaluation is recorded (SKO-494), AI
 * Workflows may not change a real school's records in production: steps show what they would do and
 * end "Example · not saved". Synthetic demo tenants listed in AI_WORKFLOWS_LIVE_SCHOOLS (comma-separated
 * slugs) stay live, as do development and test environments. Never invent an evaluation to lift it.
 */
export function practiceModeApplies(schoolSlug: string | null | undefined, env: Record<string, string | undefined> = process.env, evaluation: unknown = CURRENT_AI_RELEASE_EVALUATION): boolean {
  if (env.NODE_ENV !== "production" || evaluation) return false;
  const live = new Set((env.AI_WORKFLOWS_LIVE_SCHOOLS ?? "").split(",").map(slug => slug.trim()).filter(Boolean));
  return !schoolSlug || !live.has(schoolSlug);
}

export async function isPracticeSchool(schoolId: string) {
  if (process.env.NODE_ENV !== "production" || CURRENT_AI_RELEASE_EVALUATION) return false;
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { slug: true } });
  return practiceModeApplies(school?.slug);
}
