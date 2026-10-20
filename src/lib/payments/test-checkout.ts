/**
 * Development-only test checkout: lets a paid package be selected and "paid"
 * on a local `next dev` server that has no real payment keys.
 *
 * Gates (see testCheckoutEnabled): the explicit ALLOW_TEST_CHECKOUT=true opt-in, plus either a local
 * `next dev` server or a Vercel deployment whose NEXT_PUBLIC_APP_URL is not the production app.
 *
 * It is a fallback: when a real rail (Stripe, SafePay, bank transfer) is
 * usable for the school, the real rail is used instead.
 */
export const TEST_CHECKOUT_PROVIDER = "TEST" as const;

/** The live production app: dummy payments are never possible there, whatever the flag says. */
const PRODUCTION_HOSTS = new Set(["app.skooleeai.com"]);

function isProductionApp(env: Record<string, string | undefined>) {
  try { return PRODUCTION_HOSTS.has(new URL(env.NEXT_PUBLIC_APP_URL || "").hostname); } catch { return false; }
}

/**
 * Explicit opt-in (ALLOW_TEST_CHECKOUT=true) on a local `next dev` server or a non-production deployment
 * (the dev site on Vercel). Never on the production app, and never on a production build that does not
 * name its own non-production URL.
 */
export function testCheckoutEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.ALLOW_TEST_CHECKOUT !== "true") return false;
  if (env.NODE_ENV === "development") return true;
  return Boolean(env.NEXT_PUBLIC_APP_URL) && !isProductionApp(env) && env.VERCEL_ENV !== undefined;
}

/** Where the fake payment page lives (relative, so it works on any local port). */
export const testCheckoutUrl = (intentId: string) => `/onboarding/package/test-checkout?intentId=${encodeURIComponent(intentId)}`;

/** The SafePay sandbox card page (src/app/safepay) for an onboarding package, so dummy payments look like SafePay. */
export function safePaySandboxUrl(intentId: string, plan: string, billingPeriod: string, amountLabel: string) {
  const params = new URLSearchParams({ kind: "PACKAGE", intentId, orderRef: intentId, plan, billingPeriod, amountLabel });
  return `/onboarding/package/safepay?${params.toString()}`;
}
