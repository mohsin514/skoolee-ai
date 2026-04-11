// ===========================================
// POST /api/stripe/webhook
// ===========================================
// Handles Stripe webhook events:
// - checkout.session.completed → activate subscription
// - invoice.payment_failed → downgrade to FREE
// - customer.subscription.deleted → deactivate tenant

import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { prisma } from "@/lib/db/prisma";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ─── Checkout completed → activate subscription ────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const schoolId = session.metadata?.schoolId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!schoolId) break;

        // Determine plan from subscription
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;

        let plan: "BASIC" | "PRO" = "BASIC";
        if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
          plan = "PRO";
        }

        const aiCreditsLimit = plan === "PRO" ? 5000 : 1000;

        await prisma.school.update({
          where: { id: schoolId },
          data: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            plan,
            aiCreditsLimit,
            status: "ACTIVE",
          },
        });

        console.log(
          `[Stripe] Tenant ${tenantId} upgraded to ${plan}`
        );
        break;
      }

      // ─── Payment failed → downgrade to FREE ────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const tenant = await prisma.school.findUnique({
          where: { stripeCustomerId: customerId },
        });

        if (tenant) {
          await prisma.school.update({
            where: { id: tenant.id },
            data: {
              plan: "FREE",
              aiCreditsLimit: 100,
              status: "ACTIVE",
            },
          });
          console.log(
            `[Stripe] Tenant ${tenant.id} downgraded to FREE (payment failed)`
          );
        }
        break;
      }

      // ─── Subscription deleted → deactivate ──────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const tenant = await prisma.school.findUnique({
          where: { stripeCustomerId: customerId },
        });

        if (tenant) {
          await prisma.school.update({
            where: { id: tenant.id },
            data: {
              plan: "FREE",
              aiCreditsLimit: 100,
              stripeSubscriptionId: null,
              status: "ACTIVE",
            },
          });
          console.log(
            `[Stripe] Tenant ${tenant.id} subscription cancelled → FREE`
          );
        }
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook] Processing error:", error);
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
