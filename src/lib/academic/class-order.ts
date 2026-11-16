/**
 * School order for class lists (SKAI-2081): newest year first, pre-primary levels before graded classes,
 * then names compared numeric-aware so "Grade 8" < "Grade 9" < "Grade 10".
 * shortcut: pre-primary is detected by name; switch to a configured grade order if schools need custom levels.
 */
const PRE_PRIMARY = [/pre[\s-]?nursery|playgroup|play group/i, /nursery/i, /\b(kg|kindergarten|prep|reception)\b/i];

function levelRank(name: string) {
  const rank = PRE_PRIMARY.findIndex((pattern) => pattern.test(name));
  return rank === -1 ? PRE_PRIMARY.length : rank;
}

const compareText = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").localeCompare(b ?? "", undefined, { numeric: true, sensitivity: "base" });

export function compareClassesForList(
  a: { academicYear: number; name: string; section?: string | null; id: string },
  b: { academicYear: number; name: string; section?: string | null; id: string },
) {
  return b.academicYear - a.academicYear
    || levelRank(a.name) - levelRank(b.name)
    || compareText(a.name, b.name)
    || compareText(a.section, b.section)
    || a.id.localeCompare(b.id);
}
