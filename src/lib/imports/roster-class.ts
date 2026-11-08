interface RosterClass { id: string; name: string; section: string | null }
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
/** Explicit names never fall back to a different class. Ambiguous names require row review. */
export function resolveRosterClass(classes: RosterClass[], name: string, section: string, fallback: string): string {
  if (!name.trim() && !section.trim()) return fallback;
  if (!name.trim()) return "";
  const matches = classes.filter(row => normalize(row.name) === normalize(name) && (!section.trim() || normalize(row.section ?? "") === normalize(section)));
  return matches.length === 1 ? matches[0].id : "";
}
