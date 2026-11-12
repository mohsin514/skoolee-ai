/**
 * AI_WORKFLOWS_V2 rollout flag (per school). Unset: on outside production, off in production.
 * "all" (or "true"/"1"/"on") turns it on everywhere; "off" (or "false"/"0") turns it off everywhere; otherwise a comma-separated list of
 * school slugs. Turning it off drains (control P16): no new jobs start; existing jobs and hand-offs finish.
 */
export function aiWorkflowsV2Enabled(schoolSlug: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const value = env.AI_WORKFLOWS_V2?.trim();
  if (!value) return env.NODE_ENV !== "production";
  // "true"/"1" are what people type into a hosting dashboard; they mean everyone, like "all".
  if (["all", "true", "1", "on"].includes(value.toLowerCase())) return true;
  if (["off", "false", "0"].includes(value.toLowerCase())) return false;
  return Boolean(schoolSlug) && value.split(",").map(slug => slug.trim()).includes(schoolSlug!);
}

/**
 * AI Workflows run only when the rollout flag is on for the school AND its plan includes them (Flagship and
 * up). Off either way, nothing new starts; jobs already running drain as before. The platform operator has
 * no school plan.
 */
export async function aiWorkflowsAvailable(user: { role: string; schoolId: string }, schoolSlug: string | null | undefined) {
  if (!aiWorkflowsV2Enabled(schoolSlug)) return { ok: false as const, code: "NOT_CONNECTED" as const };
  if (user.role === "APP_OWNER") return { ok: true as const };
  const { schoolPlanFeatures } = await import("@/lib/billing/entitlements");
  return (await schoolPlanFeatures(user.schoolId)).aiWorkflowsEnabled ? { ok: true as const } : { ok: false as const, code: "PLAN_FEATURE" as const };
}
