import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser, canPurchaseSubscription } from "@/lib/api/scope";
import { assertOnboardingOwner } from "@/lib/billing/checkout-intents";
import { getPaymentConfig } from "@/lib/payments/gateway";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    const id = req.nextUrl.searchParams.get("intentId");
    if (!id) throw new ApiError("Checkout reference is required.", 400);
    const intent = await prisma.onboardingCheckoutIntent.findFirst({
      where: { id, schoolId: user.schoolId },
    });
    if (!intent) throw new ApiError("Checkout was not found.", 404);

    if (!user.isInstitutionOwner && !canPurchaseSubscription(user)) {
      throw new ApiError("Subscription purchasing is not delegated to this account.", 403);
    }
    if (!user.onboardingComplete) assertOnboardingOwner(user);
    if (intent.userId !== user.userId && !canPurchaseSubscription(user)) {
      throw new ApiError("This checkout belongs to another buyer.", 403);
    }

    const [paymentConfig, ownerSettings] = await Promise.all([
      intent.provider === "BANK_TRANSFER" ? getPaymentConfig() : Promise.resolve(null),
      prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { preferredLanguage: true } }),
    ]);
    return Response.json({
      language: ownerSettings?.preferredLanguage || "en",
      bank: paymentConfig?.bank ?? null,
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
