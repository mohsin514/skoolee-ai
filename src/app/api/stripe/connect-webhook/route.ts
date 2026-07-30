import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!webhookSecret || !signature) {
    return Response.json({ error: "Connect webhook is not configured" }, { status: 503 });
  }
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid Stripe webhook" },
      { status: 400 }
    );
  }

  try {
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const accountId = account.id;

      const config = await prisma.platformConfig.findUnique({
        where: { key: "payment_settings" },
      });
      if (!config) return Response.json({ received: true });

      const value = (config.value ?? {}) as Record<string, unknown>;
      if (value.connectedAccountId !== accountId) return Response.json({ received: true });

      const updated: any = {
        ...value,
        chargesEnabled: account.charges_enabled || false,
        detailsSubmitted: account.details_submitted || false,
        onboardingComplete: account.charges_enabled && account.details_submitted,
      };

      await prisma.platformConfig.update({
        where: { id: config.id },
        data: { value: updated },
      });

      console.log(`[connect-webhook] Account ${accountId} updated: charges=${account.charges_enabled}, details=${account.details_submitted}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("[connect-webhook]", error);
    return Response.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
