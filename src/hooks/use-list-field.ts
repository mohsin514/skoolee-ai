"use client";

import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { boundedInteger, patchListQuery } from "@/lib/lists/query";

const eventName = "skoolee:list-query";
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(eventName, listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(eventName, listener); };
}
const snapshot = () => window.location.search;
const serverSnapshot = () => "";

/** Namespaced URL state without remounting forms or replacing unrelated dashboard scope. */
export function useListField<T extends string | number | boolean>(key: string, fallback: T, pageKey: string): [T, Dispatch<SetStateAction<T>>] {
  const search = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const parse = useCallback((query: string): T => {
    const raw = new URLSearchParams(query).get(key);
    if (raw === null) return fallback;
    return (typeof fallback === "number" ? boundedInteger(raw, Number(fallback), 100_000) : typeof fallback === "boolean" ? raw === "1" : raw) as T;
  }, [key, fallback]);
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    const current = window.location.search;
    const value = typeof next === "function" ? next(parse(current)) : next;
    const encoded = value === fallback ? null : typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    const query = patchListQuery(current, { [key]: encoded }, pageKey);
    if (query.toString() === new URLSearchParams(current).toString()) return;
    window.history.pushState(window.history.state, "", `${window.location.pathname}${query.size ? `?${query}` : ""}${window.location.hash}`);
    window.dispatchEvent(new Event(eventName));
  }, [key, fallback, pageKey, parse]);
  return [parse(search), set];
}
