import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "SUPER_ADMIN", "APP_OWNER"].includes(user.role)) {
      throw new ApiError("Forbidden", 403);
    }

    const sp = req.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, sp.get("campusId"));
    const academicYear = Number(sp.get("academicYear")) || new Date().getFullYear();
    const yearStart = new Date(`${academicYear}-01-01`);

    const teachers = await prisma.user.findMany({
      where: { campusId, role: "TEACHER", isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        profileImageUrl: true,
        taughtSubjects: {
          where: { class: { academicYear } },
          select: { id: true, name: true, classId: true, class: { select: { id: true, name: true, section: true, academicYear: true } } },
        },
        ledClasses: {
          where: { academicYear },
          select: { id: true, name: true, section: true },
        },
      },
    });

    const teacherIds = teachers.map((t) => t.id);
    const allClassIds = [...new Set(teachers.flatMap((t) => [
      ...t.taughtSubjects.map((s) => s.classId),
      ...t.ledClasses.map((c) => c.id),
    ]))];

    if (allClassIds.length === 0 || teacherIds.length === 0) {
      return Response.json({
        success: true,
        data: teachers.map((t) => ({
          teacherId: t.id, fullName: t.fullName, email: t.email, profileImageUrl: t.profileImageUrl,
          subjectsCount: 0, classesCount: 0, ledClasses: [], totalStudents: 0,
          avgPercentage: null, passRate: null, attendanceCompletionRate: null,
          marksCompletionRate: null, reportCardsGenerated: 0, teacherAttendanceRate: null,
        })),
      });
    }

    const [
      studentsByClass,
      reportCards,
      exams,
      attendanceByClass,
      attendanceDaysByClass,
      teacherAttendancePresent,
      teacherAttendanceTotal,
    ] = await Promise.all([
      prisma.student.groupBy({
        by: ["classId"],
        where: { classId: { in: allClassIds }, campusId },
        _count: { id: true },
      }),
      prisma.reportCard.findMany({
        where: { campusId, student: { classId: { in: allClassIds } }, exam: { academicYear } },
        select: { percentage: true, grade: true, student: { select: { classId: true } } },
      }),
      prisma.exam.findMany({
        where: { campusId, classId: { in: allClassIds }, academicYear },
        select: {
          id: true, classId: true,
          _count: { select: { marks: true } },
          class: { select: { _count: { select: { students: true, subjects: true } } } },
        },
      }),
      prisma.attendance.groupBy({
        by: ["classId"],
        where: { campusId, classId: { in: allClassIds }, date: { gte: yearStart } },
        _count: { id: true },
      }),
      // Physical table and column names, not the Prisma model names. Postgres
      // folds unquoted identifiers to lower case and treats quoted ones
      // literally, so "Attendance"/"classId" resolved to nothing and the whole
      // endpoint 500'd with 42P01 — which the panel rendered as "0 teachers".
      prisma.$queryRawUnsafe<Array<{ classId: string; days: bigint }>>(
        `SELECT "class_id" AS "classId", COUNT(DISTINCT "date") AS days
           FROM "attendance"
          WHERE "campus_id" = $1 AND "class_id" = ANY($2) AND "date" >= $3
          GROUP BY "class_id"`,
        campusId, allClassIds, yearStart
      ),
      prisma.teacherAttendance.groupBy({
        by: ["userId"],
        where: { userId: { in: teacherIds }, campusId, status: "PRESENT", date: { gte: yearStart } },
        _count: { id: true },
      }),
      prisma.teacherAttendance.groupBy({
        by: ["userId"],
        where: { userId: { in: teacherIds }, campusId, date: { gte: yearStart } },
        _count: { id: true },
      }),
    ]);

    const studentCountMap = new Map(studentsByClass.map((s) => [s.classId, s._count.id]));
    const reportCardsByClass = new Map<string, Array<{ percentage: number | null }>>();
    for (const rc of reportCards) {
      const cid = rc.student.classId;
      if (!reportCardsByClass.has(cid)) reportCardsByClass.set(cid, []);
      reportCardsByClass.get(cid)!.push(rc);
    }
    const examsByClass = new Map<string, typeof exams>();
    for (const e of exams) {
      if (!examsByClass.has(e.classId)) examsByClass.set(e.classId, []);
      examsByClass.get(e.classId)!.push(e);
    }
    const attendanceCountMap = new Map(attendanceByClass.map((a) => [a.classId, a._count.id]));
    const attendanceDaysMap = new Map(attendanceDaysByClass.map((a) => [a.classId, Number(a.days)]));
    const teacherPresentMap = new Map(teacherAttendancePresent.map((a) => [a.userId, a._count.id]));
    const teacherTotalMap = new Map(teacherAttendanceTotal.map((a) => [a.userId, a._count.id]));

    const performance = teachers.map((teacher) => {
      const classIds = [...new Set([
        ...teacher.taughtSubjects.map((s) => s.classId),
        ...teacher.ledClasses.map((c) => c.id),
      ])];

      if (classIds.length === 0) {
        return {
          teacherId: teacher.id, fullName: teacher.fullName, email: teacher.email, profileImageUrl: teacher.profileImageUrl,
          subjectsCount: 0, classesCount: 0, ledClasses: [], totalStudents: 0,
          avgPercentage: null, passRate: null, attendanceCompletionRate: null,
          marksCompletionRate: null, reportCardsGenerated: 0, teacherAttendanceRate: null,
        };
      }

      const totalStudents = classIds.reduce((sum, cid) => sum + (studentCountMap.get(cid) || 0), 0);
      const teacherReportCards = classIds.flatMap((cid) => reportCardsByClass.get(cid) || []);
      const teacherExams = classIds.flatMap((cid) => examsByClass.get(cid) || []);

      const avgPercentage = teacherReportCards.length
        ? Math.round(teacherReportCards.reduce((sum, r) => sum + (r.percentage || 0), 0) / teacherReportCards.length * 10) / 10
        : null;

      const passRate = teacherReportCards.length
        ? Math.round(teacherReportCards.filter((r) => (r.percentage || 0) >= 50).length / teacherReportCards.length * 100)
        : null;

      const totalExpectedMarks = teacherExams.reduce((sum, e) => sum + (e.class._count.students * e.class._count.subjects), 0);
      const totalEnteredMarks = teacherExams.reduce((sum, e) => sum + e._count.marks, 0);
      const marksCompletionRate = totalExpectedMarks > 0 ? Math.round(totalEnteredMarks / totalExpectedMarks * 100) : null;

      const totalAttDays = classIds.reduce((sum, cid) => sum + (attendanceDaysMap.get(cid) || 0), 0);
      const totalAttRecords = classIds.reduce((sum, cid) => sum + (attendanceCountMap.get(cid) || 0), 0);
      const expectedAttendance = totalAttDays * totalStudents;
      const attendanceCompletionRate = expectedAttendance > 0 ? Math.round(totalAttRecords / expectedAttendance * 100) : null;

      const presentDays = teacherPresentMap.get(teacher.id) || 0;
      const totalDays = teacherTotalMap.get(teacher.id) || 0;

      return {
        teacherId: teacher.id, fullName: teacher.fullName, email: teacher.email, profileImageUrl: teacher.profileImageUrl,
        subjectsCount: teacher.taughtSubjects.length,
        classesCount: classIds.length,
        ledClasses: teacher.ledClasses,
        totalStudents,
        avgPercentage, passRate, attendanceCompletionRate, marksCompletionRate,
        reportCardsGenerated: teacherReportCards.length,
        teacherAttendanceRate: totalDays > 0 ? Math.round(presentDays / totalDays * 100) : null,
        teacherPresentDays: presentDays,
        teacherTotalDays: totalDays,
      };
    });

    performance.sort((a, b) => (b.avgPercentage ?? -1) - (a.avgPercentage ?? -1));

    return Response.json({ success: true, data: performance });
  } catch (error) {
    return errorResponse(error, "[teachers/performance] GET failed");
  }
}
