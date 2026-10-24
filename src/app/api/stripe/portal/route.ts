import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageSubscription, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createPortalSession } from "@/lib/stripe/server";
import { saveSubscriptionRequest } from "@/lib/billing/lifecycle";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canManageSubscription(user)) throw new ApiError("The SkooleeAI subscription is managed by the account owner.", 403);
    // G6 / K-I5: changing the payment method needs a verified second factor.
    if (user.mfaVerified !== true) return Response.json({ error: "Turn on two-step sign-in before you change the payment method.", code: "MFA_REQUIRED" }, { status: 403 });
    const parsed = z.object({ idempotencyKey: z.string().min(12).max(120).optional() }).safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new ApiError("Invalid recovery request", 400);

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new ApiError("Stripe is not configured", 503);
    }

    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { stripeCustomerId: true },
    });

    if (!school?.stripeCustomerId) {
      throw new ApiError("No Stripe customer exists yet. Start checkout first.", 400);
    }

    const url = await createPortalSession(school.stripeCustomerId);
    await saveSubscriptionRequest({
      schoolId: user.schoolId,
      userId: user.userId,
      // One recovery record per payer per day, however often the portal is opened.
      idempotencyKey: `recovery-${new Date().toISOString().slice(0, 10)}`,
      kind: "RENEWAL_RECOVERY",
      effectiveAt: null,
      details: { provider: "STRIPE", action: "billing_portal_opened", policy: "provider-controlled recovery" },
    });
    return Response.json({ success: true, url });
  } catch (error) {
    return errorResponse(error, "[stripe/portal] failed");
  }
}
