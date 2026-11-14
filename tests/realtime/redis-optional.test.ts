import { test } from "node:test";
import assert from "node:assert/strict";
import { isRealtimeEnabled, LOCAL_REDIS_URL, resolveRedisUrl } from "../../src/lib/queue/redis-config";
import { realtimeOffResponse } from "../../src/lib/queue/sse-fallback";

test("explicit REDIS_URL is used everywhere", () => {
  assert.equal(
    resolveRedisUrl({ REDIS_URL: "rediss://u:p@x.upstash.io:6379", NODE_ENV: "production", VERCEL: "1" }),
    "rediss://u:p@x.upstash.io:6379"
  );
});

test("no localhost fallback in production or on Vercel (SKAI-1035)", () => {
  assert.equal(resolveRedisUrl({ NODE_ENV: "production" }), null);
  assert.equal(resolveRedisUrl({ NODE_ENV: "development", VERCEL: "1" }), null);
  assert.equal(resolveRedisUrl({ VERCEL_ENV: "preview" }), null);
  assert.equal(resolveRedisUrl({ NODE_ENV: "production", REDIS_URL: "   " }), null);
  assert.equal(isRealtimeEnabled({ NODE_ENV: "production" }), false);
});

test("local development keeps the localhost convenience", () => {
  assert.equal(resolveRedisUrl({ NODE_ENV: "development" }), LOCAL_REDIS_URL);
});

test("REDIS_ENABLED=false force-disables", () => {
  assert.equal(resolveRedisUrl({ REDIS_URL: "redis://r:6379", REDIS_ENABLED: "false" }), null);
});

test("with realtime off the streams answer 204, which stops EventSource reconnecting (SKAI-1952)", async () => {
  const res = realtimeOffResponse();
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("X-Realtime"), "disabled");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(await res.text(), "");
});

test("disabled shared client rejects fast and never dials localhost", async () => {
  const prevUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  process.env.REDIS_ENABLED = "false";
  const { redis } = await import("../../src/lib/queue/connection");
  const started = Date.now();
  await assert.rejects(redis.publish("notif:x", "{}"));
  assert.ok(Date.now() - started < 500);
  assert.notEqual(redis.status, "ready");
  redis.disconnect();
  delete process.env.REDIS_ENABLED;
  if (prevUrl) process.env.REDIS_URL = prevUrl;
});
