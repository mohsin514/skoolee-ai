/**
 * Runs `worker` over `items` with at most `limit` calls in flight at once, so a long list finishes in
 * about items/limit round trips instead of one after another, without flooding the server or a provider.
 * Every item is attempted exactly once; a worker that throws does not stop the others.
 */
export async function runBounded<T>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      try { await worker(items[index], index); } catch { /* the worker records its own failure */ }
    }
  };
  await Promise.all(Array.from({ length: width }, lane));
}
