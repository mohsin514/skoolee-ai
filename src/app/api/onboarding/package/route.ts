import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse, ApiError } from "@/lib/api/scope";
import {
  assertOnboardingOwner,
  checkoutAmount,
  createCheckoutIntent,
  onboardingCheckoutSchema,
  packageContract,
  periodPrice,
} from "@/lib/billing/checkout-intents";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { COMMERCIAL_CONTRACT, encodePlanContractMetadata } from "@/config/commercial-contract";
import { COMMERCIAL_CATALOG_VERSION, type BillingPeriod } from "@/config/plans";
import { getPaymentConfig } from "@/lib/payments/gateway";
import { getPriceId, stripe, verifyStripePrice } from "@/lib/stripe/server";
import { createSafePayOrder } from "@/lib/payments/safepay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    assertOnboardingOwner(user);
    const billing = await getBillingSnapshot(user.schoolId);
    const details = Object.fromEntries(
      Object.entries(billing.plans).map(([key, plan]) => [key, {
        type: plan.type,
        name: plan.name,
        price: plan.price,
        priceLabel: plan.priceLabel,
        features: plan.features,
        maxStudents: plan.maxStudents,
        maxTeachers: plan.maxTeachers,
        maxCampuses: plan.maxCampuses,
        aiCredits: plan.aiCredits,
        isCustom: plan.isCustom ?? false,
      }])
    );
    const paymentConfig = await getPaymentConfig();
    const ownerSettings = await prisma.user.findFirst({
      where: { id: user.userId, schoolId: user.schoolId },
      select: { preferredLanguage: true },
    });
    const methods = [
      stripe && paymentConfig.availableMethods.includes("stripe") ? "stripe" : null,
      process.env.SAFEPAY_MERCHANT_ID && process.env.SAFEPAY_API_KEY && process.env.SAFEPAY_SECRET_KEY ? "safepay" : null,
      paymentConfig.bank?.bankName ? "bank_transfer" : null,
    ].filter((method): method is string => Boolean(method));

    return Response.json({
      plans: details,
      currentPlan: billing.school.plan,
      regionalCurrency: billing.regionalCurrency,
      priceCurrency: "PKR",
      catalogueVersion: COMMERCIAL_CATALOG_VERSION,
      commercialTermsVersion: COMMERCIAL_CONTRACT.version,
      regionalPriceDisclosure: COMMERCIAL_CONTRACT.regionalPriceDisclosure,
      paymentMethods: methods,
      bank: methods.includes("bank_transfer") ? paymentConfig.bank : null,
      language: ownerSettings?.preferredLanguage || "en",
    });
  } catch (error) {
    return errorResponse(error, "[onboarding-package] catalogue failed");
  }
}

