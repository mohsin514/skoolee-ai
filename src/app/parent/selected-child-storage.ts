/**
 * SKAI-1932: the child a guardian chose in the family portal survives a reload, a new tab and a typed URL. Only the
 * child's opaque id is kept (never a record), in localStorage so a new tab follows the same choice, and only for the
 * exact identity the server rendered the page for (user · school · role · access version); any other identity drops
 * it. Presentation only: /api/parent/data still checks the child belongs to this guardian on every request.
 */
export const SELECTED_CHILD_STORAGE_KEY = "skoolee.parent-child.v1";

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSelectedChild(identity: string | null, store: KeyValueStore | null = defaultStore()): string | null {
  if (!identity || !store) return null;
  try {
    const raw = store.getItem(SELECTED_CHILD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; studentId?: unknown };
    if (parsed.key !== identity) {
      store.removeItem(SELECTED_CHILD_STORAGE_KEY);
      return null;
    }
    return typeof parsed.studentId === "string" && parsed.studentId ? parsed.studentId : null;
  } catch {
    return null;
  }
}

/** Stores the choice for this identity, or forgets it (`studentId` null, or no identity). */
export function storeSelectedChild(identity: string | null, studentId: string | null, store: KeyValueStore | null = defaultStore()) {
  if (!store) return;
  try {
    if (identity && studentId) store.setItem(SELECTED_CHILD_STORAGE_KEY, JSON.stringify({ key: identity, studentId }));
    else store.removeItem(SELECTED_CHILD_STORAGE_KEY);
  } catch { /* blocked storage: the choice still holds for this page's client navigations */ }
}

/**
 * SKAI-1933: whether a refused child load should fall back to the guardian's default child instead of ending at an
 * error with only "Try again" (which would repeat the same refused id). It applies to a child this page asked for on
 * its own — one restored from storage, or one named in a stale or foreign `?student=` link — never to a child the
 * guardian just picked. The fallback load sends no student id, so the server still chooses and authorizes the child.
 */
export function shouldFallBackToDefaultChild({ selected, restored, requested, status }: {
  selected: string | null;
  restored: string | null;
  requested: string | null;
  status: number;
}): boolean {
  if (!selected || ![401, 403, 404].includes(status)) return false;
  return selected === restored || selected === requested;
}

/**
 * SKAI-1934: the child a family panel should load for. While the provider is still choosing (no child yet and its
 * first load in flight) it is `undefined`, so a panel waits instead of loading once unscoped and again for the child
 * the payload names. Once settled it is the child's id, or null when there is no child to scope to (no linked child,
 * a failed load); the server still picks and authorizes the child for an unscoped request.
 */
export function settledChildScope(activeId: string | null, loading: boolean): string | null | undefined {
  if (activeId) return activeId;
  return loading ? undefined : null;
}
