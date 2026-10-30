/** Shared list bounds. Values from URLs and persisted preferences are untrusted. */
export function boundedInteger(value: string | null, fallback: number, max: number): number {
  if (!value?.trim() || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

export function listPagination(params: URLSearchParams, defaultLimit = 25, maxLimit = 100, sizeKey = "limit") {
  const limit = boundedInteger(params.get(sizeKey), defaultLimit, maxLimit);
  const page = boundedInteger(params.get("page"), 1, Math.min(100_000, Math.floor(2_147_483_647 / limit)));
  return { page, limit };
}

/** Keep unrelated scope/draft parameters; changing query, filters or order invalidates the page. */
export function patchListQuery(current: string, patch: Record<string, string | null>, pageKey = "page") {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  if (Object.keys(patch).some(key => key !== pageKey && currentValue(current, key) !== next.get(key))) next.delete(pageKey);
  return next;
}
function currentValue(current: string, key: string) { return new URLSearchParams(current).get(key); }

export function pageWindow(total: number, requestedPage: number, requestedSize: number) {
  const size = boundedInteger(String(requestedSize), 25, 200);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(boundedInteger(String(requestedPage), 1, 100_000), pages);
  return { page, size, pages, skip: (page - 1) * size, first: total ? (page - 1) * size + 1 : 0, last: Math.min(page * size, total) };
}
