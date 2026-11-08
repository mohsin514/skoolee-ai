"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { userMessage } from "@/lib/errors";

type Options = {
  /** False skips the initial load (a suspended school has nothing to load). */
  enabled?: boolean;
  /** Runs after each current load settles, before `loading` turns false. `isCurrent` turns false once a newer load or unmount supersedes it. */
  onSettled?: (ok: boolean, isCurrent: () => boolean) => void | Promise<void>;
};

/**
 * Private dashboard results belong to one scoped provider mount, never a module cache: the console layouts key
 * each provider on the signed-in scope, so another actor, school, campus, role or access version starts empty.
 * A refresh inside the same mount keeps the records already on screen until the fresh payload lands
 * (stale-while-revalidate, so the page never flashes back to its skeleton); a refresh that fails clears them
 * (fail closed: a revoked grant never leaves earlier records visible) and the page reports it inline with Retry,
 * never as a toast.
 */
export function usePrivateDashboardData<T>(load: () => Promise<T>, { enabled = true, onSettled }: Options = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const settled = useRef(onSettled);
  useEffect(() => { settled.current = onSettled; });

  const refetch = useCallback(async () => {
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current;
    setLoading(true);
    setError(null);
    let ok = false;
    try {
      const fresh = await load();
      if (!isCurrent()) return;
      setData(fresh);
      ok = true;
    } catch (cause) {
      if (!isCurrent()) return;
      setData(null);
      setError(userMessage(cause, "Could not load your dashboard."));
    }
    try {
      await settled.current?.(ok, isCurrent);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    if (enabled) void refetch();
    // Server actions cannot be aborted, but their late results must not update a new mount.
    return () => { requestVersion.current += 1; };
  }, [enabled, refetch]);

  return { data, loading, error, refetch };
}
