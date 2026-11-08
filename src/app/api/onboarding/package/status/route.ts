import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser, canPurchaseSubscription } from "@/lib/api/scope";
import { assertSetupPurchaser, setupTenantContext } from "@/lib/onboarding/setup-service";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { getPaymentConfig } from "@/lib/payments/gateway";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    const id = req.nextUrl.searchParams.get("intentId");
    if (!id) throw new ApiError("Checkout reference is required.", 400);
    // SKAI-157: refuse a non-purchaser before any lookup, so found/not-found never leaks to them.
    if (!user.onboardingComplete) await runWithTenantContext(setupTenantContext(user), () => assertSetupPurchaser(user));
    // After setup the institution authority's own subscription right decides (G6): the owner flag alone is never
    // enough (an ADMIN owner inside a school group is a campus operator).
    else if (!canPurchaseSubscription(user)) {
      throw new ApiError("Subscription purchasing is not delegated to this account.", 403);
    }
    const intent = await prisma.onboardingCheckoutIntent.findFirst({
      where: { id, schoolId: user.schoolId },
    });
    if (!intent) throw new ApiError("Checkout was not found.", 404);
    if (intent.userId !== user.userId && !canPurchaseSubscription(user)) {
      throw new ApiError("This checkout belongs to another buyer.", 403);
    }

    const [paymentConfig, ownerSettings, school] = await Promise.all([
      intent.provider === "BANK_TRANSFER" ? getPaymentConfig() : Promise.resolve(null),
      prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { preferredLanguage: true } }),
      prisma.school.findUnique({ where: { id: user.schoolId }, select: { status: true, subscriptionLifecycleState: true, graceEndsAt: true } }),
    ]);
    return Response.json({
      language: ownerSettings?.preferredLanguage || "en",
      bank: paymentConfig?.bank ?? null,
      // SKAI-161: lets the page show grace or expiry of an active package; only this school's own row.
      lifecycle: school ? { status: school.status, lifecycleState: school.subscriptionLifecycleState, graceEndsAt: school.graceEndsAt?.toISOString() ?? null } : null,
      checkedAt: new Date().toISOString(),
      intent: {
        id: intent.id,
        plan: intent.plan,
        billingPeriod: intent.billingPeriod,
        idempotencyKey: intent.idempotencyKey,
        provider: intent.provider,
        checkoutUrl: intent.checkoutUrl,
        status: intent.status,
        amount: intent.amount,
        currency: intent.currency,
        returnStep: intent.returnStep,
        expectedCampuses: intent.expectedCampuses,
        expectedEnrollment: intent.expectedEnrollment,
        failureReason: intent.failureReason,
        createdAt: intent.createdAt,
        settledAt: intent.settledAt,
      },
    });
  } catch (error) {
    return errorResponse(error, "[onboarding-package-status] lookup failed");
  }
}
