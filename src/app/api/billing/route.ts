import { NextRequest } from "next/server";
import { ApiError, canManageSubscription, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { getBillingSnapshot } from "@/lib/billing/entitlements";

/**
 * The SkooleeAI subscription snapshot for the payer (§7.2 G8).
 *
 * "Billing" here is the school's software contract, never family tuition: tuition lives under /api/fees. Only the
 * institution authority who owns the account (or an authority-role purchase delegate) reads it — the same
 * `canOwnSubscription` predicate that shows Billing & plan in their navigation. Allowed while suspended so the
 * payer can recover.
 */
export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canManageSubscription(user)) throw new ApiError("The SkooleeAI subscription is managed by the account owner.", 403);
    const billing = await getBillingSnapshot(user.schoolId);
    return Response.json({ success: true, billing: { ...billing, canPurchaseSubscription: true } });
  } catch (error) {
    return errorResponse(error, "[billing] GET failed");
  }
}

/** Tuition writes moved to /api/fees (fee setup, invoices, payments). This endpoint never wrote the subscription. */
export async function POST(_req: NextRequest) {
  return Response.json(
    { error: "Fee setup, invoices and payments moved. Use /api/fees.", code: "MOVED_TO_FEES" },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}
