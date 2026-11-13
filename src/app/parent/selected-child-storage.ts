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
