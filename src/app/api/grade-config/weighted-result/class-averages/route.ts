import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertModuleRead, requireAuthUser } from "@/lib/api/scope";
import { fail, failFrom, ok } from "@/lib/api/envelope";
import { calculateWeightedGradeForClass } from "@/lib/academic/grade-calculator";
import { teacherSubjectScope } from "@/lib/academic/weighted-grade-scope";

export const runtime = "nodejs";

const MAX_CLASSES = 200;
const CONCURRENCY = 4;

// SKAI-1983: the year-end panel needs one average per class, not every student's grades.
// GET /api/grade-config/weighted-result/class-averages?academicYear=&classIds=a,b
// Same gates as /api/grade-config/weighted-result; classes outside the caller's campus are left out.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "exams");
    if (!user.campusId) {
      return fail("BAD_REQUEST", "No campus associated with this account");
    }
    const campusId = user.campusId;

    const { searchParams } = new URL(req.url);
    const academicYear = Number(searchParams.get("academicYear")) || new Date().getFullYear();
    const classIds = [...new Set((searchParams.get("classIds") || "").split(",").map((id) => id.trim()).filter(Boolean))];
    if (!classIds.length) {
      return fail("VALIDATION_FAILED", "classIds is required", { classIds: ["Required"] });
    }
    if (classIds.length > MAX_CLASSES) {
      return fail("VALIDATION_FAILED", `At most ${MAX_CLASSES} classes`, { classIds: ["Too many"] });
    }

    const found = await prisma.class.findMany({
      where: { id: { in: classIds }, campusId },
      select: { id: true, classTeacherId: true, subjects: { select: { id: true, teacherId: true } } },
    });
    // SKAI-2019: a teacher gets averages only for classes they teach, over the subjects they may see (as /api/marks).
    const classes = found.flatMap((c) => {
      if (user.role !== "TEACHER") return [{ id: c.id, subjectIds: null as string[] | null }];
      const scope = teacherSubjectScope(c, user.userId);
      return scope === undefined ? [] : [{ id: c.id, subjectIds: scope }];
    });

    const averages: { classId: string; avg: number | null; gradedCount: number }[] = [];
    for (let i = 0; i < classes.length; i += CONCURRENCY) {
      const batch = classes.slice(i, i + CONCURRENCY);
      averages.push(...(await Promise.all(batch.map(async ({ id, subjectIds }) => {
        const grades = await calculateWeightedGradeForClass(id, campusId, academicYear, subjectIds);
        const avg = grades.length ? grades.reduce((s, g) => s + (g.overallPercentage || 0), 0) / grades.length : null;
        return { classId: id, avg, gradedCount: grades.length };
      }))));
    }

    return ok({ averages }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failFrom(error, "[grade-config/weighted-result/class-averages] GET failed");
  }
}
