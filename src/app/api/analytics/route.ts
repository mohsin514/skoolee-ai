import { prisma } from "@/lib/db/prisma";
import { errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { gradeForPercentage } from "@/lib/academic/report-cards";

export async function GET(req: Request) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const yearParam = searchParams.get("year");

    const campusId =
      user.role === "SUPER_ADMIN" && !requestedCampusId
        ? null
        : await resolveCampusId(user, requestedCampusId);

    const campusWhere = campusId ? { campusId } : { campus: { schoolId: user.schoolId } };
    const academicYear = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    const exams = await prisma.exam.findMany({
      where: {
        ...campusWhere,
        academicYear,
        status: { in: ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"] },
      },
      select: { id: true, title: true, term: true, classId: true, examType: true },
      orderBy: { lockedAt: "asc" },
    });

    const examIds = exams.map((e) => e.id);

    const [reportCards, marks, students, attendance] = await Promise.all([
      prisma.reportCard.findMany({
        where: { examId: { in: examIds } },
        select: {
          examId: true,
          studentId: true,
          percentage: true,
          grade: true,
          obtainedMarks: true,
          totalMarks: true,
          attendancePresent: true,
          attendanceTotal: true,
          student: { select: { fullName: true, rollNo: true, classId: true } },
        },
      }),
      prisma.mark.findMany({
        where: { examId: { in: examIds } },
        select: {
          examId: true,
          subjectId: true,
          marksObtained: true,
          subject: { select: { name: true, totalMarks: true } },
        },
      }),
      prisma.student.count({ where: campusId ? { campusId } : { campus: { schoolId: user.schoolId } } }),
      prisma.attendance.groupBy({
        by: ["status"],
        where: {
          ...(campusId ? { campusId } : { campus: { schoolId: user.schoolId } }),
          date: { gte: new Date(academicYear, 0, 1) },
        },
        _count: { _all: true },
      }),
    ]);

    const allPcts = reportCards.map((r) => r.percentage);
    const avgPerformance = allPcts.length
      ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length * 10) / 10
      : 0;
    const passCount = allPcts.filter((p) => p >= 50).length;
    const passRate = allPcts.length ? Math.round((passCount / allPcts.length) * 100) : 0;
    const needsAttention = reportCards.filter((r) => r.percentage < 50).length;

    const classMap = new Map<string, string>();
    const classExams = await prisma.class.findMany({
      where: { id: { in: [...new Set(exams.map((e) => e.classId))] } },
      select: { id: true, name: true, section: true },
    });
    for (const c of classExams) {
      classMap.set(c.id, [c.name, c.section].filter(Boolean).join(" - "));
    }

    const classPerfMap = new Map<string, { total: number; count: number }>();
    for (const r of reportCards) {
      const classId = r.student.classId;
      const className = classMap.get(classId) || "Unknown";
      const prev = classPerfMap.get(className) || { total: 0, count: 0 };
      prev.total += r.percentage;
      prev.count += 1;
      classPerfMap.set(className, prev);
    }
    const classPerformance = [...classPerfMap.entries()]
      .map(([name, { total, count }]) => ({
        className: name,
        average: Math.round((total / count) * 10) / 10,
        students: count,
      }))
      .sort((a, b) => b.average - a.average);

    const subjectMap = new Map<string, { name: string; obtained: number; total: number; count: number }>();
    for (const m of marks) {
      const prev = subjectMap.get(m.subjectId) || { name: m.subject.name, obtained: 0, total: 0, count: 0 };
      prev.obtained += m.marksObtained;
      prev.total += m.subject.totalMarks;
      prev.count += 1;
      subjectMap.set(m.subjectId, prev);
    }
    const subjectPerformance = [...subjectMap.values()]
      .map((s) => ({
        subject: s.name,
        average: s.total > 0 ? Math.round((s.obtained / s.total) * 100 * 10) / 10 : 0,
        entries: s.count,
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject));

    const gradeDistribution: Record<string, number> = {};
    for (const r of reportCards) {
      const grade = r.grade || gradeForPercentage(r.percentage);
      gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
    }
    const gradeData = Object.entries(gradeDistribution)
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => {
        const order = ["A+", "A", "B", "C", "D", "F"];
        return order.indexOf(a.grade) - order.indexOf(b.grade);
      });

    const examTrends = exams.map((exam) => {
      const cards = reportCards.filter((r) => r.examId === exam.id);
      const avg = cards.length
        ? Math.round(cards.reduce((s, c) => s + c.percentage, 0) / cards.length * 10) / 10
        : 0;
      return {
        examId: exam.id,
        title: exam.title,
        term: exam.term,
        type: exam.examType,
        average: avg,
        students: cards.length,
        className: classMap.get(exam.classId) || "",
      };
    });

    const topStudents = [...reportCards]
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 10)
      .map((r) => ({
        name: r.student.fullName,
        rollNo: r.student.rollNo,
        percentage: r.percentage,
        grade: r.grade || gradeForPercentage(r.percentage),
      }));

    const atRiskStudents = [...reportCards]
      .filter((r) => r.percentage < 50)
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, 10)
      .map((r) => ({
        name: r.student.fullName,
        rollNo: r.student.rollNo,
        percentage: r.percentage,
        attendancePct: r.attendanceTotal > 0
          ? Math.round((r.attendancePresent / r.attendanceTotal) * 100)
          : null,
      }));

    const totalAttendance = attendance.reduce((s, a) => s + a._count._all, 0);
    const presentCount = attendance.find((a) => a.status === "PRESENT")?._count._all || 0;
    const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : null;

    return Response.json({
      success: true,
      data: {
        summary: {
          avgPerformance,
          passRate,
          needsAttention,
          totalStudents: students,
          attendanceRate,
        },
        classPerformance,
        subjectPerformance,
        gradeDistribution: gradeData,
        examTrends,
        topStudents,
        atRiskStudents,
        academicYear,
      },
    });
  } catch (error) {
    return errorResponse(error, "[analytics] GET failed");
  }
}
