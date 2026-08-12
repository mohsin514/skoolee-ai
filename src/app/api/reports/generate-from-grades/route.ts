import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { calculateWeightedGradeForClass } from "@/lib/academic/grade-calculator";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user || !user.campusId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "TEACHER" && user.role !== "PRINCIPAL" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const classId = searchParams.get("classId");
    const academicYear = Number(searchParams.get("academicYear")) || new Date().getFullYear();

    if (!studentId || !classId) {
      return NextResponse.json({ error: "studentId and classId are required" }, { status: 400 });
    }

    const finalExam = await prisma.exam.findFirst({
      where: { campusId: user.campusId, classId, academicYear, examType: "FINAL", subjectId: null },
    });

    if (!finalExam) {
      return NextResponse.json({ reportCard: null });
    }

    const reportCard = await prisma.reportCard.findFirst({
      where: { examId: finalExam.id, studentId },
      include: {
        exam: { select: { id: true, title: true, term: true } },
        student: {
          select: { id: true, fullName: true, rollNo: true, profileImageUrl: true, class: { select: { id: true, name: true, section: true } } },
        },
      },
    });

    // Attach subject breakdown from grade calculator
    let subjectBreakdown: any[] = [];
    if (reportCard) {
      try {
        const { calculateWeightedGrade } = await import("@/lib/academic/grade-calculator");
        const gradeDetail = await calculateWeightedGrade(studentId, user.campusId, classId, academicYear);
        subjectBreakdown = gradeDetail.subjectBreakdown || [];
      } catch {}
    }

    return NextResponse.json({ reportCard: { ...reportCard, subjectBreakdown } });
  } catch (error: any) {
    console.error("Generate-from-grades GET error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user || !user.campusId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "TEACHER" && user.role !== "PRINCIPAL" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { classId, academicYear } = await req.json();
    if (!classId || !academicYear) {
      return NextResponse.json({ error: "classId and academicYear are required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, campusId: user.campusId },
      select: { id: true, name: true, section: true },
    });
    if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 });

    // Find or create a synthetic "Final Grade" exam for this class/year
    let finalExam = await prisma.exam.findFirst({
      where: {
        campusId: user.campusId,
        classId,
        academicYear: Number(academicYear),
        examType: "FINAL",
        subjectId: null,
      },
    });

    if (!finalExam) {
      finalExam = await prisma.exam.create({
        data: {
          campusId: user.campusId,
          classId,
          title: `Final Grade - ${cls.name} ${cls.section || ""}`.trim(),
          term: `Academic Year ${academicYear}`,
          academicYear: Number(academicYear),
          examType: "FINAL",
          status: "PUBLISHED",
          totalMarks: 100,
          publishedAt: new Date(),
        },
      });
    }

    // Calculate weighted grades for all students
    const grades = await calculateWeightedGradeForClass(classId, user.campusId, Number(academicYear));
    if (!grades.length) {
      return NextResponse.json({ error: "No grade data available. Ensure exams have marks entered." }, { status: 400 });
    }

    const subjects = await prisma.subject.findMany({
      where: { classId, campusId: user.campusId },
      select: { id: true, name: true, totalMarks: true },
    });

    const studentIds = grades.map((g) => g.studentId);
    const existingCards = await prisma.reportCard.findMany({
      where: { examId: finalExam.id, studentId: { in: studentIds } },
      select: { id: true, studentId: true },
    });
    const existingMap = new Map(existingCards.map((c) => [c.studentId, c.id]));
    const totalMarks = subjects.reduce((s, sub) => s + sub.totalMarks, 0);
    const now = new Date();

    const ops = grades.map((grade) => {
      const shared = {
        totalMarks,
        obtainedMarks: grade.subjectBreakdown.reduce((s, sb) => s + sb.obtainedMarks, 0),
        percentage: grade.overallPercentage,
        grade: grade.overallGrade,
        rank: (grade as any).rank || 0,
        status: "PUBLISHED" as const,
        remarksEn: null,
        remarksUr: null,
        remarksApproved: false,
        isSent: false,
        deliveryStatus: "PENDING",
        generatedAt: now,
      };
      const existingId = existingMap.get(grade.studentId);
      if (existingId) {
        return prisma.reportCard.update({ where: { id: existingId }, data: shared });
      }
      return prisma.reportCard.create({ data: { ...shared, campusId: user.campusId!, examId: finalExam!.id, studentId: grade.studentId } });
    });

    await prisma.$transaction(ops);

    return NextResponse.json({ success: true, count: grades.length });
  } catch (error: any) {
    console.error("Generate-from-grades error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
