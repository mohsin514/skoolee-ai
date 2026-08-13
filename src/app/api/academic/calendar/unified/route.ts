import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { isOfficeRole } from "@/lib/academic/exam-permissions";

/**
 * Families and teachers must not see an exam that the office is still drafting.
 * Only exams that have actually been opened are visible to them.
 */
const ANNOUNCED_EXAM_STATUSES = [
  "ACTIVE",
  "MARKS_ENTRY",
  "LOCKED",
  "PRINCIPAL_REVIEWED",
  "PUBLISHED",
];

// GET /api/academic/calendar/unified?campusId=&year=YYYY
// Single feed for the unified calendar: weekends, term boundaries, holidays,
// and exam periods (with their scheduled dates).

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const year = parseInt(searchParams.get("year") || "", 10) || new Date().getFullYear();

    // The office sees drafts on the calendar; everyone else only sees announced exams.
    const canSeeDrafts = isOfficeRole(user.role);

    const [weekends, terms, holidays, schedules] = await Promise.all([
      prisma.weekend.findMany({ where: { campusId }, select: { dayOfWeek: true } }),
      prisma.academicCycle.findMany({
        where: { campusId, academicYear: year },
        select: { id: true, label: true, academicYear: true, status: true, startDate: true, endDate: true },
        orderBy: { academicYear: "desc" },
      }),
      prisma.holiday.findMany({
        where: { campusId, fromDate: { gte: new Date(`${year}-01-01`) }, toDate: { lte: new Date(`${year}-12-31`) } },
        orderBy: { fromDate: "asc" },
      }),
      prisma.examSchedule.findMany({
        where: {
          campusId,
          date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
          ...(canSeeDrafts ? {} : { exam: { status: { in: ANNOUNCED_EXAM_STATUSES } } }),
        },
        select: {
          date: true,
          exam: { select: { id: true, title: true, examType: true, status: true, class: { select: { name: true, section: true } } } },
        },
        orderBy: { date: "asc" },
      }),
    ]);

    // Roll schedules up to per-exam date lists.
    const examMap = new Map<string, { id: string; title: string; examType: string; status: string; className: string; dates: string[] }>();
    for (const s of schedules) {
      const dateStr = s.date.toISOString().slice(0, 10);
      const ex = s.exam;
      if (!ex) continue;
      const key = ex.id;
      if (!examMap.has(key)) {
        examMap.set(key, {
          id: ex.id,
          title: ex.title,
          examType: ex.examType,
          status: ex.status,
          className: `${ex.class.name}${ex.class.section ? ` - ${ex.class.section}` : ""}`,
          dates: [],
        });
      }
      examMap.get(key)!.dates.push(dateStr);
    }

    return Response.json({
      success: true,
      data: {
        weekends: weekends.map((w) => w.dayOfWeek).sort(),
        terms,
        holidays,
        exams: [...examMap.values()],
      },
    });
  } catch (error) {
    return errorResponse(error, "[academic/calendar/unified] GET failed");
  }
}
