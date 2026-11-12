// ─────────────────────────────────────────────────────────────────
// Distributed rate limiting (docs/architecture/scale-10m-concurrent.md §3.7).
//
// The app runs on many serverless instances. A counter in process memory is
// per instance, so N warm instances quietly allowed N× every limit. Counters
// now live in Redis (one fixed window per key, one round trip) and every
// instance sees the same count.
//
// Redis is an accelerator, not a store: when it is unreachable or slow the
// limiter falls back to the old per-instance memory window, so a Redis outage
// loosens limits but never blocks a request or hangs it. A breaker skips Redis
// for a while after a failure so the fallback costs nothing per call.
//
// Keys are hashed before they reach Redis: callers key by IP, phone or user id
// and none of that belongs in a shared cache.
// ─────────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { isRealtimeEnabled } from "@/lib/queue/redis-config";

export type RateLimitOptions = { limit?: number; windowMs?: number };
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

/** Counts one hit in the window for `key` and reports the new count and the window's remaining time. */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
}

/** The subset of ioredis the Redis store needs, so tests can pass a fake. */
export interface RedisEvaluator {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// INCR and PEXPIRE in one atomic step. The expiry is set only on the first hit
// (fixed window); a key that somehow lost its TTL gets one back.
const HIT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local t = redis.call('PTTL', KEYS[1])
if t < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); t = tonumber(ARGV[1]) end
return {c, t}`;

export function redisStore(client: RedisEvaluator | (() => Promise<RedisEvaluator>)): RateLimitStore {
  return {
    async hit(key, windowMs) {
      const redis = typeof client === "function" ? await client() : client;
      const reply = await redis.eval(HIT_SCRIPT, 1, key, windowMs);
      if (!Array.isArray(reply) || reply.length !== 2) throw new Error("rate-limit: unexpected Redis reply");
      return { count: Number(reply[0]), ttlMs: Number(reply[1]) };
    },
  };
}

/** Per-instance fixed window. The fallback when Redis is off, and the store tests use. */
export function memoryStore({ maxKeys = 50_000, now = Date.now } = {}): RateLimitStore {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, windowMs) {
      const at = now();
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= at) {
        // Bounded memory: drop expired windows, then the oldest, before adding.
        if (hits.size >= maxKeys) {
          for (const [k, e] of hits) if (e.resetAt <= at) hits.delete(k);
          if (hits.size >= maxKeys) hits.delete(hits.keys().next().value!);
        }
        entry = { count: 0, resetAt: at + windowMs };
        hits.set(key, entry);
      }
      entry.count++;
      return { count: entry.count, ttlMs: entry.resetAt - at };
    },
  };
}

type LimiterConfig = {
  primary: RateLimitStore | null;
  fallback: RateLimitStore;
  timeoutMs?: number;
  breakerMs?: number;
  now?: () => number;
};

const TIMED_OUT = Symbol("rate-limit-timeout");

export function createRateLimiter({ primary, fallback, timeoutMs = 250, breakerMs = 30_000, now = Date.now }: LimiterConfig) {
  let breakerOpenUntil = 0;

  async function viaPrimary(key: string, windowMs: number) {
    if (!primary || now() < breakerOpenUntil) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        primary.hit(key, windowMs),
        new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs); }),
      ]);
      if (result === TIMED_OUT) throw new Error("timeout");
      breakerOpenUntil = 0;
      return result;
    } catch {
      breakerOpenUntil = now() + breakerMs;
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return async function rateLimit(scope: string, { limit = 10, windowMs = 60_000 }: RateLimitOptions = {}): Promise<RateLimitResult> {
    const key = `rl:${createHash("sha256").update(scope).digest("base64url").slice(0, 32)}`;
    const { count, ttlMs } = (await viaPrimary(key, windowMs)) ?? (await fallback.hit(key, windowMs));
    const ok = count <= limit;
    return { ok, remaining: Math.max(0, limit - count), retryAfterSeconds: ok ? 0 : Math.max(1, Math.ceil(ttlMs / 1000)) };
  };
}

/**
 * The shared limiter. Redis is used only when REDIS_URL is set explicitly: local
 * development and tests without it keep the per-instance window and never dial
 * the localhost fallback. The client is imported lazily so importing this file
 * does not connect until the first limited request.
 */
export const rateLimit = createRateLimiter({
  primary: process.env.REDIS_URL?.trim() && isRealtimeEnabled() ? redisStore(async () => (await import("@/lib/queue/connection")).redis) : null,
  fallback: memoryStore(),
});
