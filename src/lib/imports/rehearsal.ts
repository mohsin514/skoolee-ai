import type { ImportRow } from "@/lib/imports/batch";

/**
 * SKAI-913 migration rehearsal helpers. Pure functions shared by staging (server) and the review dialog
 * (browser): spreadsheet date normalisation, name-only duplicate advisories, the grouped rehearsal counts
 * and the PII-free reconciliation sheet. Nothing here reads or writes the database.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (value: number) => String(value).padStart(2, "0");
const asciiDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, (digit) => String((digit.charCodeAt(0) & 0xf) % 10));

function iso(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${year}-${pad(month)}-${pad(day)}` : null;
}

export type DateOutcome = { value: string | null; error?: string };

/**
 * Normalises the date formats registrars' spreadsheets mix: ISO with -, / or . separators, "15 Mar 2010",
 * "Mar 15, 2010" and day/month/year when the day is over 12. A slash date that could be either order is
 * rejected with both readings instead of being guessed. Eastern Arabic and Urdu digits are accepted.
 */
export function normalizeRosterDate(raw: string | null | undefined): DateOutcome {
  const value = asciiDigits(String(raw ?? "").trim());
  if (!value) return { value: null };
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (match) return dated(iso(+match[1], +match[2], +match[3]), value);
  match = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*\.?[\s-](\d{4})$/.exec(value);
  if (match) return dated(iso(+match[3], MONTHS.indexOf(match[2].toLowerCase()) + 1, +match[1]), value);
  match = /^([A-Za-z]{3})[A-Za-z]*\.?\s(\d{1,2}),?\s(\d{4})$/.exec(value);
  if (match) return dated(iso(+match[3], MONTHS.indexOf(match[1].toLowerCase()) + 1, +match[2]), value);
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match) {
    const [first, second, year] = [+match[1], +match[2], +match[3]];
    if (first > 12) return dated(iso(year, second, first), value);
    if (second > 12) return dated(iso(year, first, second), value);
    if (first === second) return dated(iso(year, first, second), value);
    return { value: null, error: `dateOfBirth: "${value}" could be day/month or month/day; write it as YYYY-MM-DD` };
  }
  return { value: null, error: `dateOfBirth: "${value}" is not a recognised date; write it as YYYY-MM-DD` };
}

function dated(result: string | null, value: string): DateOutcome {
  return result ? { value: result } : { value: null, error: `dateOfBirth: "${value}" is not a real calendar date` };
}

/** Comparable form of a name in any script: NFKC, Arabic diacritics and tatweel removed, case and spaces folded. */
export function nameKey(name: string) {
  return name.normalize("NFKC").replace(/[ً-ٰٟـ]/g, "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/**
 * Adds non-blocking notes where a name repeats (in the file or at the campus) under a different roll number.
 * Names alone never merge or skip a pupil; the registrar confirms they are different people.
 */
export function addNameAdvisories(rows: ImportRow[], existing: Array<{ fullName: string; rollNo: string }>) {
  const byName = new Map<string, string[]>();
  for (const student of existing) byName.set(nameKey(student.fullName), [...(byName.get(nameKey(student.fullName)) || []), student.rollNo]);
  const inFile = new Map<string, number[]>();
  for (const row of rows) {
    const name = typeof row.proposal?.fullName === "string" ? nameKey(row.proposal.fullName) : "";
    if (name) inFile.set(name, [...(inFile.get(name) || []), row.rowNumber]);
  }
  for (const row of rows) {
    if (!row.proposal || typeof row.proposal.fullName !== "string") continue;
    const name = nameKey(row.proposal.fullName), roll = String(row.proposal.rollNo ?? "").trim().toLocaleLowerCase();
    const notes: string[] = [];
    const campusRolls = (byName.get(name) || []).filter((other) => other.trim().toLocaleLowerCase() !== roll);
    if (campusRolls.length) notes.push(`A pupil with the same name already exists (roll ${campusRolls.join(", ")}). Names alone never merge records; confirm this is a different pupil.`);
    const otherRows = (inFile.get(name) || []).filter((other) => other !== row.rowNumber);
    if (otherRows.length) notes.push(`The same name also appears in row ${otherRows.join(", ")}. Confirm these are different pupils.`);
    if (notes.length) row.notes = notes;
  }
  return rows;
}

export type RehearsalGroups = { total: number; additions: number; existingUnchanged: number; excluded: number; errors: number; unresolved: number };

/**
 * The rehearsal's named outcome groups. Existing pupils are never updated by an import, so the "updates"
 * group is always existing records left unchanged. The groups always add up to `total`.
 */
export function rehearsalGroups(rows: ImportRow[]): RehearsalGroups {
  const groups = { total: rows.length, additions: 0, existingUnchanged: 0, excluded: 0, errors: 0, unresolved: 0 };
  for (const row of rows) {
    if (row.state === "REJECTED") groups.errors++;
    else if (row.state === "UNRESOLVED") groups.unresolved++;
    else if (row.state === "SKIPPED" && row.matchLabel?.startsWith("Existing pupil")) groups.existingUnchanged++;
    else if (row.state === "SKIPPED" || !row.selected) groups.excluded++;
    else groups.additions++;
  }
  return groups;
}

export function rowOutcome(row: ImportRow) {
  if (row.state === "REJECTED") return "error";
  if (row.state === "UNRESOLVED") return "unresolved";
  if (row.state === "SKIPPED" && row.matchLabel?.startsWith("Existing pupil")) return "existing-unchanged";
  if (row.state === "SKIPPED" || !row.selected) return "excluded";
  return "addition";
}

/** Columns the reconciliation sheet may carry. Phones, emails, addresses and medical notes are never exported. */
const SHEET_SOURCE_COLUMNS = ["fullname", "rollno", "classname", "classsection"];

/** One line per input row with its outcome and reasons, free of contact, address and medical data. */
export function reconciliationSheet(rows: ImportRow[]): Array<Array<string | number>> {
  return [
    ["row", "outcome", "full_name", "roll_no", "class", "section", "match_key", "reasons", "notes"],
    ...rows.map((row) => {
      const source = Object.fromEntries(Object.entries(row.source).filter(([key]) => SHEET_SOURCE_COLUMNS.includes(key.toLowerCase())));
      const pick = (key: string) => source[Object.keys(source).find((name) => name.toLowerCase() === key) || ""] || "";
      return [row.rowNumber, rowOutcome(row), String(row.proposal?.fullName ?? pick("fullname")), String(row.proposal?.rollNo ?? pick("rollno")), pick("classname"), pick("classsection"), row.matchKey || "", row.errors.join("; "), (row.notes || []).join("; ")];
    }),
  ];
}
