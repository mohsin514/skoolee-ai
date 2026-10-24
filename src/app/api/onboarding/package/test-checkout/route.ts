import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { settleVerifiedCheckoutIntent } from "@/lib/billing/checkout-intents";
import { assertSetupPurchaser, setupTenantContext } from "@/lib/onboarding/setup-service";
import { TEST_CHECKOUT_PROVIDER, testCheckoutEnabled } from "@/lib/payments/test-checkout";
import type { BillingPeriod } from "@/config/plans";
import type { PlanType } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  intentId: z.string().min(1),
  outcome: z.enum(["paid", "declined", "cancelled"]),
});

/**
 * Development-only: completes a TEST checkout intent the way a provider webhook
 * would. "paid" settles through the same path as a verified payment (plan
 * activation included); "declined" / "cancelled" end the attempt so Retry works.
 * 404 everywhere test checkout is not enabled.
 */
export async function POST(req: NextRequest) {
  try {
    if (!testCheckoutEnabled()) throw new ApiError("Not found", 404);
    const user = await requireAuthUser({ allowSuspended: true });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("Invalid test checkout request.", 400);
    const { intentId, outcome } = parsed.data;

    const intent = await runWithTenantContext(setupTenantContext(user), async () => {
      await assertSetupPurchaser(user);
      return prisma.onboardingCheckoutIntent.findFirst({ where: { id: intentId, schoolId: user.schoolId, provider: TEST_CHECKOUT_PROVIDER } });
    });
    if (!intent) throw new ApiError("Test checkout was not found.", 404);
    if (intent.status === "SETTLED") return Response.json({ success: true, status: "SETTLED" });

    if (outcome === "paid") {
      await settleVerifiedCheckoutIntent({
        id: intent.id,
        schoolId: user.schoolId,
        provider: TEST_CHECKOUT_PROVIDER,
        providerReference: intent.providerReference ?? intent.id,
        plan: intent.plan as PlanType,
        billingPeriod: intent.billingPeriod as BillingPeriod,
      });
      return Response.json({ success: true, status: "SETTLED" });
    }

    const status = outcome === "declined" ? "FAILED" : "CANCELLED";
    await runWithTenantContext(setupTenantContext(user), () => prisma.onboardingCheckoutIntent.updateMany({
      where: { id: intent.id, schoolId: user.schoolId, provider: TEST_CHECKOUT_PROVIDER, status: { in: ["CHECKOUT_PENDING", "PENDING_SETTLEMENT"] } },
      data: { status, failureReason: outcome === "declined" ? "Test payment declined (development test checkout)." : "Test checkout cancelled." },
    }));
    return Response.json({ success: true, status });
  } catch (error) {
    return errorResponse(error, "[onboarding-test-checkout] failed");
  }
}
