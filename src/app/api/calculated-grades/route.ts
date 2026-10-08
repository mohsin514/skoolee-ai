import { NextRequest, NextResponse } from "next/server";
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
    if (studentId) {
      const result = await calculateWeightedGrade(studentId, session.campusId, classId, academicYear);
      return NextResponse.json({ success: true, grade: result });
    }

    const results = await calculateWeightedGradeForClass(classId, session.campusId, academicYear);
    return NextResponse.json({ success: true, grades: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Calculation failed" }, { status: 500 });
  }
}
