/**
 * The teacher roster's search and sort, kept free of React so they run once per (deferred) search and are
 * testable. The cards grid shows the first `ROSTER_PAGE` pupils and offers the rest on request; the list view,
 * the counts and the CSV export still use the whole filtered roster.
 */
export const ROSTER_PAGE = 50;

// Roll number is stored as text, so a plain string sort orders 10 before 2. One collator for the module,
// not one per keystroke.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type RosterPupil = {
  fullName?: string | null;
  rollNo?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  reportCards?: { percentage?: number | null }[] | null;
};

export function matchesRosterSearch(pupil: RosterPupil, search: string) {
  const q = search.toLowerCase();
  return Boolean(
    pupil.fullName?.toLowerCase().includes(q) ||
      pupil.rollNo?.toLowerCase().includes(q) ||
      pupil.guardianName?.toLowerCase().includes(q) ||
      pupil.guardianPhone?.includes(q)
  );
}

export function sortRoster<T extends RosterPupil>(
  list: readonly T[],
  sortKey: string,
  sortDir: string,
  classOf: (pupil: T) => string
): T[] {
  const dir = sortDir === "desc" ? -1 : 1;
  const pct = (st: T) => st.reportCards?.[0]?.percentage ?? -1;
  return [...list].sort((a, b) => {
    if (sortKey === "name") return dir * collator.compare(a.fullName || "", b.fullName || "");
    if (sortKey === "grade") return dir * (pct(a) - pct(b));
    if (sortKey === "class") return dir * collator.compare(classOf(a) || "", classOf(b) || "");
    return dir * collator.compare(String(a.rollNo || ""), String(b.rollNo || ""));
  });
}
