/**
 * Synthetic demo tenants (LEAP, Slice 9). A school whose slug is listed here holds synthetic people and
 * records only; the AI screens show a "Demo school · synthetic data" badge for it. Listing a slug here
 * changes nothing else: it is not a practice-mode or evaluation switch (rule 12 / SKO-494).
 *
 * - al-noor-grammar-demo: scripts/demo/seed-ai-workflows-demo.ts (the five-minute AI Workflows arc).
 * - skoolee-demo-synthetic: scripts/demo/reset-demo-tenant.ts (the Cedar Exam Studio demo).
 */
export const AL_NOOR_DEMO_SLUG = "al-noor-grammar-demo";
export const DEMO_SCHOOL_SLUGS: readonly string[] = [AL_NOOR_DEMO_SLUG, "skoolee-demo-synthetic"];

export const isDemoSchool = (slug: string | null | undefined) => Boolean(slug) && DEMO_SCHOOL_SLUGS.includes(slug!);

/**
 * Free-form runs the demo seed recorded carry this idempotency-key prefix (the questionnaire Build keeps
 * its own `setup-…` key, so the seed's manifest names that job by id). They ran through the real services;
 * only the planner's model call was a recorded stand-in, logged with the model name below and zero tokens.
 */
export const RECORDED_RUN_PREFIX = "demo-recorded-";
export const RECORDED_PLANNER_MODEL = "demo-recorded:planner-stand-in";

export const isRecordedDemoRun = (job: { idempotencyKey: string }) => job.idempotencyKey.startsWith(RECORDED_RUN_PREFIX);
