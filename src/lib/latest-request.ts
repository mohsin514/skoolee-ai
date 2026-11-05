/**
 * Tracks the newest request for a piece of client state so a slow, older
 * response cannot overwrite the result of a newer selection.
 */
export type LatestRequestToken<K> = { readonly id: number; readonly key: K };

export function createLatestRequest<K>() {
  let current: LatestRequestToken<K> | null = null;
  let seq = 0;
  return {
    /** Start a request for `key`; any earlier token becomes stale. */
    begin(key: K): LatestRequestToken<K> { current = { id: ++seq, key }; return current; },
    /** Invalidate every in-flight request (e.g. when the panel closes). */
    cancel(): void { current = null; ++seq; },
    /** True only for the newest token whose key still matches the active selection. */
    isCurrent(token: LatestRequestToken<K>, activeKey: K): boolean {
      return current !== null && token.id === current.id && token.key === activeKey;
    },
  };
}
