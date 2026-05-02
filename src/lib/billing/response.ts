import { assertSchoolOperational } from "@/lib/billing/entitlements";

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
