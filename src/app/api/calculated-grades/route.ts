import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { calculateWeightedGrade, calculateWeightedGradeForClass } from "@/lib/academic/grade-calculator";

export async function GET(request: NextRequest) {
  const session = await getAuthUser();
  if (!session || !session.campusId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
