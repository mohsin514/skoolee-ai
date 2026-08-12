"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseCachedFetchOptions<T> {
  key: string;
  fetcher: () => Promise<T>;
  ttlMs?: number;
}

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function useCachedFetch<T>({ key, fetcher, ttlMs = 60_000 }: UseCachedFetchOptions<T>) {
  const [data, setData] = useState<T | null>(() => {
    const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
    return cached ? cached.data : null;
  });
  const [loading, setLoading] = useState(data === null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    const hadStale = data !== null;
    if (!hadStale) setLoading(true);
    try {
      const fresh = await fetcherRef.current();
      memoryCache.set(key, { data: fresh, ts: Date.now() });
      setData(fresh);
      return fresh;
    } finally {
      setLoading(false);
    }
  }, [key, data]);

  useEffect(() => {
    const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.ts < ttlMs) {
      setData(cached.data);
      setLoading(false);
      return;
    }
    refresh();
  }, [key, ttlMs, refresh]);

  return { data, loading, refresh };
}
