import { checkedListJson, readRequest } from "@/lib/http/request-state";

const PAGE_SIZE = "100";
/** Pages read at once after the first; keeps the load bounded on big lists. */
export const LIST_PAGE_CONCURRENCY = 4;

const listChanged = () => new Error("The list changed while loading. Refresh and try again.");

/**
 * Collect every page, or fail visibly; never present a truncated export as complete.
 * Page 1 says how many pages exist; the rest are read a few at a time. The APIs page
 * with an offset, so a write during the load can shift rows between pages: every page
 * must report the same page count and total, and a repeated row id fails the load.
 */
export async function loadListPages<T>(path: string, params = new URLSearchParams(), request: typeof fetch = fetch): Promise<T[]> {
  const readPage = async (page: number) => {
    const query = new URLSearchParams(params);
    query.set("limit", PAGE_SIZE);
    query.set("page", String(page));
    const json = await checkedListJson(await readRequest(`${path}?${query}`, undefined, request));
    const pages = json.pagination?.pages;
    if (!Number.isSafeInteger(pages) || pages < 0) throw listChanged();
    return { data: json.data as T[], pages: pages as number, total: json.pagination?.total };
  };

  const first = await readPage(1);
  if (first.pages > 1 && first.data.length === 0) throw listChanged();
  const results: T[][] = [first.data];
  const remaining = Array.from({ length: Math.max(0, first.pages - 1) }, (_, index) => index + 2);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < remaining.length) {
      const page = remaining[next++];
      try {
        const result = await readPage(page);
        if (result.pages !== first.pages || result.total !== first.total || result.data.length === 0) throw listChanged();
        results[page - 1] = result.data;
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LIST_PAGE_CONCURRENCY, remaining.length) }, worker));

  const rows = results.flat();
  const seen = new Set<unknown>();
  for (const row of rows) {
    const id = (row as { id?: unknown } | null)?.id;
    if (id === undefined || id === null) continue;
    if (seen.has(id)) throw listChanged();
    seen.add(id);
  }
  return rows;
}
