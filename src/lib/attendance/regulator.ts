// ─────────────────────────────────────────────────────────────────
// SKAI-1153: regulator attendance codes and calendars (SKAI-1104 §3).
//
// A UAE regulator reports attendance in its own codes and counts its own
// school week. Rather than add statuses, each regulator's set is a mapping
// onto the six statuses the register already records, so the counting rule,
// reports and portals are unchanged. NONE (the default) keeps today's
// behaviour: no codes are shown and every day can be marked.
//
// KHDA is the first set; ADEK, SPEA and MOE are configurable sets. No set is
// yet checked against the regulator's published guidance ("confirmed: false"),
// so the register labels them provisional until someone signs them off.
// ─────────────────────────────────────────────────────────────────

import type { ATTENDANCE_STATUSES } from "@/lib/attendance";

type Status = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_REGULATORS = ["NONE", "KHDA", "ADEK", "SPEA", "MOE"] as const;
export type AttendanceRegulator = (typeof ATTENDANCE_REGULATORS)[number];
export const DEFAULT_ATTENDANCE_REGULATOR: AttendanceRegulator = "NONE";

export type RegulatorCode = { code: string; label: string };
/** Day numbers as Date.getUTCDay(): 0 Sunday … 6 Saturday. */
export type RegulatorCalendar = { weekend: number[]; academicYearStartMonth: number };
export type RegulatorSet = {
  name: string;
  /** False until the codes are checked against the regulator's published guidance. */
  confirmed: boolean;
  codes: Record<Status, RegulatorCode> | null;
  calendar: RegulatorCalendar | null;
};

// The federal weekend since January 2022; Sharjah keeps Friday as a third day off.
const UAE_WEEK: RegulatorCalendar = { weekend: [0, 6], academicYearStartMonth: 8 };
const SHARJAH_WEEK: RegulatorCalendar = { weekend: [0, 5, 6], academicYearStartMonth: 8 };

const authorisedSet = (sickOrLeave: string): Record<Status, RegulatorCode> => ({
  PRESENT: { code: "P", label: "Present" },
  LATE: { code: "L", label: "Late arrival" },
  PARTIAL: { code: "PD", label: "Part-day attendance" },
  ABSENT: { code: "UA", label: "Unauthorised absence" },
  EXCUSED: { code: "AA", label: "Authorised absence" },
  LEAVE: { code: sickOrLeave, label: "Approved leave" },
});

export const REGULATOR_SETS: Record<AttendanceRegulator, RegulatorSet> = {
  NONE: { name: "No regulator (school's own codes)", confirmed: true, codes: null, calendar: null },
  KHDA: { name: "KHDA (Dubai)", confirmed: false, codes: authorisedSet("AL"), calendar: UAE_WEEK },
  ADEK: { name: "ADEK (Abu Dhabi)", confirmed: false, codes: authorisedSet("AL"), calendar: UAE_WEEK },
  SPEA: { name: "SPEA (Sharjah)", confirmed: false, codes: authorisedSet("AL"), calendar: SHARJAH_WEEK },
  MOE: { name: "MOE (northern emirates)", confirmed: false, codes: authorisedSet("AL"), calendar: UAE_WEEK },
};

export function isAttendanceRegulator(value: unknown): value is AttendanceRegulator {
  return typeof value === "string" && (ATTENDANCE_REGULATORS as readonly string[]).includes(value);
}

/** Accepts any letter case and surrounding spaces; throws on anything outside the list. */
export function parseAttendanceRegulator(value: unknown): AttendanceRegulator {
  const normalised = typeof value === "string" ? value.trim().toUpperCase() : value;
  if (!isAttendanceRegulator(normalised)) throw new Error(`attendanceRegulator must be one of: ${ATTENDANCE_REGULATORS.join(", ")}`);
  return normalised;
}

/** The regulator's code for a status, or null when the school reports in its own codes. */
export function regulatorCode(regulator: string | null | undefined, status: string): string | null {
  const set = REGULATOR_SETS[isAttendanceRegulator(regulator) ? regulator : DEFAULT_ATTENDANCE_REGULATOR];
  return set.codes?.[status as Status]?.code ?? null;
}

/** Reverse lookup for imports: a regulator code (any case) back to the register status. */
export function statusForRegulatorCode(regulator: AttendanceRegulator, code: string): Status | null {
  const wanted = code.trim().toUpperCase();
  const match = Object.entries(REGULATOR_SETS[regulator].codes ?? {}).find(([, value]) => value.code === wanted);
  return match ? (match[0] as Status) : null;
}

/** False on the regulator's weekend; always true when no regulator calendar applies. */
export function isRegulatorSchoolDay(regulator: string | null | undefined, date: Date): boolean {
  const calendar = REGULATOR_SETS[isAttendanceRegulator(regulator) ? regulator : DEFAULT_ATTENDANCE_REGULATOR].calendar;
  return !calendar || !calendar.weekend.includes(date.getUTCDay());
}

/** What the register shows: the codes, whether the set is provisional, and whether the day is a school day. */
export function regulatorView(regulator: string | null | undefined, date: Date) {
  const key = isAttendanceRegulator(regulator) ? regulator : DEFAULT_ATTENDANCE_REGULATOR;
  const set = REGULATOR_SETS[key];
  if (!set.codes) return null;
  return {
    regulator: key,
    name: set.name,
    confirmed: set.confirmed,
    codes: Object.fromEntries(Object.entries(set.codes).map(([status, value]) => [status, value.code])) as Record<Status, string>,
    schoolDay: isRegulatorSchoolDay(key, date),
  };
}
