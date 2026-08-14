import { prisma } from "@/lib/db/prisma";

/**
 * Academic year of the campus's ACTIVE cycle.
 *
 * Never substitute `new Date().getFullYear()` for this. A cycle labelled 2027
 * routinely starts in August 2026, so the calendar year and the academic year
 * disagree for roughly half of every session. Records stamped with the calendar
 * year get filed under a year the office is no longer looking at, which is how
 * a teacher's assessment or leave balance silently disappears from admin views.
 *
 * Falls back to the calendar year only when no cycle is active — callers that
 * require a real cycle should gate on it separately.
 */
export async function getActiveAcademicYear(campusId: string | null | undefined) {
  if (!campusId) return new Date().getFullYear();
  const active = await prisma.academicCycle.findFirst({
    where: { campusId, status: "ACTIVE" },
    select: { academicYear: true },
  });
  return active?.academicYear ?? new Date().getFullYear();
}
