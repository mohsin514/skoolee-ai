import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp } from "../../src/lib/security/csp-policy";

/**
 * SKAI-951 / NFR-SEC-04 — the production CSP must not permit inline or eval
 * script execution; development may, for HMR.
 */

const scriptSrcOf = (csp: string) =>
  csp.split(";").map((s) => s.trim()).find((d) => d.startsWith("script-src")) || "";

test("production script-src uses a nonce + strict-dynamic, no unsafe-*", () => {
  const csp = buildCsp({ nonce: "abc123", isProd: true });
  const s = scriptSrcOf(csp);
  assert.match(s, /'nonce-abc123'/);
  assert.match(s, /'strict-dynamic'/);
  assert.doesNotMatch(s, /'unsafe-inline'/);
  assert.doesNotMatch(s, /'unsafe-eval'/);
});

test("development script-src keeps unsafe-inline/eval for HMR", () => {
  const s = scriptSrcOf(buildCsp({ nonce: "x", isProd: false }));
  assert.match(s, /'unsafe-inline'/);
  assert.match(s, /'unsafe-eval'/);
});

test("the stale img.clerk.com allow-list is gone", () => {
  for (const isProd of [true, false]) {
    assert.doesNotMatch(buildCsp({ nonce: "x", isProd }), /clerk/);
  }
});

test("core hardening directives are present", () => {
  const csp = buildCsp({ nonce: "x", isProd: true });
  for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "default-src 'self'"]) {
    assert.ok(csp.includes(d), `missing directive: ${d}`);
  }
});

test("payment frames remain allowed", () => {
  const csp = buildCsp({ nonce: "x", isProd: true });
  assert.match(csp, /frame-src[^;]*js\.stripe\.com/);
  assert.match(csp, /frame-src[^;]*checkout\.stripe\.com/);
});
