import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertModuleRead, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { calculateWeightedGradeForClass } from "@/lib/academic/grade-calculator";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // getAuthUser() only decodes the cookie; it does not re-check that the
    // account is still active or still holds the role its token claims, which
    // every other route gets from requireAuthUser(). And the response is the
    // whole class's calculated grades with roll numbers — staff data, served
    // here to any signed-in account, students and guardians included.
    const user = await requireAuthUser();
    await assertModuleRead(user, "exams");
    if (!user.campusId) {
      return NextResponse.json({ error: "No campus associated with this account" }, { status: 400 });
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
  } catch (error) {
    // Was a blanket 500 carrying error.message straight to the client, which
    // both mislabelled a 403 as a server fault and echoed raw engine text.
    return errorResponse(error, "[grade-config/weighted-result] GET failed");
  }
}
