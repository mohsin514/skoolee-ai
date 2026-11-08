import assert from "node:assert/strict";
import test from "node:test";
import { currencyExponent, gccRailsEnabled, gccSkeletonProvider, resolvePaymentProvider } from "../../src/lib/payments/provider";

const flagOn = { PAYMENT_GCC_RAILS_ENABLED: "true", PAYMENT_GCC_PROVIDER: "tap", NODE_ENV: "development" };

test("PKR keeps SafePay; other currencies get no rail while the flag is off", () => {
  assert.equal(resolvePaymentProvider("PKR", {})?.id, "safepay");
  assert.equal(resolvePaymentProvider("AED", {}), null);
  assert.equal(resolvePaymentProvider("KWD", { PAYMENT_GCC_PROVIDER: "tap" }), null);
});

test("the flag never turns on in production", () => {
  assert.equal(gccRailsEnabled({ ...flagOn, NODE_ENV: "production" }), false);
  assert.equal(resolvePaymentProvider("KWD", { ...flagOn, NODE_ENV: "production" }), null);
});

test("with the flag on, only the named provider and its currencies resolve", () => {
  assert.equal(resolvePaymentProvider("KWD", flagOn)?.id, "tap");
  assert.equal(resolvePaymentProvider("EGP", flagOn), null, "Tap skeleton does not list EGP");
  assert.equal(resolvePaymentProvider("AED", { ...flagOn, PAYMENT_GCC_PROVIDER: "unknown" }), null);
});

test("skeletons never create a checkout or accept a webhook", async () => {
  for (const id of ["stripe_uae", "checkout_com", "telr", "paytabs", "network_international", "tap"] as const) {
    const provider = gccSkeletonProvider(id);
    const result = await provider.createCheckout({ amountMinor: 1000, currency: provider.currencies[0], orderRef: "o1", description: "d", returnUrl: "http://localhost/r" });
    assert.equal(result.ok, false);
    assert.equal(provider.verifyWebhook({ rawBody: "{}", headers: {} }), false);
  }
});

test("SafePay adapter refuses a non-PKR currency without a network call", async () => {
  const result = await resolvePaymentProvider("PKR", {})!.createCheckout({ amountMinor: 100, currency: "AED", orderRef: "o", description: "d", returnUrl: "http://localhost/r" });
  assert.deepEqual(result.ok ? null : result.code, "CURRENCY_UNSUPPORTED");
});

test("three-decimal GCC dinars", () => {
  assert.equal(currencyExponent("KWD"), 3);
  assert.equal(currencyExponent("AED"), 2);
});
