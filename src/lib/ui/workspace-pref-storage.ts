// SKAI-1780: workspace preferences (view, density, sort, page size, focus) belong to one signed-in user.
// They used to live under account-agnostic keys, so on a shared browser the next operator inherited the
// previous one's layout. Every key is now `<base>:<userId>`, and sign-out removes all of them (and any
// legacy unkeyed copy). Only keys under this prefix are touched: offline buckets and drafts keep theirs.
export const WORKSPACE_PREF_PREFIX = "skoolee.workspace.";

/** The per-user key, or null while the user is unknown (nothing is read or persisted then). */
export function workspacePrefKey(name: string, userId: string | null | undefined): string | null {
  return userId ? `${WORKSPACE_PREF_PREFIX}${name}:${userId}` : null;
}

/** Removes every workspace preference on this device. Called from the sign-out paths. */
export function clearWorkspacePrefs(storage?: Storage): void {
  try {
    const store = storage ?? window.localStorage;
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(WORKSPACE_PREF_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    /* blocked storage holds nothing to clear */
  }
}
