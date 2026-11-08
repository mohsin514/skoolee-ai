import { prisma, type TxClient } from "@/lib/db/prisma";
import { DEFAULT_ATTENDANCE_RULE, type AttendanceRule } from "@/lib/attendance";

// SKO-405: the published counting rule and the family explanation window, kept apart from the register
// service so readers (report cards, dashboards, summaries) do not load notifications or Redis.

/** The published rule in force for a school (version 0 until one is published). */
export async function attendanceRuleFor(schoolId: string, db: Pick<TxClient, "attendanceRuleVersion"> = prisma): Promise<AttendanceRule> {
  const latest = await db.attendanceRuleVersion.findFirst({ where: { schoolId }, orderBy: { version: "desc" } });
  return latest ? { version: latest.version, attended: latest.attended, excluded: latest.excluded } : DEFAULT_ATTENDANCE_RULE;
}

/** SKO-419: how long after the day a family may explain it; the family inbox uses the same window. */
export const EXPLAIN_WINDOW_DAYS = 14;
export const explainClosed = (date: Date, now = new Date()) => now.getTime() > date.getTime() + (EXPLAIN_WINDOW_DAYS + 1) * 86_400_000;
