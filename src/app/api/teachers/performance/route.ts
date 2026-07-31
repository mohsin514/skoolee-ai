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

    const teachers = await prisma.user.findMany({
      where: { campusId, role: "TEACHER", isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        profileImageUrl: true,
        taughtSubjects: {
          where: { class: { academicYear } },
          select: {
            id: true,
            name: true,
            classId: true,
            class: { select: { id: true, name: true, section: true, academicYear: true } },
          },
        },
        ledClasses: {
          where: { academicYear },
          select: { id: true, name: true, section: true },
        },
      },
    });

    const performance = await Promise.all(
      teachers.map(async (teacher) => {
        const classIds = [
          ...new Set([
            ...teacher.taughtSubjects.map((s) => s.classId),
            ...teacher.ledClasses.map((c) => c.id),
          ]),
        ];

        if (classIds.length === 0) {
          return {
            teacherId: teacher.id,
            fullName: teacher.fullName,
            email: teacher.email,
            profileImageUrl: teacher.profileImageUrl,
            subjectsCount: 0,
            classesCount: 0,
            ledClasses: [],
            totalStudents: 0,
            avgPercentage: null,
            passRate: null,
            attendanceCompletionRate: null,
            marksCompletionRate: null,
            reportCardsGenerated: 0,
            teacherAttendanceRate: null,
          };
        }

        const [studentCount, reportCards, exams, attendanceRecords, totalAttendanceDays, teacherAttendance] = await Promise.all([
          prisma.student.count({ where: { classId: { in: classIds }, campusId } }),
          prisma.reportCard.findMany({
            where: { campusId, student: { classId: { in: classIds } }, exam: { academicYear } },
            select: { percentage: true, grade: true },
          }),
          prisma.exam.findMany({
            where: { campusId, classId: { in: classIds }, academicYear },
            select: {
              id: true,
              _count: { select: { marks: true } },
              class: { select: { _count: { select: { students: true, subjects: true } } } },
            },
          }),
          prisma.attendance.count({
            where: { campusId, classId: { in: classIds }, date: { gte: new Date(`${academicYear}-01-01`) } },
          }),
          prisma.attendance.groupBy({
            by: ["date"],
            where: { campusId, classId: { in: classIds }, date: { gte: new Date(`${academicYear}-01-01`) } },
          }),
          prisma.teacherAttendance.count({
            where: { userId: teacher.id, campusId, status: "PRESENT", date: { gte: new Date(`${academicYear}-01-01`) } },
          }),
        ]);

        const totalTeacherDays = await prisma.teacherAttendance.count({
          where: { userId: teacher.id, campusId, date: { gte: new Date(`${academicYear}-01-01`) } },
        });

        const avgPercentage = reportCards.length
          ? Math.round(reportCards.reduce((sum, r) => sum + (r.percentage || 0), 0) / reportCards.length * 10) / 10
          : null;

        const passRate = reportCards.length
          ? Math.round(reportCards.filter((r) => (r.percentage || 0) >= 50).length / reportCards.length * 100)
          : null;

        const totalExpectedMarks = exams.reduce((sum, e) => {
          return sum + (e.class._count.students * e.class._count.subjects);
        }, 0);
        const totalEnteredMarks = exams.reduce((sum, e) => sum + e._count.marks, 0);
        const marksCompletionRate = totalExpectedMarks > 0
          ? Math.round(totalEnteredMarks / totalExpectedMarks * 100)
          : null;

        const expectedAttendance = totalAttendanceDays.length * studentCount;
        const attendanceCompletionRate = expectedAttendance > 0
          ? Math.round(attendanceRecords / expectedAttendance * 100)
          : null;

        return {
          teacherId: teacher.id,
          fullName: teacher.fullName,
          email: teacher.email,
          profileImageUrl: teacher.profileImageUrl,
          subjectsCount: teacher.taughtSubjects.length,
          classesCount: classIds.length,
          ledClasses: teacher.ledClasses,
          totalStudents: studentCount,
          avgPercentage,
          passRate,
          attendanceCompletionRate,
          marksCompletionRate,
          reportCardsGenerated: reportCards.length,
          teacherAttendanceRate: totalTeacherDays > 0
            ? Math.round(teacherAttendance / totalTeacherDays * 100)
            : null,
          teacherPresentDays: teacherAttendance,
          teacherTotalDays: totalTeacherDays,
        };
      })
    );

    performance.sort((a, b) => (b.avgPercentage ?? -1) - (a.avgPercentage ?? -1));

    return Response.json({ success: true, data: performance });
  } catch (error) {
    return errorResponse(error, "[teachers/performance] GET failed");
  }
}
