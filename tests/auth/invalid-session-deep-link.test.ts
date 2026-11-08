import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// SKAI-1660: client-side session-expiry recovery keeps the current deep link for after sign-in.
const location = { pathname: "/admin", search: "?view=fees&tab=invoices", hash: "", href: "" };
(globalThis as any).window = { location };
(globalThis as any).localStorage = { length: 0, key: () => null, getItem: () => null, removeItem() {}, setItem() {} };
globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;

beforeEach(() => { location.href = ""; });

test("the expired-session redirect carries the deep link", async () => {
  const { signOutInvalidSession } = await import("../../src/lib/auth/invalid-session");
  await signOutInvalidSession();
  const url = new URL(location.href, "http://x");
  assert.equal(url.pathname, "/login");
  assert.equal(url.searchParams.get("reason"), "session-expired");
  assert.equal(url.searchParams.get("redirect"), "/admin?view=fees&tab=invoices");
});
