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
