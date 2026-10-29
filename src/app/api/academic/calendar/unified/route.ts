import { loadLocaleTimeline } from "@/lib/locale/store";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse, isFamilyRole, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { publishedPapersForClasses } from "@/lib/academic/datesheet-publication";
import { mergePublishedPapers } from "@/lib/academic/family-calendar";
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
    // SKAI-1027: families only see session papers from the published date sheet,
    // never the live draft rows (same read model as /api/academic/exam-schedule).
    const family = isFamilyRole(user);
    const familyClassIds = family
      ? [...new Set((await prisma.student.findMany({
          where: user.role === "STUDENT" ? { studentUserId: user.userId } : studentScope(user, "learningRecords"),
          select: { classId: true },
        })).map((s) => s.classId).filter((id): id is string => Boolean(id)))]
      : [];

    const [weekends, terms, holidays, schedules] = await Promise.all([
      loadLocaleTimeline(user.schoolId, campusId),
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
          ...(canSeeDrafts ? {} : { exam: { status: { in: ANNOUNCED_EXAM_STATUSES }, ...(family ? { sessionId: null } : {}) } }),
        },
        select: {
          date: true,
          exam: { select: { id: true, title: true, examType: true, status: true, class: { select: { name: true, section: true } } } },
        },
        orderBy: { date: "asc" },
      }),
    ]);

    const weekendDates: string[] = [];
    for (let day = new Date(Date.UTC(year, 0, 1)); day.getUTCFullYear() === year; day = new Date(day.getTime() + 86400000)) {
      if (weekends(day).weekend.includes(day.getUTCDay())) weekendDates.push(day.toISOString().slice(0, 10));
    }
    const currentLocale = weekends();
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

    if (family) {
      const published = await publishedPapersForClasses(user.schoolId, familyClassIds);
      mergePublishedPapers(examMap, published, year);
      if (published.length) {
        const types = await prisma.exam.findMany({ where: { id: { in: [...new Set(published.map((p) => p.examId))] }, campusId }, select: { id: true, examType: true, status: true } });
        for (const t of types) { const e = examMap.get(t.id); if (e) { e.examType = t.examType; e.status = t.status; } }
        // Papers of another campus never reach this campus's calendar.
        for (const p of published) if (!types.some((t) => t.id === p.examId)) examMap.delete(p.examId);
        for (const e of examMap.values()) e.dates.sort();
      }
    }

    return Response.json({
      success: true,
      data: {
        weekends: currentLocale.weekend.map((day) => day || 7).sort(),
        weekendDates,
        weekStartsOn: currentLocale.weekStartsOn,
        terms,
        holidays,
        exams: [...examMap.values()],
      },
    });
  } catch (error) {
    return errorResponse(error, "[academic/calendar/unified] GET failed");
  }
}
