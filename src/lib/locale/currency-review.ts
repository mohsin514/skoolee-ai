/**
 * SKAI-2254: campuses whose currency change an accountant may review. Their own campus, plus every campus that
 * has no active accountant of its own (a shared finance desk); otherwise such a change waits for a reviewer
 * who can never exist. School-wide rows (campusId null) are matched separately by the callers.
 */
export function reviewableCampusIds(ownCampusId: string, campusIds: readonly string[], staffedCampusIds: readonly (string | null)[]): string[] {
  const staffed = new Set(staffedCampusIds);
  return [ownCampusId, ...campusIds.filter((id) => id !== ownCampusId && !staffed.has(id))];
}
