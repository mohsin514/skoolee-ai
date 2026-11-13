import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertModuleRead, requireAuthUser } from "@/lib/api/scope";
import { fail, failFrom, ok } from "@/lib/api/envelope";
import { calculateWeightedGrade, calculateWeightedGradeForClass } from "@/lib/academic/grade-calculator";

export async function GET(request: NextRequest) {
  // Same shape, and the same gap, as grade-config/weighted-result: a classId
  // returns every pupil's calculated grade. Staff-only, on the exams bit.
  let session;
  try {
    session = await requireAuthUser();
    await assertModuleRead(session, "exams");
  } catch (error) {
    return failFrom(error, "[calculated-grades] GET failed");
  }
  if (!session.campusId) {
    return fail("BAD_REQUEST", "No campus associated with this account");
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const classId = searchParams.get("classId");
  const academicYear = Number(searchParams.get("academicYear")) || new Date().getFullYear();

  if (!classId) {
    return fail("VALIDATION_FAILED", "classId is required", { classId: ["Required"] });
  }

  try {
    // SKAI-214: the class and pupil must both belong to the caller's campus, as weighted-result requires;
    // otherwise a pupil id from another campus returned that pupil's name and calculation.
    const cls = await prisma.class.findFirst({ where: { id: classId, campusId: session.campusId }, select: { id: true } });
    if (!cls) return fail("NOT_FOUND", "Class not found in your campus");
    if (studentId) {
      const pupil = await prisma.student.findFirst({ where: { id: studentId, campusId: session.campusId }, select: { id: true } });
      if (!pupil) return fail("NOT_FOUND", "Student not found in your campus");
      const result = await calculateWeightedGrade(studentId, session.campusId, classId, academicYear);
      return ok({ grade: result });
    }

    const results = await calculateWeightedGradeForClass(classId, session.campusId, academicYear);
    return ok({ grades: results });
  } catch (error) {
    return failFrom(error, "Calculation failed");
  }
}
