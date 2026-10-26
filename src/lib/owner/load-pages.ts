/** Collect every page, or fail visibly; never present a truncated export as complete. */
export async function loadOwnerPages<T>(path: string, params = new URLSearchParams(), request: typeof fetch = fetch): Promise<T[]> {
  const rows: T[] = [];
  const query = new URLSearchParams(params);
  query.set("limit", "100");
  for (let page = 1; ; page += 1) {
    query.set("page", String(page));
    const response = await request(`${path}?${query}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok || !json.success || !Array.isArray(json.data)) {
      throw new Error(typeof json.error === "string" ? json.error : "The list could not be loaded. Try again.");
    }
    const pages = json.pagination?.pages;
    if (!Number.isSafeInteger(pages) || pages < 0 || (page < pages && json.data.length === 0)) {
      throw new Error("The list changed while loading. Refresh and try again.");
    }
    rows.push(...json.data);
    if (page >= pages) return rows;
  }
}
