import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageSubscription, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createStripeCustomer, getPriceId, createCheckoutSessionWithTransfer, verifyStripePrice } from "@/lib/stripe/server";
import { resolvePaymentProvider } from "@/lib/payments/provider";
import { ANNUAL_DISCOUNT, getPlanLimits, type BillingPeriod } from "@/config/plans";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { getPaymentConfig } from "@/lib/payments/gateway";
import { COMMERCIAL_CONTRACT, encodePlanContractMetadata, type PlanContract } from "@/config/commercial-contract";
import { checkoutAmount, packageContract } from "@/lib/billing/checkout-intents";
import { billedUnits } from "@/lib/billing/plan-pricing";
import { findApprovedPlanChange, markPlanChangeCheckoutStarted, restorePlanChangeApproval } from "@/lib/billing/lifecycle";
import { readJsonBody } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  plan: z.enum(["BASIC", "PRO"]),
  billingPeriod: z.enum(["monthly", "annual"]).optional().default("monthly"),
});

/** "PKR 54,000/yr (−20% annual) for 300 students": the period amount, and the students a per-student quote bills. */
function periodLabel(quoted: PlanContract, billingPeriod: BillingPeriod) {
  const amount = checkoutAmount(quoted, billingPeriod);
  if (amount == null) return "Custom";
  const total = billingPeriod === "annual"
    ? `${COMMERCIAL_CONTRACT.currency} ${amount.toLocaleString()}/yr (−${Math.round(ANNUAL_DISCOUNT * 100)}% annual)`
    : `${COMMERCIAL_CONTRACT.currency} ${amount.toLocaleString()}/mo`;
  return quoted.pricing === "per_student" && quoted.billedStudents ? `${total} for ${quoted.billedStudents.toLocaleString()} students` : total;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canManageSubscription(user)) throw new ApiError("The SkooleeAI subscription is managed by the account owner.", 403);

    const parsed = checkoutSchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const existingContract = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { stripeSubscriptionId: true, subscriptionLifecycleState: true },
    });
    if (existingContract?.stripeSubscriptionId && existingContract.subscriptionLifecycleState !== "ENDED") {
      throw new ApiError("This institution already has a provider subscription. Review plan capacity and effective dates in Billing & plan before changing it.", 409);
    }
    const approvedChange = await findApprovedPlanChange(user.schoolId, parsed.data.plan, parsed.data.billingPeriod);
    if (!approvedChange) throw new ApiError("Review and approve this plan change in Billing & plan before starting checkout.", 409);

    const paymentConfig = await getPaymentConfig();
    // The quote: this school's price for the plan, × its active students (raised to the plan's minimum) when per student.
    const billing = await getBillingSnapshot(user.schoolId);
    const quoted = packageContract(parsed.data.plan, billing.plans[parsed.data.plan], billing.usage.activeStudents);

    if (paymentConfig.availableMethods.includes("stripe")) {
      const priceId = getPriceId(parsed.data.plan, parsed.data.billingPeriod);
      if (!priceId) {
        throw new ApiError(`${getPlanLimits(parsed.data.plan).name} checkout is not configured`, 503);
      }

      const selectedPrice = billing.plans[parsed.data.plan].price;
      if (selectedPrice !== getPlanLimits(parsed.data.plan).price) {
        throw new ApiError("This school's approved price differs from the configured Stripe catalogue. Contact the billing owner before checkout.", 503);
      }
      try {
        await verifyStripePrice(priceId, parsed.data.plan, parsed.data.billingPeriod, selectedPrice);
      } catch (error) {
        throw new ApiError(error instanceof Error ? error.message : "Stripe price validation failed", 503);
      }

      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { id: true, name: true, contactEmail: true, stripeCustomerId: true },
      });
      if (!school) throw new ApiError("School not found", 404);

      const customerId = school.stripeCustomerId
        ? school.stripeCustomerId
        : await createStripeCustomer(school.contactEmail || user.email, school.name, school.id);

      if (!school.stripeCustomerId) {
        await prisma.school.update({
          where: { id: school.id },
          data: { stripeCustomerId: customerId },
        });
      }

      if (approvedChange.state === "REVIEWED_APPROVED") await markPlanChangeCheckoutStarted(user.schoolId, approvedChange.id, user.userId);
      let url: string;
      try {
        url = await createCheckoutSessionWithTransfer(
          customerId,
          priceId,
          school.id,
          parsed.data.plan,
          paymentConfig.stripe?.connectedAccountId || null,
          encodePlanContractMetadata(quoted),
          approvedChange.id,
          `subscription-change-${approvedChange.id}`,
          billedUnits(quoted, quoted.billedStudents ?? 0)
        );
      } catch (error) {
        await restorePlanChangeApproval(user.schoolId, approvedChange.id, user.userId);
        throw error;
      }
      if (!url) {
        await restorePlanChangeApproval(user.schoolId, approvedChange.id, user.userId);
        throw new ApiError("Stripe did not return a checkout URL", 502);
      }

      return Response.json({ success: true, method: "stripe", url });
    }

    if (paymentConfig.availableMethods.includes("safepay")) {
      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { id: true },
      });
      if (!school) throw new ApiError("School not found", 404);

      const encodedContract = encodePlanContractMetadata(quoted);
      const price = checkoutAmount(quoted, parsed.data.billingPeriod);

      const orderRef = `SKL-${approvedChange.id}`.toUpperCase();
      const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const merchantId = process.env.SAFEPAY_MERCHANT_ID;
      const apiKey = process.env.SAFEPAY_API_KEY;
      const secretKey = process.env.SAFEPAY_SECRET_KEY;

      if (merchantId && apiKey && secretKey) {
        const amountInPaisa = (price || 0) * 100;
        // §6.2: the provider returns to /billing, which resolves the payer's own Billing & plan view. One query
        // string built with URLSearchParams (the old hub path already carried "?view=billing", so appending
        // "?safepay_status=…" produced a second "?").
        // SafePay receives the same paisa amount as before; the adapter divides minor units by 100.
        const result = await resolvePaymentProvider("PKR")!.createCheckout({
          amountMinor: Math.round(amountInPaisa * 100),
          currency: "PKR",
          orderRef,
          description: `SkooleeAI ${quoted.name} plan (${parsed.data.billingPeriod})${quoted.pricing === "per_student" && quoted.billedStudents ? `, ${quoted.billedStudents} students` : ""}`,
          returnUrl: `${appBase}/billing?${new URLSearchParams({ safepay_status: "completed", ref: orderRef })}`,
          customer: { email: user.email, name: user.fullName },
          metadata: { schoolId: school.id, plan: parsed.data.plan, billingPeriod: parsed.data.billingPeriod, commercialContract: encodedContract },
        });

        if (!result.ok) {
          throw new ApiError(result.message || "SafePay payment initiation failed", 502);
        }

        return Response.json({ success: true, method: "safepay", url: result.redirectUrl });
      }

      throw new ApiError("SafePay checkout is not configured. No simulated payment can activate a subscription.", 503);
    }

    if (paymentConfig.bank) {
      return Response.json({
        success: true,
        method: "bank_transfer",
        plan: parsed.data.plan,
        billingPeriod: parsed.data.billingPeriod,
        bank: paymentConfig.bank,
        amount: checkoutAmount(quoted, parsed.data.billingPeriod),
        amountLabel: periodLabel(quoted, parsed.data.billingPeriod),
        billedStudents: quoted.billedStudents,
      });
    }

    throw new ApiError("No payment method is configured. Contact the platform billing administrator.", 503);
  } catch (error) {
    return errorResponse(error, "[checkout] failed");
  }
}
