// ===========================================
// POST /api/stripe/checkout
// ===========================================
// Creates a Stripe checkout session for plan upgrade.

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getTenantForUser } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";
import {
  createStripeCustomer,
  createCheckoutSession,
  getPriceId,
} from "@/lib/stripe/server";

const schema = z.object({
  plan: z.enum(["BASIC", "PRO"]),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json({ error: "No tenant found" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid plan" }, { status: 400 });
    }

    const { plan } = parsed.data;
    const priceId = getPriceId(plan);
    if (!priceId) {
      return Response.json(
        { error: "Price not configured" },
        { status: 500 }
      );
    }

    // Get or create Stripe customer
    const tenantRecord = await prisma.tenant.findUnique({
      where: { id: tenant.id },
    });
    let customerId = tenantRecord?.stripeCustomerId;

    if (!customerId) {
      customerId = await createStripeCustomer(
        tenantRecord?.email || "",
        tenantRecord?.name || "",
        tenant.id
      );
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const url = await createCheckoutSession(customerId, priceId, tenant.id);
    return Response.json({ url });
  } catch (error) {
    console.error("[stripe/checkout] Error:", error);
    return Response.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
