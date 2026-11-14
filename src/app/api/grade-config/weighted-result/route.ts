import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertModuleRead, requireAuthUser } from "@/lib/api/scope";
import { fail, failFrom, ok } from "@/lib/api/envelope";
import { calculateWeightedGradeForClass } from "@/lib/academic/grade-calculator";

export const runtime = "nodejs";

// SKAI-1203 (SKAI-1163 follow-up, academic batch D): weighted-result adopts the envelope.
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
      return fail("BAD_REQUEST", "No campus associated with this account");
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const academicYear = Number(searchParams.get("academicYear")) || new Date().getFullYear();

    if (!classId) {
      return fail("VALIDATION_FAILED", "classId is required", { classId: ["Required"] });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, campusId: user.campusId },
      select: { id: true },
    });
    if (!cls) {
      return fail("NOT_FOUND", "Class not found in your campus");
    }

    const grades = await calculateWeightedGradeForClass(classId, user.campusId, academicYear);

    const students = await prisma.student.findMany({
      where: { classId, campusId: user.campusId },
      select: { id: true, rollNo: true },
    });
    const rollMap = new Map(students.map((s) => [s.id, s.rollNo]));

    if (!grades.length) {
      return fail("BAD_REQUEST", "No grade data available. Ensure exams have marks entered.");
    }

    return ok({
      grades: grades.map((g) => ({ ...g, rollNo: rollMap.get(g.studentId) || null })),
    });
  } catch (error) {
    // Was a blanket 500 carrying error.message straight to the client, which
    // both mislabelled a 403 as a server fault and echoed raw engine text.
    return failFrom(error, "[grade-config/weighted-result] GET failed");
  }
}
