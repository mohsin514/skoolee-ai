/**
 * AI_WORKFLOWS_V2 rollout flag (per school). Unset: on outside production, off in production.
 * "all" turns it on everywhere; "off" turns it off everywhere; otherwise a comma-separated list of
 * school slugs. Turning it off drains (control P16): no new jobs start; existing jobs and hand-offs finish.
 */
export function aiWorkflowsV2Enabled(schoolSlug: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const value = env.AI_WORKFLOWS_V2?.trim();
  if (!value) return env.NODE_ENV !== "production";
  if (value === "all") return true;
  if (value === "off") return false;
  return Boolean(schoolSlug) && value.split(",").map(slug => slug.trim()).includes(schoolSlug!);
}
