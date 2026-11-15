import { test } from "node:test";
import assert from "node:assert/strict";
import SafePaySandboxLayout from "../../src/app/safepay/layout";
// SKAI-2156: the /safepay sandbox card form is a 404 in production and renders only outside it.
const env = process.env as Record<string, string | undefined>;
test("production: /safepay is not found", () => {
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    assert.throws(() => SafePaySandboxLayout({ children: "form" }), (error: { digest?: string }) => String(error.digest).includes("404"));
  } finally {
    env.NODE_ENV = previous;
  }
});
test("development: the sandbox form renders", () => {
  const previous = env.NODE_ENV;
  env.NODE_ENV = "development";
  try {
    assert.equal(SafePaySandboxLayout({ children: "form" }), "form");
  } finally {
    env.NODE_ENV = previous;
  }
});
