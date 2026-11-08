// ===========================================
// SkooleeAI - Redis / BullMQ Connection
// ===========================================

import IORedis from "ioredis";
import { resolveRedisUrl, warnRealtimeDisabledOnce } from "./redis-config";

export { isRealtimeEnabled } from "./redis-config";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

/**
 * A client that never dials anything and rejects every command at once
 * (no offline queue, no reconnect loop, no error events). Used when Redis is
 * disabled so existing `redis.publish(...).catch(() => {})` call sites keep
 * working without a localhost fallback.
 */
function createDisabledConnection(): IORedis {
  warnRealtimeDisabledOnce();
  const client = new IORedis({
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
  });
  client.on("error", () => {});
  client.connect = () => Promise.reject(new Error("Redis disabled: REDIS_URL not set"));
  return client;
}

function createRedisConnection(): IORedis {
  const url = resolveRedisUrl();
  if (!url) return createDisabledConnection();
  const client = new IORedis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });
  client.on("error", (err) => {
    console.error("[redis] connection error:", err?.message || err);
  });
  client.on("reconnecting", () => {
    console.warn("[redis] reconnecting...");
  });
  return client;
}

export const redis = globalForRedis.redis ?? createRedisConnection();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
