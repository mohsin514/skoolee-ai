import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageBilling, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createStripeCustomer, getPriceId, createCheckoutSessionWithTransfer } from "@/lib/stripe/server";
import { createSafePayOrder } from "@/lib/payments/safepay";
import { getPlanLimits } from "@/config/plans";
import type { PlanDetails } from "@/types";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { getPaymentConfig } from "@/lib/payments/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  plan: z.enum(["BASIC", "PRO"]),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canManageBilling(user)) throw new ApiError("Insufficient permissions", 403);

    const parsed = checkoutSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const paymentConfig = await getPaymentConfig();

    if (paymentConfig.availableMethods.includes("stripe")) {
      const priceId = getPriceId(parsed.data.plan);
      if (!priceId) {
        throw new ApiError(`${getPlanLimits(parsed.data.plan).name} checkout is not configured`, 503);
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
        paymentConfig.stripe?.connectedAccountId || null
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
      const price = planDetail.price;
      const priceLabel = planDetail.priceLabel;

      const orderRef = `SKL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const merchantId = process.env.SAFEPAY_MERCHANT_ID;
      const apiKey = process.env.SAFEPAY_API_KEY;
      const secretKey = process.env.SAFEPAY_SECRET_KEY;

      if (merchantId && apiKey && secretKey) {
        const amountInPaisa = (price || 0) * 100;
        const result = await createSafePayOrder(
          {
            merchantId,
            apiKey,
            secretKey,
            returnUrl: `${appBase}/dashboard/billing?safepay_status=completed&ref=${orderRef}`,
            sandbox: process.env.SAFEPAY_PRODUCTION !== "true",
          },
          {
            amount: amountInPaisa,
            orderRef,
            description: `Upgrade to ${planDetail.name} plan`,
            customerEmail: user.email,
            customerName: user.fullName,
            metadata: { schoolId: school.id, plan: parsed.data.plan },
          }
        );

        if (!result.success || !result.redirectUrl) {
          throw new ApiError(result.error || "SafePay payment initiation failed", 502);
        }

        return Response.json({ success: true, method: "safepay", url: result.redirectUrl });
      }

      const simUrl = `${appBase}/safepay?orderRef=${orderRef}&schoolId=${school.id}&plan=${parsed.data.plan}&amountLabel=${encodeURIComponent(priceLabel)}`;
      return Response.json({ success: true, method: "safepay", url: simUrl });
    }

    const schoolForPrice = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { id: true },
    });
    let btPrice = getPlanLimits(parsed.data.plan).price;
    let btLabel = getPlanLimits(parsed.data.plan).priceLabel;
    if (schoolForPrice) {
      try {
        const fbSnapshot = await getBillingSnapshot(schoolForPrice.id);
        const fbDetail = fbSnapshot.plans[parsed.data.plan] as PlanDetails | undefined;
        if (fbDetail) {
          btPrice = fbDetail.price;
          btLabel = fbDetail.priceLabel;
        }
      } catch {
      }
    }

    if (paymentConfig.bank) {
      return Response.json({
        success: true,
        method: "bank_transfer",
        plan: parsed.data.plan,
        bank: paymentConfig.bank,
        amount: btPrice,
        amountLabel: btLabel,
      });
    }

    return Response.json({
      success: true,
      method: "bank_transfer",
      plan: parsed.data.plan,
      bank: null,
      amount: btPrice,
      amountLabel: btLabel,
    });
  } catch (error) {
    return errorResponse(error, "[checkout] failed");
  }
}
