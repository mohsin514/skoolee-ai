// ─────────────────────────────────────────────────────────────────
// Redis as an accelerator, never a dependency (docs/architecture/scale-10m-concurrent.md §3.7).
//
// Every Redis call goes through a guard: a short timeout, and a breaker that
// skips Redis for a while after a failure so a dead or slow Redis costs one
// timeout per instance, not one per request. The shared ioredis client is built
// with `maxRetriesPerRequest: null` (BullMQ needs it), which makes an awaited
// command against a missing server wait forever; the timeout is what stops that
// from holding a request open.
//
// The breaker opens only after several failures in a row: the first call on a
// cold instance also pays for connecting, and one slow handshake should not
// switch Redis off for that instance.
// ─────────────────────────────────────────────────────────────────

export type RedisGuard = <T>(work: () => Promise<T>, fallback: T) => Promise<T>;

const TIMED_OUT = Symbol("redis-guard-timeout");

export function createRedisGuard({ timeoutMs = 250, breakerMs = 30_000, failuresToOpen = 3, now = Date.now }: { timeoutMs?: number; breakerMs?: number; failuresToOpen?: number; now?: () => number } = {}) {
  let openUntil = 0;
  let failures = 0;
  const guard: RedisGuard = async (work, fallback) => {
    if (now() < openUntil) return fallback;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        work(),
        new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs); }),
      ]);
      if (result === TIMED_OUT) throw new Error("timeout");
      failures = 0;
      return result;
    } catch {
      failures++;
      if (failures >= failuresToOpen) { openUntil = now() + breakerMs; failures = 0; }
      return fallback;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  return Object.assign(guard, {
    /** True while the breaker is open, i.e. Redis is presumed unavailable. */
    isOpen: () => now() < openUntil,
  });
}
