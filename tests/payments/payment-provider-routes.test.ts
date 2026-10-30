import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolvePaymentProvider } from "../../src/lib/payments/provider";
import { createSafePayOrder } from "../../src/lib/payments/safepay";

// SKAI-1168: checkout routes go through resolvePaymentProvider, and SafePay sees the same request.
const ROUTES = ["src/app/api/fees/pay-online/route.ts", "src/app/api/onboarding/package/route.ts", "src/app/api/stripe/checkout/route.ts"];
const env = { SAFEPAY_MERCHANT_ID: "test_merchant", SAFEPAY_API_KEY: "test_api", SAFEPAY_SECRET_KEY: "test_secret" };

async function captureFetch(run: () => Promise<unknown>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: { token: "tok_1" } }), { status: 200 });
  }) as typeof fetch;
  try { return { result: await run(), calls }; } finally { globalThis.fetch = original; }
}

test("checkout routes no longer call SafePay directly", () => {
  for (const file of ROUTES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /createSafePayOrder|payments\/safepay/, file);
    assert.match(source, /resolvePaymentProvider\("PKR"\)/, file);
  }
});

test("the SafePay adapter sends the exact request the routes used to send", async () => {
  const returnUrl = "http://localhost:3000/billing?safepay_status=completed&ref=SKL-1";
  for (const amount of [1500, 2499.5, 0.29, 400000]) {
    const direct = await captureFetch(() => createSafePayOrder(
      { merchantId: env.SAFEPAY_MERCHANT_ID, apiKey: env.SAFEPAY_API_KEY, secretKey: env.SAFEPAY_SECRET_KEY, returnUrl, sandbox: true },
      { amount, orderRef: "SKL-1", description: "Fee", customerEmail: "a@example.test", customerName: "A", metadata: { orderRef: "SKL-1", kind: "FEE" } },
    ));
    const viaProvider = await captureFetch(() => resolvePaymentProvider("PKR", env)!.createCheckout({
      amountMinor: Math.round(amount * 100), currency: "PKR", orderRef: "SKL-1", description: "Fee", returnUrl,
      customer: { email: "a@example.test", name: "A" }, metadata: { orderRef: "SKL-1", kind: "FEE" },
    }));
    assert.equal(viaProvider.calls[0].url, direct.calls[0].url);
    assert.deepEqual(viaProvider.calls[0].init, direct.calls[0].init, `amount ${amount}`);
    assert.deepEqual(viaProvider.result, { ok: true, redirectUrl: "https://sandbox.safepay.pk/checkout/tok_1", providerRef: "tok_1" });
  }
});

test("SAFEPAY_PRODUCTION=true still targets the live endpoint", async () => {
  const { calls } = await captureFetch(() => resolvePaymentProvider("PKR", { ...env, SAFEPAY_PRODUCTION: "true" })!.createCheckout({
    amountMinor: 100, currency: "PKR", orderRef: "o", description: "d", returnUrl: "http://localhost/r",
  }));
  assert.equal(calls[0].url, "https://api.safepay.pk/v1/orders");
});

test("a SafePay error surfaces as PROVIDER_ERROR with SafePay's message", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "bad merchant" }), { status: 401 })) as typeof fetch;
  try {
    const result = await resolvePaymentProvider("PKR", env)!.createCheckout({ amountMinor: 100, currency: "PKR", orderRef: "o", description: "d", returnUrl: "http://localhost/r" });
    assert.deepEqual(result, { ok: false, code: "PROVIDER_ERROR", message: "bad merchant" });
  } finally { globalThis.fetch = original; }
});

test("GCC skeletons stay behind PAYMENT_GCC_RAILS_ENABLED", () => {
  assert.equal(resolvePaymentProvider("AED", { ...env, PAYMENT_GCC_PROVIDER: "stripe_uae" }), null);
  assert.equal(resolvePaymentProvider("AED", { ...env, PAYMENT_GCC_RAILS_ENABLED: "true", PAYMENT_GCC_PROVIDER: "stripe_uae", NODE_ENV: "production" }), null);
});
