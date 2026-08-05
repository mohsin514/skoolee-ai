// ===========================================
// SkooleeAI - Redis / BullMQ Connection
// ===========================================

import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
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
