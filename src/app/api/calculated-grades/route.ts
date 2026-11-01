import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertModuleRead, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { calculateWeightedGrade, calculateWeightedGradeForClass } from "@/lib/academic/grade-calculator";

export async function GET(request: NextRequest) {
  // Same shape, and the same gap, as grade-config/weighted-result: a classId
  // returns every pupil's calculated grade. Staff-only, on the exams bit.
  let session;
  try {
    session = await requireAuthUser();
    await assertModuleRead(session, "exams");
  } catch (error) {
    return errorResponse(error, "[calculated-grades] GET failed");
  }
  if (!session.campusId) {
    return NextResponse.json({ error: "No campus associated with this account" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const classId = searchParams.get("classId");
  const academicYear = Number(searchParams.get("academicYear")) || new Date().getFullYear();

  if (!classId) {
    return NextResponse.json({ error: "classId is required" }, { status: 400 });
  }

  try {
    // SKAI-214: the class and pupil must both belong to the caller's campus, as weighted-result requires;
    // otherwise a pupil id from another campus returned that pupil's name and calculation.
    const cls = await prisma.class.findFirst({ where: { id: classId, campusId: session.campusId }, select: { id: true } });
    if (!cls) return NextResponse.json({ error: "Class not found in your campus" }, { status: 404 });
    if (studentId) {
      const pupil = await prisma.student.findFirst({ where: { id: studentId, campusId: session.campusId }, select: { id: true } });
      if (!pupil) return NextResponse.json({ error: "Student not found in your campus" }, { status: 404 });
      const result = await calculateWeightedGrade(studentId, session.campusId, classId, academicYear);
      return NextResponse.json({ success: true, grade: result });
    }

    const results = await calculateWeightedGradeForClass(classId, session.campusId, academicYear);
    return NextResponse.json({ success: true, grades: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Calculation failed" }, { status: 500 });
  }
}
