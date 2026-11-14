// Scale: the workspace menu (module visibility + capability keys) costs ~20 existence queries and every page load
// asks for it. It is presentation only — each API and page still enforces its own gate — so a per-instance cache
// for a short time, keyed by everything that changes the answer (user, school, campus, role, access version),
// is safe: a role or access change bumps accessVersion and misses at once; data-driven menu items appear within
// the TTL.
// SKAI-1973: with Redis on, a shared layer behind the per-instance one lets a new serverless instance reuse the menu;
// each layer then keeps 30 s, so a menu is never more than 60 s old, as before. The value must be plain JSON.
import { createTtlMemo } from "@/lib/cache/ttl-memo";
import { createSharedMemo, sharedMemoEnabled } from "@/lib/cache/shared-memo";

const memo = createTtlMemo({ ttlMs: sharedMemoEnabled() ? 30_000 : 60_000 });
const shared = createSharedMemo({ name: "nav-access", ttlSeconds: 30 });

export function cachedAccess<T>(key: string, compute: () => Promise<T>, now = Date.now()): Promise<T> {
  return memo.get(key, () => shared.get(key, compute), now);
}

export function clearAccessCache() {
  memo.clear();
}
