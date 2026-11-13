import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canMarkAttendance, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { countedRuleRate, ruleRate } from "@/lib/attendance";
import { attendanceRuleFor } from "@/lib/attendance/rule";
import { rosterStatusWhere } from "@/lib/students/roster-status";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canMarkAttendance(user)) throw new ApiError("Insufficient permissions", 403);
    // SKO-405: every percentage uses the school's published counting rule.
    const rule = await attendanceRuleFor(user.schoolId);

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const studentId = searchParams.get("studentId");
    const month = searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new ApiError("month param required (YYYY-MM)", 400);

    const campusId = user.role === "SUPER_ADMIN"
      ? await resolveCampusId(user, searchParams.get("campusId"))
      : await resolveCampusId(user, user.campusId);

    const [year, mon] = month.split("-").map(Number);
    // SKAI-1351: attendance dates are stored at UTC midnight, so the month is built in UTC; local midnight
    // in a positive UTC offset would drop the last day.
    const startDate = new Date(Date.UTC(year, mon - 1, 1));
    const endDate = new Date(Date.UTC(year, mon, 0)); // last day of month

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
      const percentage = ruleRate(records, rule);

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

      // SKAI-1407: a row belongs to the class it was taken in. Pupils who moved out mid-month keep their earlier rows here.
      const classRecords = await prisma.attendance.findMany({
        where: { classId, campusId, date: { gte: startDate, lte: endDate } },
        select: { studentId: true, status: true, date: true },
      });
      const currentStudents = await prisma.student.findMany({
        where: { classId, campusId },
        select: { id: true, fullName: true, rollNo: true, profileImageUrl: true },
        orderBy: { rollNo: "asc" },
      });
      const currentIds = new Set(currentStudents.map(s => s.id));
      const movedOutIds = [...new Set(classRecords.map(r => r.studentId))].filter(id => !currentIds.has(id));
      const movedOut = movedOutIds.length
        ? await prisma.student.findMany({ where: { id: { in: movedOutIds }, campusId }, select: { id: true, fullName: true, rollNo: true, profileImageUrl: true }, orderBy: { rollNo: "asc" } })
        : [];
      const students = [...currentStudents, ...movedOut];
      const records = classRecords;

      // Group by student
      const studentStats = students.map(student => {
        const studentRecords = records.filter(r => r.studentId === student.id);
        const present = studentRecords.filter(r => r.status === "PRESENT").length;
        const absent = studentRecords.filter(r => r.status === "ABSENT").length;
        const leave = studentRecords.filter(r => r.status === "LEAVE").length;
        const total = studentRecords.length;
        const percentage = ruleRate(studentRecords, rule);

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

    // SKAI-1870: Postgres counts rows per class, pupil and status, so the summary never loads the month's rows.
    const [classes, groups] = await Promise.all([
      prisma.class.findMany({
        where: { campusId, campus: { schoolId: user.schoolId } },
        // SKAI-1926: a class counts its on-roll pupils only, like the roster and the home KPI.
        select: { id: true, name: true, section: true, _count: { select: { students: { where: rosterStatusWhere(false) } } } },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
      prisma.attendance.groupBy({
        by: ["classId", "studentId", "status"],
        where: { schoolId: user.schoolId, campusId, date: { gte: startDate, lte: endDate } },
        _count: true,
      }),
    ]);

    // SKAI-1407: group by the class each row was taken in. Rows without a stored class fall back to the current class.
    const legacyIds = [...new Set(groups.filter(g => !g.classId).map(g => g.studentId))];
    const currentClass = new Map(legacyIds.length
      ? (await prisma.student.findMany({ where: { id: { in: legacyIds }, campus: { schoolId: user.schoolId } }, select: { id: true, classId: true } })).map(s => [s.id, s.classId])
      : []);
    type Counts = Array<{ status: string; count: number }>;
    const byClass = new Map<string, Counts>();
    const byStudent = new Map<string, Counts>();
    const all: Counts = [];
    const push = (map: Map<string, Counts>, key: string, entry: Counts[number]) => {
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    };
    for (const g of groups) {
      const entry = { status: g.status, count: g._count };
      const cls = g.classId ?? currentClass.get(g.studentId);
      if (cls) push(byClass, cls, entry);
      push(byStudent, g.studentId, entry);
      all.push(entry);
    }
    const countOf = (counts: Counts, status: string) => counts.reduce((n, c) => n + (c.status === status ? c.count : 0), 0);
    const totalOf = (counts: Counts) => counts.reduce((n, c) => n + c.count, 0);

    const classSummaries = classes.map(cls => {
      const counts = byClass.get(cls.id) ?? [];
      return {
        classId: cls.id,
        className: [cls.name, cls.section].filter(Boolean).join(" "),
        studentCount: cls._count.students,
        present: countOf(counts, "PRESENT"),
        absent: countOf(counts, "ABSENT"),
        leave: countOf(counts, "LEAVE"),
        total: totalOf(counts),
        percentage: countedRuleRate(counts, rule),
      };
    });

    const totalPresent = countOf(all, "PRESENT");
    const totalAbsent = countOf(all, "ABSENT");
    const totalLeave = countOf(all, "LEAVE");
    const overallPercentage = countedRuleRate(all, rule);

    // Count at-risk students campus-wide
    const atRiskCount = Array.from(byStudent.values()).filter(counts => {
      const counted = counts.filter(c => !rule.excluded.includes(c.status));
      const total = totalOf(counted);
      const present = totalOf(counted.filter(c => rule.attended.includes(c.status)));
      return total > 0 && (present / total) * 100 < 75;
    }).length;

    return Response.json({
      type: "campus",
      month,
      overallPercentage,
      totalPresent, totalAbsent, totalLeave,
      totalRecords: totalOf(all),
      atRiskCount,
      classes: classSummaries,
    });
  } catch (error) {
    return errorResponse(error, "[attendance/monthly] GET failed");
  }
}
