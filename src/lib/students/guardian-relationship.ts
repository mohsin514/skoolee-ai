/**
 * SKAI-1928: a pupil's guardian relationship is stored lowercase ("father"),
 * as the admission form, studentSchema and roster import write it. Older edits
 * saved uppercase keys ("FATHER"), so readers match the value in any case.
 * Labels are English UI keys, translated where shown.
 */
export const GUARDIAN_RELATIONSHIP_LABELS: Readonly<Record<string, string>> = {
  father: "Father",
  mother: "Mother",
  guardian: "Guardian",
  uncle: "Uncle",
  aunt: "Aunt",
  grandparent: "Grandparent",
  sibling: "Sibling",
  other: "Other",
};

/** The option value for a stored relationship: a known one in any case maps to its lowercase key; anything else is kept as stored. */
export function guardianRelationshipValue(stored: string | null | undefined): string {
  const value = (stored ?? "").trim();
  const key = value.toLowerCase();
  return Object.hasOwn(GUARDIAN_RELATIONSHIP_LABELS, key) ? key : value;
}

/** The English label for a stored relationship, or undefined when it is not a known one. */
export function guardianRelationshipLabel(stored: string | null | undefined): string | undefined {
  const key = guardianRelationshipValue(stored);
  return Object.hasOwn(GUARDIAN_RELATIONSHIP_LABELS, key) ? GUARDIAN_RELATIONSHIP_LABELS[key] : undefined;
}
