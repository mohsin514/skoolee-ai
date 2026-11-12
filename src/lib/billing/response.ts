import { BillingAccessError, assertPlanFeature, assertSchoolOperational } from "@/lib/billing/entitlements";
import type { PlanFeature } from "@/config/plans";

export async function billingAccessResponse(schoolId: string) {
  try {
    await assertSchoolOperational(schoolId);
    return null;
  } catch (error) {
    const status = error instanceof Error && "status" in error && typeof error.status === "number"
      ? error.status
      : 500;

    return Response.json(
      { error: error instanceof Error ? error.message : "Billing access check failed" },
      { status }
    );
  }
}

/** The plan gate for routes with their own error shape: 403 `{ error, code: "PLAN_FEATURE" }`, or null when the plan includes it. */
export async function planFeatureResponse(user: { role: string; schoolId: string }, feature: PlanFeature) {
  try {
    await assertPlanFeature(user, feature);
    return null;
  } catch (error) {
    if (!(error instanceof BillingAccessError)) throw error;
    return Response.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
  }
}
