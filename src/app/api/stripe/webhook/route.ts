import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { getPlanLimits, normalizePlan } from "@/config/plans";
import { createPlanContract, decodePlanContractMetadata } from "@/config/commercial-contract";
import { stripe } from "@/lib/stripe/server";
import {
  planFromStripePriceId,
  stripeStatusToSchoolStatus,
  GRACE_PERIOD_DAYS,
} from "@/lib/billing/entitlements";
import type { PlanType } from "@/types";
import { settleVerifiedCheckoutIntent } from "@/lib/billing/checkout-intents";
import { getPriceId, verifyStripePrice } from "@/lib/stripe/server";
import { restorePlanChangeApproval } from "@/lib/billing/lifecycle";
import { claimProviderEvent, finishProviderEvent, NeedsReview } from "@/lib/billing/provider-events";

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

/**
 * SKAI-1317: grace starts no earlier than the paid-through date. A failed payment
 * during paid service must not end access before the period the school already paid for.
 */
function graceAfterPaidThrough(planEndsAt: Date | null | undefined): Date {
  const paidThrough = planEndsAt && planEndsAt > new Date() ? planEndsAt : new Date();
  return new Date(paidThrough.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

async function syncSubscription(subscription: Stripe.Subscription, eventCreated: number) {
  const schoolId = await findSchoolForSubscription(subscription);
  // SKO-373: a verified event for no known institution is parked for an operator, not dropped.
  if (!schoolId) throw new NeedsReview("No institution matches this Stripe subscription or customer.");
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
  const current = await prisma.school.findUnique({ where: { id: schoolId }, select: { plan: true, commercialContract: true, lastStripeEventCreated: true, graceEndsAt: true, planEndsAt: true, stripeSubscriptionId: true, subscriptionLifecycleState: true } });
  if (current?.stripeSubscriptionId && current.stripeSubscriptionId !== subscription.id) return;
  if (current?.lastStripeEventCreated != null && eventCreated < current.lastStripeEventCreated) return;
  const paymentPastDue = subscription.status === "past_due" || subscription.status === "unpaid";
  const graceEndsAt = paymentPastDue
    ? current?.graceEndsAt || graceAfterPaidThrough(current?.planEndsAt)
    : null;
  const inGrace = Boolean(graceEndsAt && graceEndsAt > new Date());
  const status = paymentPastDue ? (inGrace ? "ACTIVE" : "SUSPENDED") : stripeStatusToSchoolStatus(subscription.status);
  // An operator-approved grace extension stays labelled as approved while it lasts.
  const graceState = current?.subscriptionLifecycleState === "APPROVED_GRACE" && inGrace ? "APPROVED_GRACE" : "PAST_DUE_GRACE";
  // The paid-through date follows the provider's current period, so the
  // expiry sweep never suspends a school whose renewal Stripe already took.
  const periodEnd = subscription.items.data[0]?.current_period_end;
  const limits = getPlanLimits(plan);
  const termsChanged = !current || normalizePlan(current.plan) !== plan || !current.commercialContract;
  const encodedContract = subscription.metadata?.commercialContract;
  const quotedContract = decodePlanContractMetadata(encodedContract, plan);
  if (termsChanged && encodedContract && !quotedContract) throw new Error("Invalid commercial contract in Stripe subscription metadata");

  const applied = await prisma.school.updateMany({
    where: { id: schoolId, OR: [
      { lastStripeEventCreated: null },
      { lastStripeEventCreated: { lte: eventCreated } },
    ] },
    data: {
      plan,
      status,
      subscriptionLifecycleState: subscription.cancel_at_period_end ? "CANCELLATION_SCHEDULED" :
        paymentPastDue ? (inGrace ? graceState : "PAST_DUE") :
          subscription.status === "canceled" ? "ENDED" : subscription.status === "trialing" ? "TRIAL" :
            subscription.status === "active" ? "ACTIVE" : "PENDING_PAYMENT",
      cancellationEffectiveAt: subscription.cancel_at_period_end && subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      graceEndsAt,
      ...(periodEnd ? { planEndsAt: new Date(periodEnd * 1000) } : {}),
      lastStripeEventCreated: eventCreated,
      ...(termsChanged ? { aiCreditsLimit: quotedContract?.aiCredits ?? limits.aiCredits, commercialContract: quotedContract ?? createPlanContract(plan) } : {}),
      stripeSubscriptionId: subscription.id,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });
  if (applied.count === 1) await markVerifiedPlanChange(subscription, eventCreated);
}

async function markVerifiedPlanChange(subscription: Stripe.Subscription, eventCreated: number) {
  if (subscription.status !== "active") return;
  const requestId = subscription.metadata?.subscriptionChangeRequestId;
  const schoolId = await findSchoolForSubscription(subscription);
  if (!requestId || !schoolId) return;
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { stripeSubscriptionId: true, lastStripeEventCreated: true } });
  if (school?.stripeSubscriptionId !== subscription.id || (school.lastStripeEventCreated != null && school.lastStripeEventCreated > eventCreated)) return;
  const request = await prisma.subscriptionRequest.findFirst({ where: { id: requestId, schoolId, state: "CHECKOUT_STARTED" }, select: { id: true, kind: true, state: true, requestedPlan: true, details: true } });
  if (!request || request.kind !== "PLAN_CHANGE" || request.requestedPlan !== subscription.metadata?.plan) return;
  const details = request.details && typeof request.details === "object" && !Array.isArray(request.details)
    ? request.details as Record<string, unknown>
    : {};
  const changed = await prisma.subscriptionRequest.updateMany({
    where: { id: requestId, schoolId, state: "CHECKOUT_STARTED", requestedPlan: subscription.metadata?.plan },
    data: { state: "VERIFIED_ACTIVE", details: { ...details, providerOutcome: { status: "active", subscriptionId: subscription.id, verifiedAt: new Date().toISOString(), eventCreated } } as any },
  });
  if (changed.count === 1) {
    await prisma.auditLog.create({ data: { schoolId, userId: "stripe-webhook", tableName: "subscription_request",
      recordId: requestId, oldValue: { state: "CHECKOUT_STARTED" }, newValue: { state: "VERIFIED_ACTIVE", eventCreated } } });
  }
}

async function suspendByCustomer(customerId: string | null, eventCreated: number) {
  if (!customerId) throw new NeedsReview("A failed payment arrived without a subscription or customer reference.");
  if (!(await prisma.school.count({ where: { stripeCustomerId: customerId } }))) throw new NeedsReview("No institution matches this Stripe customer.");
  const schools = await prisma.school.findMany({
    where: { stripeCustomerId: customerId, OR: [
      { lastStripeEventCreated: null },
      { lastStripeEventCreated: { lte: eventCreated } },
    ] },
    select: { id: true, graceEndsAt: true, planEndsAt: true },
  });
  for (const school of schools) {
    const graceEndsAt = school.graceEndsAt || graceAfterPaidThrough(school.planEndsAt);
    const inGrace = graceEndsAt > new Date();
    await prisma.school.updateMany({
      where: { id: school.id, OR: [
        { lastStripeEventCreated: null },
        { lastStripeEventCreated: { lte: eventCreated } },
      ] },
      data: {
        status: inGrace ? "ACTIVE" : "SUSPENDED",
        subscriptionLifecycleState: inGrace ? "PAST_DUE_GRACE" : "PAST_DUE",
        graceEndsAt,
        lastStripeEventCreated: eventCreated,
      },
    });
  }
}

const claimWebhookReceipt = (event: Stripe.Event) =>
  claimProviderEvent({ provider: "STRIPE", eventId: event.id, eventType: event.type, eventCreated: event.created });

const finishWebhookReceipt = (eventId: string, state: "PROCESSED" | "FAILED", error?: unknown) =>
  finishProviderEvent(eventId, state, { error });

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
    const receiptClaim = await claimWebhookReceipt(event);
    if (receiptClaim === "duplicate") return Response.json({ received: true, duplicate: true });
    if (receiptClaim === "in_progress") return Response.json({ received: true, pending: true }, { status: 202 });
  } catch (error) {
    console.error("[stripe/webhook] receipt claim failed", error);
    return Response.json({ error: "Webhook receipt could not be recorded" }, { status: 503 });
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
          if (session.metadata?.subscriptionChangeRequestId) await restorePlanChangeApproval(
            session.metadata.schoolId || intent.schoolId,
            session.metadata.subscriptionChangeRequestId,
            intent.userId,
          );
          await finishWebhookReceipt(event.id, "PROCESSED");
          return Response.json({ received: true });
        }
        if (session.payment_status !== "paid" || session.mode !== "subscription") {
          await prisma.onboardingCheckoutIntent.updateMany({
            where: { id: intent.id, schoolId, status: "CHECKOUT_PENDING" },
            data: { status: "PENDING_SETTLEMENT" },
          });
          await finishWebhookReceipt(event.id, "PROCESSED");
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
          await finishWebhookReceipt(event.id, "PROCESSED");
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
        await finishWebhookReceipt(event.id, "PROCESSED");
        return Response.json({ received: true });
      }
    }

    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const requestId = session.metadata?.subscriptionChangeRequestId;
      if (requestId && session.metadata?.schoolId) {
        const request = await prisma.subscriptionRequest.findFirst({ where: { id: requestId, schoolId: session.metadata.schoolId, state: "CHECKOUT_STARTED" }, select: { requestedById: true } });
        if (request) await restorePlanChangeApproval(session.metadata.schoolId, requestId, request.requestedById);
      }
      await finishWebhookReceipt(event.id, "PROCESSED");
      return Response.json({ received: true });
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      const schoolId = session.metadata?.schoolId || session.client_reference_id;
      const subscriptionId = stringId(session.subscription);
      const customerId = stringId(session.customer);
      const requestedPlan = normalizePlan(session.metadata?.plan);
      const encodedContract = session.metadata?.commercialContract;
      const quotedContract = decodePlanContractMetadata(encodedContract, requestedPlan);
      if (encodedContract && !quotedContract) throw new Error("Invalid commercial contract in Stripe checkout metadata");

      if (schoolId && subscriptionId) {
        if (session.mode !== "subscription" || session.payment_status !== "paid") {
          await finishWebhookReceipt(event.id, "PROCESSED");
          return Response.json({ received: true, pending: true });
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const pricePlan = planFromStripePriceId(subscriptionPriceId(subscription));
        const plan = (pricePlan || requestedPlan) as PlanType;
        if (plan !== requestedPlan && quotedContract) throw new Error("Stripe checkout price does not match the requested plan");
        if (subscription.status !== "active" || subscription.metadata?.schoolId !== schoolId ||
            subscription.metadata?.plan !== requestedPlan || (session.metadata?.subscriptionChangeRequestId &&
              subscription.metadata?.subscriptionChangeRequestId !== session.metadata.subscriptionChangeRequestId)) {
          await finishWebhookReceipt(event.id, "PROCESSED");
          return Response.json({ received: true, pending: true });
        }
        await syncSubscription(subscription, event.created);
        if (customerId) await prisma.school.updateMany({ where: { id: schoolId,
          OR: [{ lastStripeEventCreated: null }, { lastStripeEventCreated: { lte: event.created } }] },
          data: { stripeCustomerId: customerId, lastStripeEventCreated: event.created } });
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const incoming = event.data.object as Stripe.Subscription;
      await syncSubscription(await stripe.subscriptions.retrieve(incoming.id), event.created);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const schoolId = await findSchoolForSubscription(subscription);
      if (!schoolId) throw new NeedsReview("A subscription ended for no known institution.");
      {
        const current = await prisma.school.findUnique({ where: { id: schoolId }, select: { stripeSubscriptionId: true } });
        if (current?.stripeSubscriptionId && current.stripeSubscriptionId !== subscription.id) {
          await finishWebhookReceipt(event.id, "PROCESSED");
          return Response.json({ received: true, stale_subscription: true });
        }
        await prisma.school.updateMany({
          where: { id: schoolId, OR: [
            { lastStripeEventCreated: null },
            { lastStripeEventCreated: { lte: event.created } },
          ] },
          data: { plan: "FREE", status: "SUSPENDED", subscriptionLifecycleState: "ENDED",
            cancellationEffectiveAt: null, graceEndsAt: null, stripeSubscriptionId: null,
            lastStripeEventCreated: event.created },
        });
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId), event.created);
      else await suspendByCustomer(stringId(invoice.customer), event.created);
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId), event.created);
      }
    }

    await finishWebhookReceipt(event.id, "PROCESSED");
    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof NeedsReview) {
      await finishProviderEvent(event.id, "NEEDS_REVIEW", { error: error.message, schoolId: error.schoolId ?? null });
      return Response.json({ received: true, review: true });
    }
    await finishWebhookReceipt(event.id, "FAILED", error).catch(receiptError => console.error("[stripe/webhook] receipt failure update failed", receiptError));
    console.error("[stripe/webhook]", error);
    return Response.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
