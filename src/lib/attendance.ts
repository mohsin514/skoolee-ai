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

export type AttendanceSummary = {
  total: number;
  present: number;
  absent: number;
  leave: number;
  /** Percentage 0-100, or null when nothing has been marked yet. */
  rate: number | null;
};

export function summarizeAttendance(records: AttendanceLike[]): AttendanceSummary {
  const total = records.length;
  const present = records.filter((r) => r.status === "PRESENT").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const leave = records.filter((r) => r.status === "LEAVE").length;

  return {
    total,
    present,
    absent,
    leave,
    rate: total > 0 ? Math.round(((present + leave) / total) * 100) : null,
  };
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
