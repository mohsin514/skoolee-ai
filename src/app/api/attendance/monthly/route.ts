import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canMarkAttendance, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canMarkAttendance(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const studentId = searchParams.get("studentId");
    const month = searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new ApiError("month param required (YYYY-MM)", 400);

    const campusId = user.role === "SUPER_ADMIN"
      ? await resolveCampusId(user, searchParams.get("campusId"))
      : await resolveCampusId(user, user.campusId);

    const [year, mon] = month.split("-").map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 0); // last day of month

    if (studentId) {
      // Student monthly report
      const student = await prisma.student.findFirst({
        where: { id: studentId, campusId, campus: { schoolId: user.schoolId } },
        select: { id: true, fullName: true, rollNo: true, classId: true, class: { select: { name: true, section: true } } },
      });
      if (!student) throw new ApiError("Student not found", 404);

      // Teacher can only view students in their classes
      if (user.role === "TEACHER") {
        const hasAccess = await prisma.class.findFirst({
          where: {
            id: student.classId, campusId,
            OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }],
          },
        });
        if (!hasAccess) throw new ApiError("Not authorized for this student", 403);
      }

      const records = await prisma.attendance.findMany({
        where: { studentId, campusId, date: { gte: startDate, lte: endDate } },
        select: { date: true, status: true, notes: true },
        orderBy: { date: "asc" },
      });

      const present = records.filter(r => r.status === "PRESENT").length;
      const absent = records.filter(r => r.status === "ABSENT").length;
      const leave = records.filter(r => r.status === "LEAVE").length;
      const total = records.length;
      const percentage = total > 0 ? Math.round(((present + leave) / total) * 100 * 10) / 10 : 0;

      return Response.json({
        type: "student",
        studentId: student.id,
        studentName: student.fullName,
        rollNo: student.rollNo,
        className: [student.class?.name, student.class?.section].filter(Boolean).join(" "),
        month,
        presentDays: present,
        absentDays: absent,
        leaveDays: leave,
        totalDays: total,
        percentage,
        status: percentage < 75 ? "low" : "good",
        details: records.map(r => ({ date: r.date.toISOString().slice(0, 10), status: r.status, notes: r.notes })),
      });
    }

    if (classId) {
      // Class monthly report
      // Teacher access check
      if (user.role === "TEACHER") {
        const hasAccess = await prisma.class.findFirst({
          where: {
            id: classId, campusId, campus: { schoolId: user.schoolId },
            OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }],
          },
        });
        if (!hasAccess) throw new ApiError("Not authorized for this class", 403);
      }

      const cls = await prisma.class.findFirst({
        where: { id: classId, campusId, campus: { schoolId: user.schoolId } },
        select: { id: true, name: true, section: true },
      });
      if (!cls) throw new ApiError("Class not found", 404);

      const students = await prisma.student.findMany({
        where: { classId, campusId },
        select: { id: true, fullName: true, rollNo: true, profileImageUrl: true },
        orderBy: { rollNo: "asc" },
      });

      const studentIds = students.map(s => s.id);
      const records = await prisma.attendance.findMany({
        where: { studentId: { in: studentIds }, campusId, date: { gte: startDate, lte: endDate } },
        select: { studentId: true, status: true, date: true },
      });

      // Group by student
      const studentStats = students.map(student => {
        const studentRecords = records.filter(r => r.studentId === student.id);
        const present = studentRecords.filter(r => r.status === "PRESENT").length;
        const absent = studentRecords.filter(r => r.status === "ABSENT").length;
        const leave = studentRecords.filter(r => r.status === "LEAVE").length;
        const total = studentRecords.length;
        const percentage = total > 0 ? Math.round(((present + leave) / total) * 100 * 10) / 10 : 0;

        // Calculate consecutive absences
        const sortedRecords = studentRecords.sort((a, b) => b.date.getTime() - a.date.getTime());
        let consecutiveAbsences = 0;
        for (const r of sortedRecords) {
          if (r.status === "ABSENT") consecutiveAbsences++;
          else break;
        }

        return { ...student, present, absent, leave, total, percentage, consecutiveAbsences };
      });

      const totalPresent = studentStats.reduce((s, st) => s + st.present, 0);
      const totalAbsent = studentStats.reduce((s, st) => s + st.absent, 0);
      const totalLeave = studentStats.reduce((s, st) => s + st.leave, 0);
      const avgPercentage = studentStats.length > 0
        ? Math.round((studentStats.reduce((s, st) => s + st.percentage, 0) / studentStats.length) * 10) / 10
        : 0;
      const atRisk = studentStats.filter(s => s.percentage < 75 && s.total > 0);

      return Response.json({
        type: "class",
        classId: cls.id,
        className: [cls.name, cls.section].filter(Boolean).join(" "),
        month,
        totalStudents: students.length,
        classAveragePercentage: avgPercentage,
        summary: { totalPresent, totalAbsent, totalLeave },
        atRiskStudents: atRisk.map(s => ({
          studentId: s.id, studentName: s.fullName, rollNo: s.rollNo, profileImageUrl: s.profileImageUrl,
          percentage: s.percentage, absentDays: s.absent, consecutiveAbsences: s.consecutiveAbsences,
        })),
        students: studentStats.map(s => ({
          studentId: s.id, name: s.fullName, rollNo: s.rollNo, profileImageUrl: s.profileImageUrl,
          present: s.present, absent: s.absent, leave: s.leave, percentage: s.percentage,
        })),
      });
    }

    // Campus-wide summary
    if (user.role === "TEACHER") throw new ApiError("Teachers must specify classId", 400);

    const classes = await prisma.class.findMany({
      where: { campusId, campus: { schoolId: user.schoolId } },
      select: { id: true, name: true, section: true, _count: { select: { students: true } } },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });

    const allRecords = await prisma.attendance.findMany({
      where: { campusId, date: { gte: startDate, lte: endDate } },
      select: { studentId: true, status: true, student: { select: { classId: true } } },
    });

    const classSummaries = classes.map(cls => {
      const classRecords = allRecords.filter(r => r.student.classId === cls.id);
      const present = classRecords.filter(r => r.status === "PRESENT").length;
      const absent = classRecords.filter(r => r.status === "ABSENT").length;
      const leave = classRecords.filter(r => r.status === "LEAVE").length;
      const total = classRecords.length;
      const percentage = total > 0 ? Math.round(((present + leave) / total) * 100 * 10) / 10 : 0;

      return {
        classId: cls.id,
        className: [cls.name, cls.section].filter(Boolean).join(" "),
        studentCount: cls._count.students,
        present, absent, leave, total, percentage,
      };
    });

    const totalPresent = allRecords.filter(r => r.status === "PRESENT").length;
    const totalAbsent = allRecords.filter(r => r.status === "ABSENT").length;
    const totalLeave = allRecords.filter(r => r.status === "LEAVE").length;
    const overallPercentage = allRecords.length > 0
      ? Math.round(((totalPresent + totalLeave) / allRecords.length) * 100 * 10) / 10
      : 0;

    // Count at-risk students campus-wide
    const studentAttendance = new Map<string, { present: number; total: number }>();
    for (const r of allRecords) {
      const entry = studentAttendance.get(r.studentId) || { present: 0, total: 0 };
      entry.total++;
      if (r.status === "PRESENT" || r.status === "LEAVE") entry.present++;
      studentAttendance.set(r.studentId, entry);
    }
    const atRiskCount = Array.from(studentAttendance.values()).filter(s => s.total > 0 && (s.present / s.total) * 100 < 75).length;

    return Response.json({
      type: "campus",
      month,
      overallPercentage,
      totalPresent, totalAbsent, totalLeave,
      totalRecords: allRecords.length,
      atRiskCount,
      classes: classSummaries,
    });
  } catch (error) {
    return errorResponse(error, "[attendance/monthly] GET failed");
  }
}
