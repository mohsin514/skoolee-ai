/**
 * Examination boards a campus can be affiliated with.
 *
 * Shared rather than redeclared per screen: the onboarding wizard and the
 * Campus Control screen both create campuses, and a board typed in one place
 * has to match the other or report cards and datesheets disagree about what
 * the same campus is affiliated with.
 */
export const EXAM_BOARDS = [
  "Federal Board",
  "Punjab Board",
  "Sindh Board",
  "KPK Board",
  "Balochistan Board",
  "Aga Khan Board",
  "Cambridge (IGCSE)",
  "IB / International",
  "Other",
] as const;

export type ExamBoard = (typeof EXAM_BOARDS)[number];

export const DEFAULT_EXAM_BOARD: ExamBoard = "Federal Board";
