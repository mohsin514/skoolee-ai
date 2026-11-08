import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp } from "../../src/lib/http/client-ip";

// SKO-457: rate limits key on an address the client cannot choose.
const h = (values: Record<string, string>) => new Headers(values);

test("on Vercel the platform headers win over a client-supplied chain", () => {
  assert.equal(clientIp(h({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 203.0.113.9" }), { VERCEL: "1", NODE_ENV: "production" }), "203.0.113.9");
  assert.equal(clientIp(h({ "x-real-ip": "203.0.113.10", "x-forwarded-for": "1.1.1.1" }), { VERCEL: "1", NODE_ENV: "production" }), "203.0.113.10");
});

test("behind our own proxies the client is the entry that many hops from the right", () => {
  const spoofed = h({ "x-forwarded-for": "6.6.6.6, 198.51.100.4, 10.0.0.2" });
  assert.equal(clientIp(spoofed, { TRUSTED_PROXY_HOPS: "2", NODE_ENV: "production" }), "198.51.100.4", "the client-written first entry is ignored");
  assert.equal(clientIp(spoofed, { TRUSTED_PROXY_HOPS: "1", NODE_ENV: "production" }), "10.0.0.2");
  assert.equal(clientIp(h({ "x-forwarded-for": "198.51.100.4" }), { TRUSTED_PROXY_HOPS: "2", NODE_ENV: "production" }), "unknown", "a chain shorter than the proxies is not trusted");
});

test("an unconfigured production server trusts no header; development keeps the first hop", () => {
  assert.equal(clientIp(h({ "x-forwarded-for": "6.6.6.6" }), { NODE_ENV: "production" }), "untrusted-proxy");
  assert.equal(clientIp(h({ "x-forwarded-for": "6.6.6.6" }), { NODE_ENV: "production" }), clientIp(h({ "x-forwarded-for": "7.7.7.7" }), { NODE_ENV: "production" }), "rotating the header does not reset a limit");
  assert.equal(clientIp(h({ "x-forwarded-for": "192.0.2.1, 10.0.0.1" }), { NODE_ENV: "development" }), "192.0.2.1");
});
