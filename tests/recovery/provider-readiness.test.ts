import assert from "node:assert/strict";
import { test } from "node:test";
import { emailProviderReadiness } from "../../src/lib/email/readiness";
import { paymentConfiguration } from "../../src/lib/payments/configuration";
import { hasEmailProviderConfig, sendEmailMessage, sendInviteEmail } from "../../src/lib/email";

test("email distinguishes missing, invalid, development, disabled and configured-unverified", () => {
  assert.equal(emailProviderReadiness({}).state, "missing");
  assert.equal(emailProviderReadiness({ SMTP_PASS: "synthetic-secret" }).state, "incomplete");
  assert.equal(emailProviderReadiness({ SMTP_PORT: "not-a-port" }).state, "invalid");
  assert.equal(emailProviderReadiness({ SMTP_HOST: "https://invalid.example" }).state, "invalid");
  assert.equal(emailProviderReadiness({ SMTP_AUTH: "false" }).state, "incomplete");
  assert.equal(emailProviderReadiness({ SMTP_AUTH: "false", SMTP_HOST: "127.0.0.1", SMTP_PORT: "2525" }).state, "configured-unverified");
  for (const env of [{ EMAIL_DEV_MODE: "true" }, { EMAIL_DEV_MODE: "true", SMTP_USER: "synthetic", SMTP_PASS: "synthetic-secret" }]) {
    assert.deepEqual(emailProviderReadiness(env), { mode: "development", state: "development-bypass", configured: false, connectivity: "not-tested" });
  }
  assert.equal(emailProviderReadiness({ EMAIL_DEV_MODE: "true", DISABLE_OUTBOUND_MESSAGES: "true" }).mode, "disabled");
  const configured = emailProviderReadiness({ SMTP_USER: "synthetic@example.invalid", SMTP_PASS: "synthetic-secret" });
  assert.equal(configured.configured, true);
  assert.equal(configured.connectivity, "not-tested");
  assert.doesNotMatch(JSON.stringify(configured), /synthetic-secret|example.invalid/);
});

test("no payment credentials or placeholder merchant never advertises checkout", () => {
  for (const env of [{}, { SAFEPAY_MERCHANT_ID: "dev_mode" }, { SAFEPAY_MERCHANT_ID: "synthetic", SAFEPAY_API_KEY: "synthetic-key" }]) {
    const config = paymentConfiguration({}, env);
    assert.deepEqual(config.availableMethods, []);
    assert.equal(config.method, null);
    assert.equal(config.bank, null);
    assert.equal(config.safepay, undefined);
  }
  assert.equal(paymentConfiguration({}, { SAFEPAY_MERCHANT_ID: "dev_mode" }).readiness.safepay.state, "invalid");
  assert.equal(paymentConfiguration({}, { SAFEPAY_MERCHANT_ID: "synthetic" }).readiness.safepay.state, "incomplete");
});

test("payment configuration distinguishes sandbox/live from provider connectivity", () => {
  const env = { SAFEPAY_MERCHANT_ID: "synthetic", SAFEPAY_API_KEY: "synthetic-key", SAFEPAY_SECRET_KEY: "synthetic-secret" };
  const sandbox = paymentConfiguration({}, env);
  assert.deepEqual(sandbox.availableMethods, ["safepay"]);
  assert.deepEqual(sandbox.readiness.safepay, { state: "configured-unverified", mode: "sandbox", connectivity: "not-tested" });
  assert.equal(paymentConfiguration({}, { ...env, SAFEPAY_PRODUCTION: "true" }).readiness.safepay.mode, "live");
  assert.equal(paymentConfiguration({}, { ...env, SAFEPAY_PRODUCTION: "maybe" }).readiness.safepay.state, "invalid");
  assert.doesNotMatch(JSON.stringify(sandbox), /synthetic-key|synthetic-secret/);
});

test("Stripe requires real configuration shape plus completed onboarding; bank requires complete details", () => {
  const stripe = { STRIPE_SECRET_KEY: "sk_test_synthetic" };
  assert.equal(paymentConfiguration({}, stripe).readiness.stripe.state, "incomplete");
  assert.equal(paymentConfiguration({ connectedAccountId: "acct_synthetic", onboardingComplete: "true" }, stripe).readiness.stripe.state, "incomplete");
  assert.equal(paymentConfiguration({ connectedAccountId: "acct_synthetic", onboardingComplete: true }, stripe).readiness.stripe.state, "configured-unverified");
  assert.equal(paymentConfiguration({ connectedAccountId: "wrong", onboardingComplete: true }, stripe).readiness.stripe.state, "invalid");
  assert.equal(paymentConfiguration({ bankName: "Synthetic bank" }, {}).bank, null);
  const bank = paymentConfiguration({ bankName: "Synthetic bank", accountTitle: "Synthetic", accountNumber: "0000" }, {});
  assert.deepEqual(bank.availableMethods, ["bank_transfer"]);
  assert.equal(bank.readiness.bank_transfer.mode, "manual");
});

test("actual email consumers cannot persist SENT for a development bypass or disabled delivery", async () => {
  const previousDev = process.env.EMAIL_DEV_MODE, previousDisabled = process.env.DISABLE_OUTBOUND_MESSAGES;
  try {
    process.env.EMAIL_DEV_MODE = "true";
    process.env.DISABLE_OUTBOUND_MESSAGES = "false";
    assert.equal(hasEmailProviderConfig(), false);
    const result = await sendEmailMessage({ to: "synthetic@example.invalid", subject: "Synthetic readiness", text: "Synthetic body" });
    assert.equal(result.success, false);
    assert.match(result.error || "", /bypassed/);
    await assert.rejects(sendInviteEmail("synthetic@example.invalid", "TEACHER", "Synthetic school", "synthetic-token"), /dispatch failed/);
    process.env.DISABLE_OUTBOUND_MESSAGES = "true";
    const disabled = await sendEmailMessage({ to: "synthetic@example.invalid", subject: "Synthetic readiness", text: "Synthetic body" });
    assert.equal(disabled.success, false);
    assert.match(disabled.error || "", /disabled/);
  } finally {
    if (previousDev === undefined) delete process.env.EMAIL_DEV_MODE; else process.env.EMAIL_DEV_MODE = previousDev;
    if (previousDisabled === undefined) delete process.env.DISABLE_OUTBOUND_MESSAGES; else process.env.DISABLE_OUTBOUND_MESSAGES = previousDisabled;
  }
});
