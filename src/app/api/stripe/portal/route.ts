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
    if (!canManageSubscription(user)) throw new ApiError("Insufficient permissions", 403);
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
      idempotencyKey: parsed.data.idempotencyKey || `recovery-${crypto.randomUUID()}`,
      kind: "RENEWAL_RECOVERY",
      effectiveAt: null,
      details: { provider: "STRIPE", action: "billing_portal_opened", policy: "provider-controlled recovery" },
    });
    return Response.json({ success: true, url });
  } catch (error) {
    return errorResponse(error, "[stripe/portal] failed");
  }
}
