/**
 * Refuses a rank-ladder promotion path that would loop back on itself.
 *
 * A designation's `promotesToId` points at the next rank up. If A promotes to
 * B and B promotes back to A, the ladder has no top and the progression
 * views never finish walking it. The check follows the chain from the
 * proposed target and reports a loop if it reaches the rank being edited.
 * Chains longer than `maxDepth` are refused rather than trusted, so a
 * corrupt existing chain cannot be extended.
 */
export const MAX_PROMOTION_DEPTH = 50;

export function wouldCreatePromotionCycle(
  selfId: string,
  targetId: string | null | undefined,
  promotesToById: ReadonlyMap<string, string | null>,
  maxDepth = MAX_PROMOTION_DEPTH
): boolean {
  if (!targetId) return false;
  if (targetId === selfId) return true;

  let cursor: string | null = targetId;
  for (let depth = 0; depth < maxDepth && cursor; depth += 1) {
    cursor = promotesToById.get(cursor) ?? null;
    if (cursor === selfId) return true;
  }
  // Still climbing after maxDepth steps: refuse rather than assume it is safe.
  return cursor !== null;
}
