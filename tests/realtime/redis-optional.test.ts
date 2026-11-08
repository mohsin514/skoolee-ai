import { test } from "node:test";
import assert from "node:assert/strict";
import { isRealtimeEnabled, LOCAL_REDIS_URL, resolveRedisUrl } from "../../src/lib/queue/redis-config";
import { realtimeDisabledBody, realtimeDisabledResponse } from "../../src/lib/queue/sse-fallback";

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

test("disabled SSE body announces realtime off with a slow retry", async () => {
  const body = realtimeDisabledBody(['event: init\ndata: {"unreadCount":2}\n\n']);
  assert.match(body, /^retry: 60000\n\n/);
  assert.match(body, /event: init/);
  assert.match(body, /event: realtime\ndata: {"enabled":false}/);
  const res = realtimeDisabledResponse();
  assert.equal(res.headers.get("Content-Type"), "text/event-stream");
  assert.equal(res.headers.get("X-Realtime"), "disabled");
  assert.match(await res.text(), /"enabled":false/);
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
