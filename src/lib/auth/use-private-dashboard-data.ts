"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { userMessage } from "@/lib/errors";

/** Private dashboard results belong to one scoped provider mount, never a module cache. */
export function usePrivateDashboardData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refetch = useCallback(async () => {
    const version = ++requestVersion.current;
    // Rechecking current permission must not leave previously permitted records visible.
    setData(null);
    setLoading(true);
    setError(null);
    try {
      const fresh = await load();
      if (version === requestVersion.current) setData(fresh);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      const message = userMessage(cause, "Could not load your dashboard.");
      setError(message);
      toast.error(message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refetch();
    // Server actions cannot be aborted, but their late results must not update a new scope.
    return () => { requestVersion.current += 1; };
  }, [refetch]);

  return { data, loading, error, refetch };
}
