// ─────────────────────────────────────────────────────────────────
// SKAI-1149: the regulator field set on student and staff records.
//
// UAE regulators (KHDA, ADEK, SPEA, MOE) identify a pupil or staff member by
// Emirates ID and nationality, plus the regulator's own record number (ADEK
// eSIS ID, MOE ID). Every field is optional: schools outside the UAE leave
// them blank (SKAI-1104 §3).
// ─────────────────────────────────────────────────────────────────

export type RegulatorField = "emiratesId" | "nationality" | "regulatorId";

/** Luhn check over the 15 digits; the last digit of an Emirates ID is a Luhn check digit. */
function luhnValid(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Blank → null. Otherwise 15 digits starting 784, with optional spaces or dashes, a valid check digit, and
 * returned in the printed 784-YYYY-NNNNNNN-C form so the same card never reads as two values.
 */
export function parseEmiratesId(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!raw) return null;
  if (!/^[\d\s-]+$/.test(raw)) throw new Error("Emirates ID may contain only digits, spaces and dashes.");
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 15 || !digits.startsWith("784")) throw new Error("Emirates ID must be 15 digits starting with 784.");
  if (!luhnValid(digits)) throw new Error("Emirates ID check digit does not match. Check the number on the card.");
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14)}`;
}

/** ADEK eSIS / MOE record number: letters, digits and dashes, up to 30 characters. Blank → null. */
export function parseRegulatorId(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!raw) return null;
  if (!/^[A-Za-z0-9-]{1,30}$/.test(raw)) throw new Error("eSIS / MOE ID may contain only letters, digits and dashes (up to 30).");
  return raw.toUpperCase();
}

/** Free text, up to 60 characters. Blank → null. */
export function parseNationality(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!raw) return null;
  if (raw.length > 60) throw new Error("Nationality must be 60 characters or fewer.");
  return raw;
}

/** Shows only the last four digits, for lists, audit entries and timelines. */
export function maskIdentifier(value: string | null | undefined) {
  if (!value) return null;
  const tail = value.replace(/[^A-Za-z0-9]/g, "").slice(-4);
  return `•••• ${tail}`;
}

type RegulatorValues = Partial<Record<RegulatorField, string | null | undefined>>;

/**
 * The audit view of a regulator-field change: which fields moved, with identifiers masked so the audit log never
 * holds a full Emirates ID or regulator number. `after` holds only the fields being written.
 */
export function regulatorAuditChange(before: RegulatorValues, after: RegulatorValues) {
  const fields = (["emiratesId", "nationality", "regulatorId"] as const).filter(
    (field) => after[field] !== undefined && (before[field] ?? null) !== (after[field] ?? null),
  );
  const view = (values: RegulatorValues) => Object.fromEntries(fields.map((field) => [field, field === "nationality" ? values[field] ?? null : maskIdentifier(values[field])]));
  return { fields, from: view(before), to: view(after) };
}
