import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageBilling, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createCheckoutSession, createStripeCustomer, getPriceId } from "@/lib/stripe/server";
import { getPlanLimits } from "@/config/plans";

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

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new ApiError("Stripe is not configured", 503);
    }

    const priceId = getPriceId(parsed.data.plan);
    if (!priceId) {
      throw new ApiError(`${getPlanLimits(parsed.data.plan).name} checkout is not configured`, 503);
    }

    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        stripeCustomerId: true,
      },
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

    const url = await createCheckoutSession(customerId, priceId, school.id, parsed.data.plan);
    if (!url) throw new ApiError("Stripe did not return a checkout URL", 502);

    return Response.json({ success: true, url });
  } catch (error) {
    return errorResponse(error, "[stripe/checkout] failed");
  }
}
