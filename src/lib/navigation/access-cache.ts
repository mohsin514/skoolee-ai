// Scale: the workspace menu (module visibility + capability keys) costs ~20 existence queries and every page load
// asks for it. It is presentation only — each API and page still enforces its own gate — so a per-instance cache
// for a short time, keyed by everything that changes the answer (user, school, campus, role, access version),
// is safe: a role or access change bumps accessVersion and misses at once; data-driven menu items appear within
// the TTL.
const TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;
const entries = new Map<string, { at: number; value: Promise<unknown> }>();

export function cachedAccess<T>(key: string, compute: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = entries.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value as Promise<T>;
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  const value = compute();
  entries.set(key, { at: now, value });
  // A failure is not remembered.
  value.catch(() => entries.delete(key));
  return value;
}

export function clearAccessCache() {
  entries.clear();
}
