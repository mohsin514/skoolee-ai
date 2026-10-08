import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canPurchaseSubscription, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createStripeCustomer, getPriceId, createCheckoutSessionWithTransfer, verifyStripePrice } from "@/lib/stripe/server";
import { createSafePayOrder } from "@/lib/payments/safepay";
import { ANNUAL_DISCOUNT, getPlanLimits, type BillingPeriod } from "@/config/plans";
import type { PlanDetails } from "@/types";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { getPaymentConfig } from "@/lib/payments/gateway";
import { dashboardPathForRole } from "@/lib/roles";
import { COMMERCIAL_CONTRACT, createPlanContract, encodePlanContractMetadata } from "@/config/commercial-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  plan: z.enum(["BASIC", "PRO"]),
  billingPeriod: z.enum(["monthly", "annual"]).optional().default("monthly"),
});

function periodPrice(price: number | null | undefined, billingPeriod: BillingPeriod) {
  if (price == null) return null;
  return billingPeriod === "annual" ? Math.round(price * (1 - ANNUAL_DISCOUNT) * 12) : price;
}

function periodLabel(price: number | null | undefined, billingPeriod: BillingPeriod) {
  const amount = periodPrice(price, billingPeriod);
  if (amount == null) return "Custom";
  return billingPeriod === "annual"
    ? `${COMMERCIAL_CONTRACT.currency} ${amount.toLocaleString()}/yr (−${Math.round(ANNUAL_DISCOUNT * 100)}% annual)`
    : `${COMMERCIAL_CONTRACT.currency} ${amount.toLocaleString()}/mo`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canPurchaseSubscription(user)) throw new ApiError("Insufficient permissions", 403);

    const parsed = checkoutSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const paymentConfig = await getPaymentConfig();

    if (paymentConfig.availableMethods.includes("stripe")) {
      const priceId = getPriceId(parsed.data.plan, parsed.data.billingPeriod);
      if (!priceId) {
        throw new ApiError(`${getPlanLimits(parsed.data.plan).name} checkout is not configured`, 503);
      }

      const billing = await getBillingSnapshot(user.schoolId);
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

      const url = await createCheckoutSessionWithTransfer(
        customerId,
        priceId,
        school.id,
        parsed.data.plan,
        paymentConfig.stripe?.connectedAccountId || null,
        encodePlanContractMetadata(createPlanContract(parsed.data.plan))
      );
      if (!url) throw new ApiError("Stripe did not return a checkout URL", 502);

      return Response.json({ success: true, method: "stripe", url });
    }

    if (paymentConfig.availableMethods.includes("safepay")) {
      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { id: true },
      });
      if (!school) throw new ApiError("School not found", 404);

      const snapshot = await getBillingSnapshot(school.id);
      const planKey = parsed.data.plan as keyof typeof snapshot.plans;
      const planDetail = snapshot.plans[planKey] as PlanDetails;
      const quotedContract = createPlanContract(parsed.data.plan, {
        name: planDetail.name, price: planDetail.price, priceCurrency: COMMERCIAL_CONTRACT.currency,
        priceLabel: planDetail.priceLabel, features: planDetail.features, aiCredits: planDetail.aiCredits,
        maxStudents: planDetail.maxStudents, maxTeachers: planDetail.maxTeachers, maxCampuses: planDetail.maxCampuses,
        whatsappEnabled: planDetail.whatsappEnabled, pdfExportEnabled: planDetail.pdfExportEnabled,
        pdfBulkExport: planDetail.pdfBulkExport, analyticsEnabled: planDetail.analyticsEnabled,
      });
      const encodedContract = encodePlanContractMetadata(quotedContract);
      const price = periodPrice(planDetail.price, parsed.data.billingPeriod);
      const priceLabel = periodLabel(planDetail.price, parsed.data.billingPeriod);

      const orderRef = `SKL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const merchantId = process.env.SAFEPAY_MERCHANT_ID;
      const apiKey = process.env.SAFEPAY_API_KEY;
      const secretKey = process.env.SAFEPAY_SECRET_KEY;

      if (merchantId && apiKey && secretKey) {
        const amountInPaisa = (price || 0) * 100;
        // Land the payer back on their own billing hub: campus admins buy from
        // the campus Plans & Billing view, school owners from the super view.
        const billingHub =
          dashboardPathForRole(user.role) === "/super"
            ? "/super?view=billing"
            : dashboardPathForRole(user.role) === "/admin"
              ? "/admin?view=billing"
              : "/dashboard/billing";
        const result = await createSafePayOrder(
          {
            merchantId,
            apiKey,
            secretKey,
            returnUrl: `${appBase}${billingHub}?safepay_status=completed&ref=${orderRef}`,
            sandbox: process.env.SAFEPAY_PRODUCTION !== "true",
          },
          {
            amount: amountInPaisa,
            orderRef,
            description: `Upgrade to ${planDetail.name} plan (${parsed.data.billingPeriod})`,
            customerEmail: user.email,
            customerName: user.fullName,
            metadata: { schoolId: school.id, plan: parsed.data.plan, billingPeriod: parsed.data.billingPeriod, commercialContract: encodedContract },
          }
        );

        if (!result.success || !result.redirectUrl) {
          throw new ApiError(result.error || "SafePay payment initiation failed", 502);
        }

        return Response.json({ success: true, method: "safepay", url: result.redirectUrl });
      }

      const simUrl = `${appBase}/safepay?orderRef=${orderRef}&schoolId=${school.id}&plan=${parsed.data.plan}&billingPeriod=${parsed.data.billingPeriod}&amountLabel=${encodeURIComponent(priceLabel)}&contract=${encodeURIComponent(encodedContract)}`;
      return Response.json({ success: true, method: "safepay", url: simUrl });
    }

    const schoolForPrice = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { id: true },
    });
    let btPrice = periodPrice(getPlanLimits(parsed.data.plan).price, parsed.data.billingPeriod);
    let btLabel = periodLabel(getPlanLimits(parsed.data.plan).price, parsed.data.billingPeriod);
    if (schoolForPrice) {
      try {
        const fbSnapshot = await getBillingSnapshot(schoolForPrice.id);
        const fbDetail = fbSnapshot.plans[parsed.data.plan] as PlanDetails | undefined;
        if (fbDetail) {
          btPrice = periodPrice(fbDetail.price, parsed.data.billingPeriod);
          btLabel = periodLabel(fbDetail.price, parsed.data.billingPeriod);
        }
      } catch {
      }
    }

    if (paymentConfig.bank) {
      return Response.json({
        success: true,
        method: "bank_transfer",
        plan: parsed.data.plan,
        billingPeriod: parsed.data.billingPeriod,
        bank: paymentConfig.bank,
        amount: btPrice,
        amountLabel: btLabel,
      });
    }

    return Response.json({
      success: true,
      method: "bank_transfer",
      plan: parsed.data.plan,
      billingPeriod: parsed.data.billingPeriod,
      bank: null,
      amount: btPrice,
      amountLabel: btLabel,
    });
  } catch (error) {
    return errorResponse(error, "[checkout] failed");
  }
}
