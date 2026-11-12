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
