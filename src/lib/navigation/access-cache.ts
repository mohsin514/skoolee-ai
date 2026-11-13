// Scale: the workspace menu (module visibility + capability keys) costs ~20 existence queries and every page load
// asks for it. It is presentation only — each API and page still enforces its own gate — so a per-instance cache
// for a short time, keyed by everything that changes the answer (user, school, campus, role, access version),
// is safe: a role or access change bumps accessVersion and misses at once; data-driven menu items appear within
// the TTL.
import { createTtlMemo } from "@/lib/cache/ttl-memo";

const memo = createTtlMemo({ ttlMs: 60_000 });

export function cachedAccess<T>(key: string, compute: () => Promise<T>, now = Date.now()): Promise<T> {
  return memo.get(key, compute, now);
}

export function clearAccessCache() {
  memo.clear();
}
