// ===========================================
// SkooleeAI - Stripe Server Utilities
// ===========================================

import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-03-31.basil",
  typescript: true,
});

/**
 * Create a Stripe customer for a new tenant.
 */
export async function createStripeCustomer(
  email: string,
  name: string,
  tenantId: string
): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { tenantId },
  });
  return customer.id;
}

/**
 * Create a checkout session for upgrading a plan.
 */
export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  tenantId: string
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
    metadata: { tenantId },
  });
  return session.url || "";
}

/**
 * Create a billing portal session for managing subscriptions.
 */
export async function createPortalSession(
  customerId: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  });
  return session.url;
}

/**
 * Get Stripe price ID for a plan type.
 */
export function getPriceId(plan: "BASIC" | "PRO"): string {
  const map: Record<string, string> = {
    BASIC: process.env.STRIPE_BASIC_PRICE_ID || "",
    PRO: process.env.STRIPE_PRO_PRICE_ID || "",
  };
  return map[plan] || "";
}
