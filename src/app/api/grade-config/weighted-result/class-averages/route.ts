import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertModuleRead, requireAuthUser } from "@/lib/api/scope";
import { fail, failFrom, ok } from "@/lib/api/envelope";
import { calculateWeightedGradeForClass } from "@/lib/academic/grade-calculator";

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

    const classes = await prisma.class.findMany({
      where: { id: { in: classIds }, campusId },
      select: { id: true },
    });

    const averages: { classId: string; avg: number | null; gradedCount: number }[] = [];
    for (let i = 0; i < classes.length; i += CONCURRENCY) {
      const batch = classes.slice(i, i + CONCURRENCY);
      averages.push(...(await Promise.all(batch.map(async ({ id }) => {
        const grades = await calculateWeightedGradeForClass(id, campusId, academicYear);
        const avg = grades.length ? grades.reduce((s, g) => s + (g.overallPercentage || 0), 0) / grades.length : null;
        return { classId: id, avg, gradedCount: grades.length };
      }))));
    }

    return ok({ averages }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failFrom(error, "[grade-config/weighted-result/class-averages] GET failed");
  }
}
