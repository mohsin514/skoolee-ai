import { checkedListJson, readRequest } from "@/lib/http/request-state";
/** Collect every page, or fail visibly; never present a truncated export as complete. */
export async function loadListPages<T>(path: string, params = new URLSearchParams(), request: typeof fetch = fetch): Promise<T[]> {
  const rows: T[] = [];
  const query = new URLSearchParams(params);
  query.set("limit", "100");
  for (let page = 1; ; page += 1) {
    query.set("page", String(page));
    const response = await readRequest(`${path}?${query}`, undefined, request);
    const json = await checkedListJson(response);
    const pages = json.pagination?.pages;
    if (!Number.isSafeInteger(pages) || pages < 0 || (page < pages && json.data.length === 0)) {
      throw new Error("The list changed while loading. Refresh and try again.");
    }
    rows.push(...json.data);
    if (page >= pages) return rows;
  }
}
