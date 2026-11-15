import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertStaffRole, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { getYearClosureReport, getUnclosedPriorCycles, pickOpenCycle } from "@/lib/academic/year-closure";

/**
 * GET /api/academic-cycle/closure?campusId=&year=
 *
 * Answers two questions the year-end screens need:
 *  - can the current year be closed, and if not, what is blocking it?
 *  - is anything stopping a new year from being started?
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Administrative year-closure state — staff only.
    assertStaffRole(user);
    const sp = req.nextUrl.searchParams;

    if (!user.campusId && user.role !== "SUPER_ADMIN") {
      return Response.json({ success: true, data: null });
    }

    const campusId = await resolveCampusId(user, sp.get("campusId"));

    const requested = parseInt(sp.get("year") || "", 10);
    const hasRequested = Number.isFinite(requested) && requested > 0;

    // The year being closed is the one that is running (ACTIVE/PAUSED). A DRAFT
    // created by "Prepare next year" must never take precedence over it.
    const openCycles = await prisma.academicCycle.findMany({
      where: { campusId, status: { in: ["ACTIVE", "PAUSED", "DRAFT"] } },
      orderBy: { academicYear: "desc" },
    });
    const activeCycle = pickOpenCycle(openCycles, hasRequested ? requested : null);

    const academicYear = hasRequested
      ? requested
      : activeCycle?.academicYear ?? new Date().getFullYear();

    const report = await getYearClosureReport(campusId, academicYear);

    // What a brand-new year would be blocked by right now.
    const nextYear = academicYear + 1;
    const unclosedPrior = await getUnclosedPriorCycles(campusId, nextYear);

    return Response.json({
      success: true,
      data: {
        ...report,
        openCycle: activeCycle
          ? {
              id: activeCycle.id,
              label: activeCycle.label,
              academicYear: activeCycle.academicYear,
              status: activeCycle.status,
            }
          : null,
        canStartNextYear: unclosedPrior.length === 0,
        blockedBy: unclosedPrior,
      },
    });
  } catch (error) {
    return errorResponse(error, "[academic-cycle/closure] GET failed");
  }
}
