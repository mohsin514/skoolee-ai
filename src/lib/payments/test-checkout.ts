/**
 * Development-only test checkout: lets a paid package be selected and "paid"
 * on a local `next dev` server that has no real payment keys.
 *
 * Both gates are required, so a build (`next build`/`next start`, every
 * deployment) can never offer it, even with the flag copied into its env:
 *  - NODE_ENV === "development" (only `next dev` sets this)
 *  - ALLOW_TEST_CHECKOUT === "true" (explicit opt-in in the local .env)
 *
 * It is a fallback: when a real rail (Stripe, SafePay, bank transfer) is
 * usable for the school, the real rail is used instead.
 */
export const TEST_CHECKOUT_PROVIDER = "TEST" as const;

export function testCheckoutEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" && env.ALLOW_TEST_CHECKOUT === "true";
}

/** Where the fake payment page lives (relative, so it works on any local port). */
export const testCheckoutUrl = (intentId: string) => `/onboarding/package/test-checkout?intentId=${encodeURIComponent(intentId)}`;

/** The SafePay sandbox card page (src/app/safepay) for an onboarding package, so dummy payments look like SafePay. */
export function safePaySandboxUrl(intentId: string, plan: string, billingPeriod: string, amountLabel: string) {
  const params = new URLSearchParams({ kind: "PACKAGE", intentId, orderRef: intentId, plan, billingPeriod, amountLabel });
  return `/onboarding/package/safepay?${params.toString()}`;
}
