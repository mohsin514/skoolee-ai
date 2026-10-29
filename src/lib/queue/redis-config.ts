// ===========================================
// SkooleeAI - Redis configuration (SKAI-1035)
// ===========================================
//
// Redis is optional. It powers live push (SSE), presence and background
// queues, but nothing core depends on it. When REDIS_URL is absent:
//   - local development (not production, not on Vercel) still falls back to
//     redis://localhost:6379 so a local `redis-server` just works;
//   - production / serverless (Vercel) treats realtime as DISABLED. There is
//     no localhost Redis on a serverless host, and dialing one only produces
//     ECONNREFUSED / "Connection is closed" log spam.
// REDIS_ENABLED=false force-disables Redis even when a URL is present.

export const LOCAL_REDIS_URL = "redis://localhost:6379";

type Env = Record<string, string | undefined>;

function isServerless(env: Env): boolean {
  return env.NODE_ENV === "production" || Boolean(env.VERCEL) || Boolean(env.VERCEL_ENV);
}

/** The Redis URL to use, or null when realtime is disabled. */
export function resolveRedisUrl(env: Env = process.env): string | null {
  if ((env.REDIS_ENABLED ?? "").trim().toLowerCase() === "false") return null;
  const url = env.REDIS_URL?.trim();
  if (url) return url;
  return isServerless(env) ? null : LOCAL_REDIS_URL;
}

export function isRealtimeEnabled(env: Env = process.env): boolean {
  return resolveRedisUrl(env) !== null;
}

let warned = false;
/** Logs once per instance that realtime is off, instead of per-request errors. */
export function warnRealtimeDisabledOnce(): void {
  if (warned) return;
  warned = true;
  console.info("[redis] REDIS_URL not set: realtime push disabled; clients fall back to polling.");
}
