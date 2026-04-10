"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiResponse } from "@/types";

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

  return { data, error, isLoading, refetch: fetchData };
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
