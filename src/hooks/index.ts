"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiResponse } from "@/types";
import { ONLINE_RESTORED_EVENT } from "@/lib/network/connection";

interface UseFetchOptions {
  immediate?: boolean;
}

/**
 * Generic fetch hook with loading/error state management.
 */
export function useFetch<T>(url: string, options?: UseFetchOptions) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(url, {
        signal: abortRef.current.signal,
      });
      const json: ApiResponse<T> = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      setData(json.data ?? null);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (options?.immediate !== false) {
      fetchData();
    }
    return () => abortRef.current?.abort();
  }, [fetchData, options?.immediate]);

  // Anything that failed while the connection was down gets one free
  // retry the moment it returns, so the screen heals itself instead of
  // stranding the user on a stale error.
  useEffect(() => {
    const onRestored = () => fetchData();
    window.addEventListener(ONLINE_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(ONLINE_RESTORED_EVENT, onRestored);
  }, [fetchData]);

  return { data, error, isLoading, refetch: fetchData };
}

/**
 * Run a callback whenever connectivity is restored.
 *
 * For components that load data outside `useFetch` and want to refresh
 * themselves after an outage.
 */
export function useOnlineRestored(callback: () => void) {
  // Held in a ref so the listener is attached once, yet always calls the
  // latest callback — an inline arrow at the call site would otherwise
  // re-subscribe on every render.
  const savedRef = useRef(callback);

  useEffect(() => {
    savedRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const handler = () => savedRef.current();
    window.addEventListener(ONLINE_RESTORED_EVENT, handler);
    return () => window.removeEventListener(ONLINE_RESTORED_EVENT, handler);
  }, []);
}

/**
 * Debounce hook — returns a stable debounced callback.
 */
export function useDebounce<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callback(...args), delay);
    },
    [callback, delay]
  ) as T;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debouncedFn;
}
