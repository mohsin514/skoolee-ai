import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { calculateWeightedGradeForClass } from "@/lib/academic/grade-calculator";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user || !user.campusId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const academicYear = Number(searchParams.get("academicYear")) || new Date().getFullYear();

    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, campusId: user.campusId },
      select: { id: true },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found in your campus" }, { status: 404 });
    }

    const grades = await calculateWeightedGradeForClass(classId, user.campusId, academicYear);

    const students = await prisma.student.findMany({
      where: { classId, campusId: user.campusId },
      select: { id: true, rollNo: true },
    });
    const rollMap = new Map(students.map((s) => [s.id, s.rollNo]));

    if (!grades.length) {
      return NextResponse.json(
        { error: "No grade data available. Ensure exams have marks entered." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      grades: grades.map((g) => ({ ...g, rollNo: rollMap.get(g.studentId) || null })),
    });
  } catch (error: any) {
    console.error("weighted-result GET error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
