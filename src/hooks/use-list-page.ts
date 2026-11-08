"use client";
import { useListField } from "./use-list-field";
import { pageWindow } from "@/lib/lists/query";

/** Page an already-authorized directory; exports keep the complete filtered collection. */
export function useListPagination(total: number, namespace: string) {
  const [requestedPage, onPage] = useListField<number>(`${namespace}.page`, 1, `${namespace}.page`);
  const [requestedSize, onPerPage] = useListField<number>(`${namespace}.size`, 24, `${namespace}.page`);
  const window = pageWindow(total, requestedPage, Math.min(requestedSize, 96));
  return {
    requestedPage, window,
    controls: { page: window.page, perPage: window.size, totalPages: window.pages, total,
      firstShown: window.first, lastShown: window.last, onPage, onPerPage },
  };
}

export function useListPage<T>(rows: T[], namespace: string) {
  const paging = useListPagination(rows.length, namespace);
  return { ...paging, rows: rows.slice(paging.window.skip, paging.window.skip + paging.window.size) };
}
