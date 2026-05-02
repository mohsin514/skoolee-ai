import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageBilling, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createPortalSession } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canManageBilling(user)) throw new ApiError("Insufficient permissions", 403);

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
    return Response.json({ success: true, url });
  } catch (error) {
    return errorResponse(error, "[stripe/portal] failed");
  }
}
