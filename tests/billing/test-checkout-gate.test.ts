import { test } from "node:test";
import assert from "node:assert/strict";
import { testCheckoutEnabled } from "../../src/lib/payments/test-checkout";

test("the SafePay sandbox needs the explicit flag", () => {
  assert.equal(testCheckoutEnabled({ NODE_ENV: "development" }), false);
});
test("local next dev and the dev deployment can opt in", () => {
  assert.equal(testCheckoutEnabled({ NODE_ENV: "development", ALLOW_TEST_CHECKOUT: "true" }), true);
  assert.equal(testCheckoutEnabled({ NODE_ENV: "production", VERCEL_ENV: "production", ALLOW_TEST_CHECKOUT: "true", NEXT_PUBLIC_APP_URL: "https://skoolee-ai-dev.vercel.app" }), true);
  assert.equal(testCheckoutEnabled({ NODE_ENV: "production", ALLOW_TEST_CHECKOUT: "true", VERCEL_PROJECT_PRODUCTION_URL: "skoolee-ai-dev.vercel.app" }), true, "Vercel's project URL is enough");
});
test("the production app can never take dummy payments", () => {
  assert.equal(testCheckoutEnabled({ NODE_ENV: "production", VERCEL_ENV: "production", ALLOW_TEST_CHECKOUT: "true", NEXT_PUBLIC_APP_URL: "https://app.skooleeai.com" }), false);
  assert.equal(testCheckoutEnabled({ NODE_ENV: "production", ALLOW_TEST_CHECKOUT: "true" }), false, "an unnamed production build stays closed");
  assert.equal(testCheckoutEnabled({ NODE_ENV: "production", ALLOW_TEST_CHECKOUT: "true", VERCEL_PROJECT_PRODUCTION_URL: "app.skooleeai.com", NEXT_PUBLIC_APP_URL: "https://skoolee-ai-dev.vercel.app" }), false);
});
