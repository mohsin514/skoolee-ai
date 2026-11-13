/** SKAI-1941: a 403 PLAN_FEATURE is a plan limit, not a failed load; retrying cannot change it. */
export const loadFailureKind = (e: unknown): "plan" | "error" => (e as { code?: unknown } | null)?.code === "PLAN_FEATURE" ? "plan" : "error";
