/** Bound database pagination even when a manually edited URL contains invalid input. */
export function boundedInteger(value: string | null, fallback: number, max: number): number {
  if (!value?.trim() || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

export function ownerPagination(params: URLSearchParams, defaultLimit = 25, maxLimit = 100) {
  const limit = boundedInteger(params.get("limit"), defaultLimit, maxLimit);
  // Prisma's skip is a signed 32-bit integer.
  const page = boundedInteger(params.get("page"), 1, Math.floor(2_147_483_647 / limit));
  return { page, limit };
}
