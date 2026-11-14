// SKAI-1973: a Redis layer behind a per-instance createTtlMemo, so a new serverless instance reuses a menu or badge
// another instance already computed instead of paying the cold cost again. Redis is an accelerator only: off unless
// REDIS_URL is set; on any Redis error or timeout the value is computed from the database (createRedisGuard). Only
// successful results are stored; a thrown compute is never written. Use it only for presentation payloads keyed by
// everything that changes the answer (user, school, role, access version, …) — never for an authorization or
// exam-lockdown decision.
import { createHash } from "node:crypto";
import { createRedisGuard, type RedisGuard } from "@/lib/redis/guard";

/** The subset of ioredis this needs, so tests can pass a fake. */
export interface SharedMemoClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
}

export function sharedMemoEnabled(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.REDIS_URL?.trim()) && env.REDIS_ENABLED?.trim().toLowerCase() !== "false";
}

const defaultClient = async () => (await import("@/lib/queue/connection")).redis as unknown as SharedMemoClient;

export function createSharedMemo({ name, ttlSeconds, enabled = sharedMemoEnabled(), client = defaultClient, guard = createRedisGuard() }: {
  name: string;
  ttlSeconds: number;
  enabled?: boolean;
  client?: () => Promise<SharedMemoClient>;
  guard?: RedisGuard;
}) {
  const redisKey = (key: string) => `sm:${name}:${createHash("sha256").update(key).digest("base64url").slice(0, 32)}`;
  return {
    /** `compute` must resolve to a JSON-serialisable value. */
    async get<T>(key: string, compute: () => Promise<T>): Promise<T> {
      if (!enabled) return compute();
      const id = redisKey(key);
      const raw = await guard(async () => (await client()).get(id), null);
      if (typeof raw === "string") {
        try { return (JSON.parse(raw) as { v: T }).v; } catch { /* a corrupt entry is just a miss */ }
      }
      const value = await compute();
      await guard(async () => (await client()).set(id, JSON.stringify({ v: value }), "EX", ttlSeconds), null);
      return value;
    },
  };
}
