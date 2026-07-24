// ===========================================
// SkooleeAI - Stripe Server Utilities
// ===========================================

import Stripe from "stripe";
import { getPlanLimits } from "@/config/plans";
import type { PlanType } from "@/types";

type StripeConfig = NonNullable<ConstructorParameters<typeof Stripe>[1]>;

const stripeApiVersion = (
  process.env.STRIPE_API_VERSION || "2026-04-22.dahlia"
) as StripeConfig["apiVersion"];

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: stripeApiVersion,
      typescript: true,
    })
  : null;

function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }
  return stripe;
}

export function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Create a Stripe customer for a new tenant.
 */
export async function createStripeCustomer(
  email: string,
  name: string,
  schoolId: string
): Promise<string> {
  const customer = await requireStripe().customers.create({
    email,
    name,
    metadata: { schoolId },
  });
  return customer.id;
}

/**
 * Create a checkout session for upgrading a plan.
 */
export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  schoolId: string,
  plan: Exclude<PlanType, "FREE" | "ENTERPRISE">
): Promise<string> {
  const session = await requireStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl()}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/dashboard/billing?canceled=true`,
    client_reference_id: schoolId,
    allow_promotion_codes: true,
    metadata: { schoolId, plan },
    subscription_data: {
      metadata: { schoolId, plan },
    },
  });
  return session.url || "";
}

/**
 * Create a billing portal session for managing subscriptions.
 */
export async function createPortalSession(
  customerId: string
): Promise<string> {
  const session = await requireStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/dashboard/billing`,
  });
  return session.url;
}

/**
 * Get Stripe price ID for a plan type.
 */
export function getPriceId(plan: PlanType): string {
  const limits = getPlanLimits(plan);
  return limits.stripePriceEnv ? process.env[limits.stripePriceEnv] || "" : "";
}
