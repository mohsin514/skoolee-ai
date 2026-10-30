import type { AttendanceStatus } from "@prisma/client";

/**
 * The one attendance formula for the whole product.
 *
 * Approved leave is *not* held against a child: the office's per-student
 * monthly report (/api/attendance/monthly) has always counted it as attended,
 * so the student dashboard, the student attendance page, and the parent portal
 * must agree with it. They previously each did their own arithmetic — the
 * server action used present/total while the student's own monthly calendar
 * used (present+leave)/total, so the same child saw two different percentages
 * on two screens.
 */
export type AttendanceLike = { status: AttendanceStatus | string };

/**
 * SKO-405: which statuses count as attended and which leave the denominator. A school publishes numbered
 * versions; until it does, version 0 applies, which is exactly the long-standing formula (approved leave
 * counts as attended) extended to the new statuses: late and part-day pupils attended, an excused absence
 * is treated like leave. Everything else in the denominator (an absence) counts against attendance.
 */
export type AttendanceRule = { version: number; attended: string[]; excluded: string[] };
export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "PARTIAL", "ABSENT", "EXCUSED", "LEAVE"] as const;
export const DEFAULT_ATTENDANCE_RULE: AttendanceRule = { version: 0, attended: ["PRESENT", "LATE", "PARTIAL", "LEAVE", "EXCUSED"], excluded: [] };

export type AttendanceSummary = {
  total: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  excused: number;
  partial: number;
  /** Days that count toward the percentage under the rule (total minus excluded). */
  counted: number;
  /** Counted days that count as attended under the rule. */
  attended: number;
  /** Percentage 0-100, or null when nothing has been marked yet. */
  rate: number | null;
  ruleVersion: number;
};

export function summarizeAttendance(records: AttendanceLike[], rule: AttendanceRule = DEFAULT_ATTENDANCE_RULE): AttendanceSummary {
  const count = (status: string) => records.filter((r) => r.status === status).length;
  const counted = records.filter((r) => !rule.excluded.includes(String(r.status)));
  const attended = counted.filter((r) => rule.attended.includes(String(r.status))).length;
  return {
    total: records.length,
    present: count("PRESENT"),
    absent: count("ABSENT"),
    leave: count("LEAVE"),
    late: count("LATE"),
    excused: count("EXCUSED"),
    partial: count("PARTIAL"),
    counted: counted.length,
    attended,
    rate: counted.length > 0 ? Math.round((attended / counted.length) * 100) : null,
    ruleVersion: rule.version,
  };
}

/** Percentage (one decimal) of counted days attended under the rule; 0 when nothing is counted. */
export function ruleRate(records: AttendanceLike[], rule: AttendanceRule = DEFAULT_ATTENDANCE_RULE): number {
  const counted = records.filter((r) => !rule.excluded.includes(String(r.status)));
  const attended = counted.filter((r) => rule.attended.includes(String(r.status))).length;
  return counted.length ? Math.round((attended / counted.length) * 1000) / 10 : 0;
}

/** Below this, the family sees an "attendance at risk" warning. */
export const ATTENDANCE_RISK_THRESHOLD = 75;

/**
 * Attendance rows carry no academic year of their own — they are tied to a
 * class, and it is the *class* that belongs to a year. So a promoted student
 * accumulates rows under both their old and new class, and any screen that
 * reads `student.attendance` unfiltered pools every year the child has ever
 * attended into one percentage. A pupil with a perfect record last year and a
 * single absence this year then shows 50% on both portals.
 *
 * Scope by the class's year rather than by the current classId, so a student
 * who moves section mid-year keeps the days they earned in the old section.
 */
export type YearScopedAttendance = {
  status: AttendanceStatus | string;
  class?: { academicYear: number | null } | null;
};

export function attendanceForYear<T extends YearScopedAttendance>(
  records: T[],
  academicYear: number | null | undefined
): T[] {
  if (academicYear === null || academicYear === undefined) return records;
  return records.filter((r) => r.class?.academicYear === academicYear);
}
