"use client";
import { useListField } from "./use-list-field";
import { pageWindow } from "@/lib/lists/query";

/** Page an already-authorized directory; exports keep the complete filtered collection. */
export function useListPage<T>(rows: T[], namespace: string) {
  const [requestedPage, onPage] = useListField<number>(`${namespace}.page`, 1, `${namespace}.page`);
  const [requestedSize, onPerPage] = useListField<number>(`${namespace}.size`, 24, `${namespace}.page`);
  const window = pageWindow(rows.length, requestedPage, requestedSize);
  return {
    rows: rows.slice(window.skip, window.skip + window.size),
    controls: { page: window.page, perPage: window.size, totalPages: window.pages, total: rows.length,
      firstShown: window.first, lastShown: window.last, onPage, onPerPage },
  };
}