export async function POST(req: NextRequest) {
  let activeIntentId: string | null = null;
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    assertOnboardingOwner(user);

    const parsed = onboardingCheckoutSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const billing = await getBillingSnapshot(user.schoolId);
    const plan = parsed.data.plan;
    const planDetails = billing.plans[plan];
    const contract = packageContract(plan, planDetails);
    let intent = await createCheckoutIntent(user, parsed.data, contract);
    activeIntentId = intent.id;
    if (["FAILED", "CANCELLED"].includes(intent.status)) {
      const reset = await prisma.onboardingCheckoutIntent.updateMany({
        where: { id: intent.id, schoolId: user.schoolId, userId: user.userId, status: { in: ["FAILED", "CANCELLED"] } },
        data: { status: "PENDING", provider: "NONE", providerReference: null, checkoutUrl: null, failureReason: null, settledAt: null },
      });
      if (reset.count) {
        const refreshed = await prisma.onboardingCheckoutIntent.findUnique({ where: { id: intent.id } });
        if (refreshed) intent = refreshed;
      }
    }
    const selectedContract = intent.contractSnapshot as typeof contract;

    if (intent.status === "SETTLED") {
      return Response.json({ success: true, intentId: intent.id, status: intent.status, returnStep: intent.returnStep });
    }
    if (intent.status === "CREATING_CHECKOUT") {
      return Response.json({ success: true, intentId: intent.id, status: intent.status, returnStep: intent.returnStep });
    }
    if (intent.status === "FREE_SELECTED") {
      return Response.json({ success: true, intentId: intent.id, status: intent.status, returnStep: intent.returnStep });
    }
    if (intent.status === "CUSTOM_QUOTE") {
      return Response.json({ success: true, intentId: intent.id, status: intent.status, returnStep: intent.returnStep });
    }
    if (intent.checkoutUrl) {
      return Response.json({ success: true, intentId: intent.id, status: intent.status, url: intent.checkoutUrl });
    }
    if (intent.status === "FAILED" || intent.status === "CANCELLED") {
      throw new ApiError("This checkout attempt has ended. Retry with a new selection key.", 409);
    }

    const paymentConfig = await getPaymentConfig();
    const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const statusUrl = `${appBase}/onboarding/package/status?intentId=${encodeURIComponent(intent.id)}`;

    const stripePriceId = plan === "BASIC" || plan === "PRO" ? getPriceId(plan, parsed.data.billingPeriod) : "";
    const canUseStripe = Boolean(
      stripe && paymentConfig.availableMethods.includes("stripe") && stripePriceId
    );
    const canUseSafePay = Boolean(
      process.env.SAFEPAY_MERCHANT_ID && process.env.SAFEPAY_API_KEY && process.env.SAFEPAY_SECRET_KEY
    );
    const canUseBank = Boolean(paymentConfig.bank?.bankName);

    const provider = intent.provider !== "NONE"
      ? intent.provider
      : canUseStripe ? "STRIPE" : canUseSafePay ? "SAFEPAY" : canUseBank ? "BANK_TRANSFER" : null;
    if (!provider) {
      await prisma.onboardingCheckoutIntent.update({
        where: { id: intent.id },
        data: { status: "FAILED", failureReason: "No payment method is currently configured." },
      });
      throw new ApiError("Paid checkout is not currently available. You can continue with the free package or request a custom quote.", 503);
    }

    if (provider === "STRIPE") {
      const amount = checkoutAmount(selectedContract, parsed.data.billingPeriod as BillingPeriod);
      try {
        await verifyStripePrice(stripePriceId, plan, parsed.data.billingPeriod, selectedContract.price);
      } catch (error) {
        throw new ApiError(error instanceof Error ? error.message : "Stripe price validation failed", 503);
      }

      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { id: true, name: true, contactEmail: true, stripeCustomerId: true },
      });
      if (!school) throw new ApiError("School not found", 404);
      const customerId = school.stripeCustomerId || await (async () => {
        const customer = await stripe!.customers.create({
          email: school.contactEmail,
          name: school.name,
          metadata: { schoolId: school.id },
        }, { idempotencyKey: `sko-221-customer-${school.id}` });
        await prisma.school.update({ where: { id: school.id }, data: { stripeCustomerId: customer.id } });
        return customer.id;
      })();

      let claim = await prisma.onboardingCheckoutIntent.updateMany({
        where: { id: intent.id, status: "PENDING", provider: "NONE" },
        data: { provider: "STRIPE", providerReference: intent.id, status: "CREATING_CHECKOUT" },
      });
      if (!claim.count && intent.status === "PENDING_SETTLEMENT" && intent.provider === "STRIPE" && intent.providerReference === intent.id) {
        claim = await prisma.onboardingCheckoutIntent.updateMany({
          where: { id: intent.id, status: "PENDING_SETTLEMENT", provider: "STRIPE", providerReference: intent.id },
          data: { status: "CREATING_CHECKOUT" },
        });
      }
      if (!claim.count) {
        const latest = await prisma.onboardingCheckoutIntent.findUnique({ where: { id: intent.id } });
        return Response.json({ success: true, intentId: intent.id, status: latest?.status ?? "PENDING", returnStep: intent.returnStep });
      }

      let session: Awaited<ReturnType<NonNullable<typeof stripe>["checkout"]["sessions"]["create"]>>;
      try {
        session = await stripe!.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: stripePriceId, quantity: 1 }],
        client_reference_id: school.id,
        success_url: `${statusUrl}&return=success`,
        cancel_url: `${statusUrl}&return=cancelled`,
        metadata: {
          checkoutIntentId: intent.id,
          schoolId: school.id,
          plan,
          billingPeriod: parsed.data.billingPeriod,
        },
        subscription_data: {
          metadata: {
            checkoutIntentId: intent.id,
            schoolId: school.id,
            plan,
            billingPeriod: parsed.data.billingPeriod,
          },
          ...(paymentConfig.stripe?.connectedAccountId
            ? { transfer_data: { destination: paymentConfig.stripe.connectedAccountId } }
            : {}),
        },
        }, { idempotencyKey: `sko-221-checkout-${intent.id}` });
      } catch (error) {
        await prisma.onboardingCheckoutIntent.updateMany({
          where: { id: intent.id, provider: "STRIPE", providerReference: intent.id, status: "CREATING_CHECKOUT" },
          data: { status: "PENDING_SETTLEMENT", failureReason: "Checkout creation is being reconciled. Retry will reuse this intent." },
        });
        return Response.json({
          error: error instanceof Error ? error.message : "Checkout creation is being reconciled.",
          intentId: intent.id, status: "PENDING_SETTLEMENT",
        }, { status: 502 });
      }
      if (!session.url) throw new ApiError("Stripe did not return a checkout URL", 502);
      await prisma.onboardingCheckoutIntent.update({
        where: { id: intent.id },
        data: { providerReference: session.id, checkoutUrl: session.url, amount, currency: "PKR", status: "CHECKOUT_PENDING", failureReason: null },
      });
      return Response.json({ success: true, intentId: intent.id, status: "CHECKOUT_PENDING", url: session.url });
    }

    if (provider === "SAFEPAY") {
      const orderRef = intent.provider === "SAFEPAY" && intent.providerReference
        ? intent.providerReference
        : `SKO-${randomUUID()}`.toUpperCase();
      let claim = await prisma.onboardingCheckoutIntent.updateMany({
        where: { id: intent.id, status: "PENDING", provider: "NONE" },
        data: { provider: "SAFEPAY", providerReference: orderRef, status: "CREATING_CHECKOUT" },
      });
      if (!claim.count && intent.status === "PENDING_SETTLEMENT" && intent.provider === "SAFEPAY" && intent.providerReference === orderRef) {
        claim = await prisma.onboardingCheckoutIntent.updateMany({
          where: { id: intent.id, status: "PENDING_SETTLEMENT", provider: "SAFEPAY", providerReference: orderRef },
          data: { status: "CREATING_CHECKOUT" },
        });
      }
      if (!claim.count) {
        const latest = await prisma.onboardingCheckoutIntent.findUnique({ where: { id: intent.id } });
        return Response.json({ success: true, intentId: intent.id, status: latest?.status ?? "PENDING", returnStep: intent.returnStep });
      }

      const result = await createSafePayOrder(
        {
          merchantId: process.env.SAFEPAY_MERCHANT_ID!,
          apiKey: process.env.SAFEPAY_API_KEY!,
          secretKey: process.env.SAFEPAY_SECRET_KEY!,
          returnUrl: `${statusUrl}&return=provider`,
          sandbox: process.env.SAFEPAY_PRODUCTION !== "true",
        },
        {
          amount: (periodPrice(selectedContract.price, parsed.data.billingPeriod as BillingPeriod) ?? 0) * 100,
          orderRef,
          description: `Subscription for ${selectedContract.name} (${parsed.data.billingPeriod})`,
          customerEmail: user.email,
          customerName: user.fullName,
          metadata: {
            checkoutIntentId: intent.id,
            schoolId: user.schoolId,
            plan,
            billingPeriod: parsed.data.billingPeriod,
            commercialContract: encodePlanContractMetadata(selectedContract),
          },
        },
      );
      if (!result.success || !result.redirectUrl) {
        await prisma.onboardingCheckoutIntent.update({
          where: { id: intent.id },
          data: { status: "PENDING_SETTLEMENT", failureReason: result.error || "SafePay checkout creation is being reconciled." },
        });
        throw new ApiError(result.error || "SafePay checkout could not be started.", 502);
      }
      await prisma.onboardingCheckoutIntent.update({
        where: { id: intent.id },
        data: { checkoutUrl: result.redirectUrl, status: "CHECKOUT_PENDING", failureReason: null },
      });
      return Response.json({ success: true, intentId: intent.id, status: "CHECKOUT_PENDING", url: result.redirectUrl });
    }

    await prisma.onboardingCheckoutIntent.update({
      where: { id: intent.id },
      data: { provider: "BANK_TRANSFER", providerReference: intent.id, status: "PENDING_SETTLEMENT" },
    });
    return Response.json({
      success: true,
      intentId: intent.id,
      status: "PENDING_SETTLEMENT",
      amount: intent.amount,
      currency: intent.currency,
      bank: paymentConfig.bank,
      returnStep: intent.returnStep,
    });
  } catch (error) {
    const response = errorResponse(error, "[onboarding-package] checkout failed");
    if (!activeIntentId) return response;
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Checkout failed.";
    return Response.json({ error: message, intentId: activeIntentId }, { status });
  }
}
