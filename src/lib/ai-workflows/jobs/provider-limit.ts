import { redis } from "@/lib/queue/connection";
import { WorkflowError } from "../errors";

/**
 * A platform-wide limit on model calls (design-slices §11): every school shares one OpenAI quota, so
 * a fixed one-second window in Redis caps calls across all workers and requests. Over the limit the
 * caller pauses with backoff instead of failing (no credit is charged for an attempt that never ran).
 * If Redis is unreachable the call goes ahead: the limiter protects the quota, it must not take AI down.
 */
export const PROVIDER_CALLS_PER_SECOND = Math.max(1, Number(process.env.AI_WORKFLOWS_PROVIDER_RPS ?? 8));

export async function acquireProviderSlot(now = Date.now(), limit = PROVIDER_CALLS_PER_SECOND) {
  const key = `aiwf:provider:${Math.floor(now / 1000)}`;
  let used: number;
  try {
    const result = await redis.multi().incr(key).expire(key, 2).exec();
    used = Number(result?.[0]?.[1] ?? 0);
  } catch { return; }
  if (used > limit) throw new WorkflowError("PROVIDER_UNAVAILABLE", { reason: "RATE_LIMITED" });
}

/** Retry schedule for a provider outage or rate limit: 30 s, 1 min, 2 min, 4 min, 8 min, then give up. */
export const PROVIDER_RETRIES = 5;
export const providerBackoffMs = (attempt: number) => Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 8 * 60_000);
