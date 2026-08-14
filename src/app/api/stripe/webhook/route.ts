import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { getPlanLimits, normalizePlan } from "@/config/plans";
import { stripe } from "@/lib/stripe/server";
import {
  applySchoolPlan,
  planFromStripePriceId,
  stripeStatusToSchoolStatus,
} from "@/lib/billing/entitlements";
import type { PlanType } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function subscriptionPriceId(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price.id || null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const expanded = invoice as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | null } | null } | null;
  };

  return stringId(expanded.subscription) || expanded.parent?.subscription_details?.subscription || null;
}

async function findSchoolForSubscription(subscription: Stripe.Subscription) {
  const schoolId = subscription.metadata?.schoolId;
  if (schoolId) {
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (school) return school.id;
  }

  const subscriptionId = subscription.id;
  const customerId = stringId(subscription.customer);
  const school = await prisma.school.findFirst({
    where: {
      OR: [
        { stripeSubscriptionId: subscriptionId },
        ...(customerId ? [{ stripeCustomerId: customerId }] : []),
      ],
    },
    select: { id: true },
  });

  return school?.id || null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const schoolId = await findSchoolForSubscription(subscription);
  if (!schoolId) return;

  const metadataPlan = subscription.metadata?.plan ? normalizePlan(subscription.metadata.plan) : null;
  const pricePlan = planFromStripePriceId(subscriptionPriceId(subscription));
  const plan = pricePlan || metadataPlan || "FREE";
  const customerId = stringId(subscription.customer);
  const status = stripeStatusToSchoolStatus(subscription.status);
  const limits = getPlanLimits(plan);

  await prisma.school.update({
    where: { id: schoolId },
    data: {
      plan,
      status,
      aiCreditsLimit: limits.aiCredits,
      stripeSubscriptionId: subscription.id,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });
}

async function suspendByCustomer(customerId: string | null) {
  if (!customerId) return;
  await prisma.school.updateMany({
    where: { stripeCustomerId: customerId },
    data: { status: "SUSPENDED" },
  });
}

export async function POST(req: NextRequest) {
  // Gateway callbacks carry no session; the signature check inside is
  // what authenticates them, and the school is resolved from the
  // gateway's own identifiers rather than from a logged-in user.
  return runUnscoped("stripe webhook: no session, school resolved from subscription/customer id", () =>
    handleWebhook(req)
  );
}

async function handleWebhook(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");

  if (!webhookSecret || !signature) {
    return Response.json({ error: "Stripe webhook is not configured" }, { status: 503 });
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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const schoolId = session.metadata?.schoolId || session.client_reference_id;
      const subscriptionId = stringId(session.subscription);
      const customerId = stringId(session.customer);
      const requestedPlan = normalizePlan(session.metadata?.plan);

      if (schoolId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const pricePlan = planFromStripePriceId(subscriptionPriceId(subscription));
        const plan = (pricePlan || requestedPlan) as PlanType;
        await applySchoolPlan(schoolId, plan, stripeStatusToSchoolStatus(subscription.status), subscription.id);
        if (customerId) {
          await prisma.school.update({ where: { id: schoolId }, data: { stripeCustomerId: customerId } });
        }
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const schoolId = await findSchoolForSubscription(subscription);
      if (schoolId) {
        await applySchoolPlan(schoolId, "FREE", "SUSPENDED", null);
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      await suspendByCustomer(stringId(invoice.customer));
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe/webhook]", error);
    return Response.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
