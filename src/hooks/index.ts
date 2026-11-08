"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { checkedJson, readRequest, requestFailure, RequestFailure } from "@/lib/http/request-state";
import { ONLINE_RESTORED_EVENT } from "@/lib/network/connection";

interface UseFetchOptions {
  immediate?: boolean;
  collection?: boolean;
}

/**
 * Generic fetch hook with loading/error state management.
 */
export function useFetch<T>(url: string, options?: UseFetchOptions) {
  const [result, setResult] = useState<{ url: string; data: T | null; failure: RequestFailure | null; loading: boolean }>({ url, data: null, failure: null, loading: options?.immediate !== false });
  const abortRef = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const collection = options?.collection === true;
  const fetchData = useCallback(async () => {
    const request = ++sequence.current;
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    setResult({ url, data: null, failure: null, loading: true });
    try {
      const json = await checkedJson(await readRequest(url, controller.signal));
      if (collection && !Array.isArray(json.data)) throw new RequestFailure("server");
      if (request === sequence.current) setResult({ url, data: json.data ?? null, failure: null, loading: false });
    } catch (error) {
      if (request === sequence.current && !controller.signal.aborted) setResult({ url, data: null, failure: requestFailure(error), loading: false });
    }
  }, [url, collection]);
  useEffect(() => {
    if (options?.immediate !== false) void fetchData();
    return () => { sequence.current++; abortRef.current?.abort(); };
  }, [fetchData, options?.immediate]);
  useEffect(() => {
    if (options?.immediate === false) return;
    const onRestored = () => void fetchData();
    window.addEventListener(ONLINE_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(ONLINE_RESTORED_EVENT, onRestored);
  }, [fetchData, options?.immediate]);
  const current = result.url === url ? result : { data: null, failure: null, loading: options?.immediate !== false };
  return { data: current.data, error: current.failure?.message ?? null, failure: current.failure, isLoading: current.loading, refetch: fetchData };
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
