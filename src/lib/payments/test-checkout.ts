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
const PRODUCTION_HOST = /(^|\.)skooleeai\.com$/i;

function hostOf(value: string | undefined) {
  if (!value) return "";
  try { return new URL(value.includes("://") ? value : `https://${value}`).hostname; } catch { return ""; }
}

/**
 * Explicit opt-in (ALLOW_TEST_CHECKOUT=true) on a local `next dev` server or a non-production deployment
 * (the dev site on Vercel). Production is recognised by Vercel's own project URL (always set on Vercel)
 * or the app URL: anything on skooleeai.com can never take dummy payments, whatever the flag says.
 */
export function testCheckoutEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.ALLOW_TEST_CHECKOUT !== "true") return false;
  if (env.NODE_ENV === "development") return true;
  const hosts = [env.VERCEL_PROJECT_PRODUCTION_URL, env.NEXT_PUBLIC_APP_URL].map(hostOf).filter(Boolean);
  // A production build must say where it runs, and none of those places may be the live app.
  return hosts.length > 0 && !hosts.some((host) => PRODUCTION_HOST.test(host));
}

/** Where the fake payment page lives (relative, so it works on any local port). */
export const testCheckoutUrl = (intentId: string) => `/onboarding/package/test-checkout?intentId=${encodeURIComponent(intentId)}`;

/** The SafePay sandbox card page (src/app/safepay) for an onboarding package, so dummy payments look like SafePay. */
export function safePaySandboxUrl(intentId: string, plan: string, billingPeriod: string, amountLabel: string) {
  const params = new URLSearchParams({ kind: "PACKAGE", intentId, orderRef: intentId, plan, billingPeriod, amountLabel });
  return `/onboarding/package/safepay?${params.toString()}`;
}
