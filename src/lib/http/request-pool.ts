/** Requests a bulk action keeps in flight at once (the database sits behind a pooler). */
export const BULK_REQUEST_CONCURRENCY = 4;

/**
 * Run `fn` over `items` with at most `limit` calls in flight. Results keep input order.
 * The first failure stops new calls from starting and rejects, like Promise.all.
 */
export async function mapWithLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.floor(limit) || 1), items.length) }, worker));
  return results;
}

/**
 * Latest-wins guard for a UI read: starting a request aborts the previous one, and only
 * the newest request reports itself current, so a slow older answer never overwrites state.
 */
export function latestRequest() {
  let current: AbortController | null = null;
  return {
    start() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return { signal: controller.signal, isCurrent: () => current === controller && !controller.signal.aborted };
    },
    cancel() {
      current?.abort();
      current = null;
    },
  };
}

/**
 * Page-wide cap for one kind of read: at most `limit` calls of the returned `run` are in flight at once and the
 * rest start in call order as slots free up. A call whose signal aborts while it waits never starts. Start any
 * timeout inside `fn`, so a request is timed from when it is sent, not from when it was queued.
 */
export function requestLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  // A finished call hands its slot straight to the next waiter, so a new caller can never jump the queue.
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };
  return async function run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw signal.reason;
    if (active < limit) active += 1;
    else
      await new Promise<void>((resolve, reject) => {
        const start = () => {
          signal?.removeEventListener("abort", cancel);
          resolve();
        };
        const cancel = () => {
          waiting.splice(waiting.indexOf(start), 1);
          reject(signal?.reason);
        };
        waiting.push(start);
        signal?.addEventListener("abort", cancel, { once: true });
      });
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
