import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { getPlanLimits, normalizePlan } from "@/config/plans";
import { createPlanContract, decodePlanContractMetadata } from "@/config/commercial-contract";
import { stripe } from "@/lib/stripe/server";
import {
  applySchoolPlan,
  planFromStripePriceId,
  stripeStatusToSchoolStatus,
} from "@/lib/billing/entitlements";
import type { PlanType } from "@/types";
import { settleVerifiedCheckoutIntent } from "@/lib/billing/checkout-intents";
import { getPriceId, verifyStripePrice } from "@/lib/stripe/server";

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
  const checkoutIntentId = subscription.metadata?.checkoutIntentId;
  if (checkoutIntentId) {
    const intent = await prisma.onboardingCheckoutIntent.findFirst({
      where: { id: checkoutIntentId, schoolId, provider: "STRIPE" },
      select: { status: true },
    });
    // A subscription lifecycle event can arrive before checkout settlement.
    // Do not let it bypass the saved checkout intent's paid-session checks.
    if (intent?.status !== "SETTLED") return;
  }

  const metadataPlan = subscription.metadata?.plan ? normalizePlan(subscription.metadata.plan) : null;
  const pricePlan = planFromStripePriceId(subscriptionPriceId(subscription));
  const plan = pricePlan || metadataPlan || "FREE";
  const customerId = stringId(subscription.customer);
  const status = stripeStatusToSchoolStatus(subscription.status);
  const limits = getPlanLimits(plan);
  const current = await prisma.school.findUnique({ where: { id: schoolId }, select: { plan: true, commercialContract: true } });
  const termsChanged = !current || normalizePlan(current.plan) !== plan || !current.commercialContract;
  const encodedContract = subscription.metadata?.commercialContract;
  const quotedContract = decodePlanContractMetadata(encodedContract, plan);
  if (termsChanged && encodedContract && !quotedContract) throw new Error("Invalid commercial contract in Stripe subscription metadata");

  await prisma.school.update({
    where: { id: schoolId },
    data: {
      plan,
      status,
      ...(termsChanged ? { aiCreditsLimit: quotedContract?.aiCredits ?? limits.aiCredits, commercialContract: quotedContract ?? createPlanContract(plan) } : {}),
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
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const checkoutIntentId = session.metadata?.checkoutIntentId;
      if (checkoutIntentId) {
        const schoolId = session.metadata?.schoolId;
        const plan = session.metadata?.plan;
        const billingPeriod = session.metadata?.billingPeriod;
        const intent = await prisma.onboardingCheckoutIntent.findFirst({
          where: { id: checkoutIntentId, schoolId: schoolId || undefined, provider: "STRIPE" },
        });
        if (!intent || !schoolId || !plan || intent.schoolId !== schoolId ||
            intent.plan !== plan || intent.billingPeriod !== billingPeriod) {
          throw new Error("Stripe checkout does not match a saved purchase intent");
        }
        if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
          await prisma.onboardingCheckoutIntent.updateMany({
            where: { id: intent.id, schoolId, provider: "STRIPE", providerReference: session.id,
              status: { in: ["CHECKOUT_PENDING", "PENDING_SETTLEMENT"] } },
            data: { status: event.type === "checkout.session.expired" ? "CANCELLED" : "FAILED",
              failureReason: event.type === "checkout.session.expired" ? null : "Stripe reported a failed payment." },
          });
          return Response.json({ received: true });
        }
        if (session.payment_status !== "paid" || session.mode !== "subscription") {
          await prisma.onboardingCheckoutIntent.updateMany({
            where: { id: intent.id, schoolId, status: "CHECKOUT_PENDING" },
            data: { status: "PENDING_SETTLEMENT" },
          });
          return Response.json({ received: true, pending: true });
        }
        const subscriptionId = stringId(session.subscription);
        if (!subscriptionId || !stripe) throw new Error("Stripe subscription reference is missing");
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const savedContract = intent.contractSnapshot as { price?: number | null; plan?: string };
        const priceId = subscriptionPriceId(subscription);
        const expectedPriceId = getPriceId(plan as PlanType, billingPeriod as "monthly" | "annual");
        if (
          subscription.status !== "active" ||
          subscription.metadata?.checkoutIntentId !== intent.id ||
          subscription.metadata?.schoolId !== schoolId ||
          subscription.metadata?.plan !== plan ||
          subscription.metadata?.billingPeriod !== billingPeriod ||
          !priceId || priceId !== expectedPriceId ||
          savedContract.plan !== plan || savedContract.price == null
        ) {
          await prisma.onboardingCheckoutIntent.updateMany({
            where: { id: intent.id, schoolId, status: "CHECKOUT_PENDING" },
            data: { status: "PENDING_SETTLEMENT" },
          });
          return Response.json({ received: true, pending: true });
        }
        await verifyStripePrice(priceId, plan as PlanType, billingPeriod as "monthly" | "annual", savedContract.price);
        await settleVerifiedCheckoutIntent({
          id: intent.id,
          schoolId,
          provider: "STRIPE",
          providerReference: session.id,
          plan: plan as PlanType,
          billingPeriod: billingPeriod as "monthly" | "annual",
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: stringId(session.customer),
        });
        return Response.json({ received: true });
      }
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const schoolId = session.metadata?.schoolId || session.client_reference_id;
      const subscriptionId = stringId(session.subscription);
      const customerId = stringId(session.customer);
      const requestedPlan = normalizePlan(session.metadata?.plan);
      const encodedContract = session.metadata?.commercialContract;
      const quotedContract = decodePlanContractMetadata(encodedContract, requestedPlan);
      if (encodedContract && !quotedContract) throw new Error("Invalid commercial contract in Stripe checkout metadata");

      if (schoolId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const pricePlan = planFromStripePriceId(subscriptionPriceId(subscription));
        const plan = (pricePlan || requestedPlan) as PlanType;
        const matchingContract = plan === requestedPlan ? quotedContract : null;
        await applySchoolPlan(schoolId, plan, stripeStatusToSchoolStatus(subscription.status), subscription.id, matchingContract);
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
