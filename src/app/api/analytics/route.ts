import { prisma } from "@/lib/db/prisma";
import { assertModuleRead, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { gradeForPercentage } from "@/lib/academic/report-cards";
import { groupedRuleRate } from "@/lib/attendance";
import { attendanceRuleFor } from "@/lib/attendance/rule";

export async function GET(req: Request) {
  try {
    const user = await requireAuthUser();
    // Campus-wide academic analytics — and, at the bottom of the payload, the
    // named top-ten and at-risk lists with roll numbers and attendance rates.
    // The handler stopped at requireAuthUser(), so any signed-in STUDENT or
    // PARENT could pull the whole cohort's results and the list of children the
    // school considers at risk. Staff-only, gated on reports.view like the
    // screen it feeds.
    await assertModuleRead(user, "reports");
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
          // SKAI-1607: the selected year is closed at both ends, like the exam and report-card filters.
          date: { gte: new Date(Date.UTC(academicYear, 0, 1)), lt: new Date(Date.UTC(academicYear + 1, 0, 1)) },
        },
        _count: { _all: true },
      }),
    ]);

    // SKAI-1750: pass/at-risk follow each class's published pass mark (as report cards do), not a fixed 50%.
    const examClassIds = [...new Set(exams.map((e) => e.classId))];
    const passConfigs = examClassIds.length
      ? await prisma.gradeWeightConfig.findMany({
          where: { schoolId: user.schoolId, academicYear, classId: { in: examClassIds } },
          select: { classId: true, passingPercentage: true },
        })
      : [];
    const passMarkByClass = new Map(passConfigs.map((c) => [c.classId, c.passingPercentage]));
    const examClassOf = new Map(exams.map((e) => [e.id, e.classId]));
    const passes = (r: { examId: string; percentage: number }) =>
      r.percentage >= (passMarkByClass.get(examClassOf.get(r.examId) ?? "") ?? 50);

    const allPcts = reportCards.map((r) => r.percentage);
    const avgPerformance = allPcts.length
      ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length * 10) / 10
      : 0;
    const passCount = reportCards.filter(passes).length;
    const passRate = allPcts.length ? Math.round((passCount / allPcts.length) * 100) : 0;
    const needsAttention = reportCards.filter((r) => !passes(r)).length;

    const classMap = new Map<string, string>();
    const classExams = await prisma.class.findMany({
      where: { id: { in: [...new Set(exams.map((e) => e.classId))] } },
      select: { id: true, name: true, section: true },
    });
    for (const c of classExams) {
      classMap.set(c.id, [c.name, c.section].filter(Boolean).join(" - "));
    }

    const classPerfMap = new Map<string, { total: number; count: number }>();
    // SKAI-1609: a report belongs to the class whose exam produced it, not the pupil's class today.
    const examClass = new Map(exams.map((e) => [e.id, e.classId]));
    for (const r of reportCards) {
      const classId = examClass.get(r.examId) ?? r.student.classId;
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
      .filter((r) => !passes(r))
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

    // SKAI-1604: the dashboard rate follows the school's published counting rule, like monthly and summary reports.
    const attendanceRate = groupedRuleRate(attendance.map((a) => ({ status: String(a.status), count: a._count._all })), await attendanceRuleFor(user.schoolId));

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
