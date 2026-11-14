// Scale: a small per-instance memo for read-mostly configuration that every request needs (menus, locale
// timelines). Entries live for `ttlMs`; the map is bounded; a failed computation is not remembered. Use it only
// for data where being up to `ttlMs` stale is acceptable — never for authorization decisions.
export function createTtlMemo({ ttlMs, maxEntries = 5_000, enabled = true }: { ttlMs: number; maxEntries?: number; enabled?: boolean }) {
  const entries = new Map<string, { at: number; value: Promise<unknown> }>();
  return {
    get<T>(key: string, compute: () => Promise<T>, now = Date.now()): Promise<T> {
      if (!enabled) return compute();
      const hit = entries.get(key);
      if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
      const value = compute();
      entries.set(key, { at: now, value });
      value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key); });
      return value;
    },
    clear() {
      entries.clear();
    },
  };
}
