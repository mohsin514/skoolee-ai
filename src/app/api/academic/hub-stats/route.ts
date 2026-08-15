import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertStaffRole, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// GET /api/academic/hub-stats?campusId=
// Aggregated dashboard data for the Academic Hub: phase progress, quick stats,
// action items, and recent activity. Pure reads — no mutations.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Campus-wide academic statistics — staff only.
    assertStaffRole(user);
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));

    const activeCycle = await prisma.academicCycle.findFirst({
      where: { campusId, status: "ACTIVE" },
      orderBy: { academicYear: "desc" },
    });

    // Years that actually contain classes, newest first.
    const yearRows = await prisma.class.groupBy({
      by: ["academicYear"],
      where: { campusId },
      orderBy: { academicYear: "desc" },
    });
    const availableYears = yearRows.map((r) => r.academicYear);

    /**
     * A campus can have an active cycle for a year nobody has set up yet (e.g.
     * the cycle rolled to 2027 while every class still lives in 2026). Keying
     * the dashboard purely off the cycle then reports zero of everything, which
     * reads as "the hub is broken". Prefer an explicit ?year=, then the active
     * cycle when it actually has classes, then the newest year that does.
     */
    const requestedYear = parseInt(searchParams.get("year") || "", 10);
    const cycleYear = activeCycle?.academicYear ?? null;
    const cycleYearHasData = cycleYear !== null && availableYears.includes(cycleYear);

    let academicYear: number;
    if (Number.isFinite(requestedYear) && requestedYear > 0) {
      academicYear = requestedYear;
    } else if (cycleYearHasData) {
      academicYear = cycleYear!;
    } else if (availableYears.length > 0) {
      academicYear = availableYears[0];
    } else {
      academicYear = cycleYear ?? new Date().getFullYear();
    }

    // True when we are showing a different year than the active cycle, so the
    // UI can say so instead of silently showing surprising numbers.
    const showingNonCycleYear = cycleYear !== null && academicYear !== cycleYear;

    const [
      totalClasses,
      teachersAssigned,
      timetablesPublished,
      examsInProgress,
      classesWithTimetable,
      publishedTimetables,
      marksEntryExams,
      recentExams,
      recentTimetables,
    ] = await Promise.all([
      prisma.class.count({ where: { campusId, academicYear, status: "ACTIVE" } }),
      prisma.user.count({ where: { campusId, role: "TEACHER", taughtSubjects: { some: {} } } }),
      prisma.timetable.count({ where: { campusId, academicYear, status: "PUBLISHED" } }),
      prisma.exam.count({
        where: { campusId, academicYear, status: { in: ["ACTIVE", "MARKS_ENTRY", "LOCKED", "PRINCIPAL_REVIEWED"] } },
      }),
      prisma.timetable.findMany({
        where: { campusId, academicYear },
        select: { classId: true },
        distinct: ["classId"],
      }),
      prisma.timetable.findMany({
        where: { campusId, academicYear, status: "PUBLISHED" },
        select: { classId: true },
        distinct: ["classId"],
      }),
      prisma.exam.count({ where: { campusId, academicYear, status: "MARKS_ENTRY" } }),
      prisma.exam.findMany({
        where: { campusId, academicYear },
        orderBy: { id: "desc" },
        take: 5,
        select: { id: true, title: true, status: true, activatedAt: true, examType: true, term: true },
      }),
      prisma.timetable.findMany({
        where: { campusId, academicYear },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, status: true, updatedAt: true, class: { select: { name: true, section: true } } },
      }),
    ]);

    const classesWithoutTimetable = Math.max(0, totalClasses - classesWithTimetable.length);

    // Teacher conflicts: any teacher booked in >1 class for the same day/period.
    const conflictKeys = await prisma.timetableSlot.findMany({
      // Must be scoped to the year on screen, otherwise old years pile in and
      // the count is meaningless.
      where: { timetable: { campusId, academicYear }, slotType: "CLASS", teacherId: { not: null } },
      select: { teacherId: true, dayOfWeek: true, periodNumber: true, timetableId: true },
    });
    const seen = new Map<string, Set<string>>();
    for (const s of conflictKeys) {
      if (!s.teacherId) continue;
      const key = `${s.teacherId}:${s.dayOfWeek}:${s.periodNumber}`;
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key)!.add(s.timetableId);
    }
    const teacherConflicts = [...seen.values()].filter((set) => set.size > 1).length;

    // Pending unplaced subjects (subjects with no timetable slot yet).
    const subjectsTotal = await prisma.subject.count({ where: { campusId, class: { academicYear } } });
    const placedRows = await prisma.timetableSlot.findMany({
      where: { timetable: { campusId, academicYear }, slotType: "CLASS", subjectId: { not: null } },
      select: { subjectId: true },
      distinct: ["subjectId"],
    });
    const subjectsPlaced = placedRows.length;
    const unplacedSubjects = Math.max(0, subjectsTotal - subjectsPlaced);

    // Facts each hub step needs to explain *why* it is or isn't complete.
    const [periodsCount, weekendsCount, subjectsWithoutTeacher, examsTotal, examsPublished] =
      await Promise.all([
        prisma.periodDefinition.count({ where: { campusId, timeType: "CLASS" } }),
        prisma.weekend.count({ where: { campusId } }),
        prisma.subject.count({ where: { campusId, class: { academicYear }, teacherId: null } }),
        prisma.exam.count({ where: { campusId, academicYear } }),
        prisma.exam.count({ where: { campusId, academicYear, status: "PUBLISHED" } }),
      ]);

    const actionItems: { id: string; label: string; tone: "rose" | "amber" | "teal"; count: number }[] = [];
    if (classesWithoutTimetable > 0) {
      actionItems.push({
        id: "no-timetable",
        label: `${classesWithoutTimetable} class${classesWithoutTimetable > 1 ? "es" : ""} have no timetable`,
        tone: "rose",
        count: classesWithoutTimetable,
      });
    }
    if (marksEntryExams > 0) {
      actionItems.push({
        id: "marks-due",
        label: `${marksEntryExams} exam${marksEntryExams > 1 ? "s" : ""} waiting for marks`,
        tone: "amber",
        count: marksEntryExams,
      });
    }
    if (teacherConflicts > 0) {
      actionItems.push({
        id: "conflicts",
        label: `${teacherConflicts} teacher conflict${teacherConflicts > 1 ? "s" : ""} to resolve`,
        tone: "rose",
        count: teacherConflicts,
      });
    }
    if (unplacedSubjects > 0) {
      actionItems.push({
        id: "unplaced",
        label: `${unplacedSubjects} subject${unplacedSubjects > 1 ? "s" : ""} not scheduled`,
        tone: "amber",
        count: unplacedSubjects,
      });
    }

    const activity = [
      ...recentExams.map((e) => ({
        id: `exam-${e.id}`,
        kind: "exam" as const,
        title: e.title,
        meta: e.examType,
        term: e.term,
        status: e.status,
        at: e.activatedAt?.toISOString() || new Date().toISOString(),
      })),
      ...recentTimetables.map((t) => ({
        id: `tt-${t.id}`,
        kind: "timetable" as const,
        title: `${t.class.name}${t.class.section ? ` - ${t.class.section}` : ""} timetable`,
        meta: t.status,
        status: t.status,
        at: t.updatedAt.toISOString(),
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 5);

    return Response.json({
      success: true,
      data: {
        academicYear,
        cycleStatus: activeCycle?.status || "DRAFT",
        cycleYear,
        availableYears,
        showingNonCycleYear,
        stats: {
          totalClasses,
          teachersAssigned,
          timetablesPublished,
          examsInProgress,
          publishedTimetables: publishedTimetables.length,
          // Extra facts the step tracker uses to explain each step.
          periodsCount,
          weekendsCount,
          subjectsTotal,
          subjectsWithoutTeacher,
          unplacedSubjects,
          classesWithoutTimetable,
          teacherConflicts,
          examsTotal,
          examsPublished,
          marksEntryExams,
        },
        actionItems,
        activity,
      },
    });
  } catch (error) {
    return errorResponse(error, "[academic/hub-stats] GET failed");
  }
}
