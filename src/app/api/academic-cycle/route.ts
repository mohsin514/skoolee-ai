import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/notifications/in-app";
import {
  ApiError,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  canManageOperations,
} from "@/lib/api/scope";
import { getYearClosureReport, getUnclosedPriorCycles } from "@/lib/academic/year-closure";

/** Only these roles may close a year with outstanding work, and only deliberately. */
function canForceClose(role: string) {
  return role === "SUPER_ADMIN" || role === "PRINCIPAL";
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const sp = req.nextUrl.searchParams;

    if (!user.campusId && user.role !== "SUPER_ADMIN") {
      return Response.json({ success: true, data: [], active: null });
    }

    const campusId = await resolveCampusId(user, sp.get("campusId"));

    const cycles = await prisma.academicCycle.findMany({
      where: { campusId },
      orderBy: { createdAt: "desc" },
    });

    const active = cycles.find((c) => c.status === "ACTIVE") || null;

    return Response.json({ success: true, data: cycles, active });
  } catch (error) {
    return errorResponse(error, "[academic-cycle] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const body = await req.json();
    const { action } = body;

    const campusId = await resolveCampusId(user, body.campusId);

    if (action === "create") {
      const { label, academicYear } = body;
      if (!label || !academicYear) throw new ApiError("label and academicYear required");

      const existing = await prisma.academicCycle.findFirst({
        where: { campusId, status: "ACTIVE" },
      });
      if (existing) throw new ApiError("An active cycle already exists. End or pause it first.");

      // Pausing an unfinished year must not become a back door into the next
      // one — every earlier year has to be properly closed first.
      const unclosed = await getUnclosedPriorCycles(campusId, Number(academicYear));
      if (unclosed.length > 0) {
        throw new ApiError(
          `Close ${unclosed.map((c) => c.label).join(", ")} before starting ${label}. ` +
            "A year can only be closed once marks, report cards and the principal's approval are complete.",
          409,
        );
      }

      const cycle = await prisma.academicCycle.create({
        data: {
          campusId,
          label,
          academicYear: Number(academicYear),
          status: "DRAFT",
        },
      });

      notify("ACADEMIC_CYCLE_CHANGED", {
        schoolId: user.schoolId,
        campusId,
        actorId: user.userId,
        actorName: user.fullName,
        label: cycle.label,
        status: cycle.status,
      });

      return Response.json({ success: true, data: cycle, message: "Cycle created in DRAFT" });
    }

    if (action === "activate") {
      const { cycleId } = body;
      if (!cycleId) throw new ApiError("cycleId required");

      const existing = await prisma.academicCycle.findFirst({
        where: { campusId, status: "ACTIVE" },
      });
      if (existing && existing.id !== cycleId) {
        throw new ApiError("Another cycle is already active. End or pause it first.");
      }

      const target = await prisma.academicCycle.findUnique({ where: { id: cycleId } });
      if (!target) throw new ApiError("Cycle not found", 404);

      const unclosedBefore = await getUnclosedPriorCycles(campusId, target.academicYear);
      if (unclosedBefore.length > 0) {
        throw new ApiError(
          `Close ${unclosedBefore.map((c) => c.label).join(", ")} before activating ${target.label}.`,
          409,
        );
      }

      const cycle = await prisma.academicCycle.update({
        where: { id: cycleId },
        data: {
          status: "ACTIVE",
          startDate: new Date(),
        },
      });

      notify("ACADEMIC_CYCLE_CHANGED", {
        schoolId: user.schoolId,
        campusId,
        actorId: user.userId,
        actorName: user.fullName,
        label: cycle.label,
        status: cycle.status,
      });

      return Response.json({ success: true, data: cycle, message: "Cycle activated" });
    }

    if (action === "pause") {
      const { cycleId } = body;
      if (!cycleId) throw new ApiError("cycleId required");

      const cycle = await prisma.academicCycle.update({
        where: { id: cycleId },
        data: { status: "PAUSED" },
      });

      notify("ACADEMIC_CYCLE_CHANGED", {
        schoolId: user.schoolId,
        campusId,
        actorId: user.userId,
        actorName: user.fullName,
        label: cycle.label,
        status: cycle.status,
      });

      return Response.json({ success: true, data: cycle, message: "Cycle paused" });
    }

    if (action === "resume") {
      const { cycleId } = body;
      if (!cycleId) throw new ApiError("cycleId required");

      const existingActive = await prisma.academicCycle.findFirst({
        where: { campusId, status: "ACTIVE" },
      });
      if (existingActive) throw new ApiError("Another cycle is active. Pause or end it first.");

      const cycle = await prisma.academicCycle.update({
        where: { id: cycleId },
        data: { status: "ACTIVE" },
      });

      notify("ACADEMIC_CYCLE_CHANGED", {
        schoolId: user.schoolId,
        campusId,
        actorId: user.userId,
        actorName: user.fullName,
        label: cycle.label,
        status: cycle.status,
      });

      return Response.json({ success: true, data: cycle, message: "Cycle resumed" });
    }

    if (action === "end") {
      const { cycleId, force } = body;
      if (!cycleId) throw new ApiError("cycleId required");

      const target = await prisma.academicCycle.findUnique({ where: { id: cycleId } });
      if (!target) throw new ApiError("Cycle not found", 404);

      /**
       * Closing is irreversible for the people downstream — report cards become
       * the permanent record and students get promoted out. Refuse until the
       * year is genuinely finished.
       */
      const report = await getYearClosureReport(campusId, target.academicYear);
      if (!report.canClose) {
        if (!force) {
          throw new ApiError(
            `${target.label} is not ready to close. ${report.blockingReasons.join(" ")}`,
            409,
          );
        }
        // A principal may override, but never silently.
        if (!canForceClose(user.role)) {
          throw new ApiError(
            "Only the principal can close a year that still has outstanding work.",
            403,
          );
        }
        // An override is an exception to the rule, so leave a trace of who made
        // it and what was unfinished at the time.
        notify("ACADEMIC_CYCLE_CHANGED", {
          schoolId: user.schoolId,
          campusId,
          actorId: user.userId,
          actorName: user.fullName,
          label: target.label,
          status: "FORCE_CLOSED",
          note: `Closed with outstanding work: ${report.blockingReasons.join(" ")}`,
        });
      }

      const cycle = await prisma.academicCycle.update({
        where: { id: cycleId },
        data: {
          status: "ENDED",
          endDate: new Date(),
        },
      });

      notify("ACADEMIC_CYCLE_CHANGED", {
        schoolId: user.schoolId,
        campusId,
        actorId: user.userId,
        actorName: user.fullName,
        label: cycle.label,
        status: cycle.status,
      });

      return Response.json({ success: true, data: cycle, message: "Cycle ended" });
    }

    throw new ApiError("Invalid action. Use: create, activate, pause, resume, end");
  } catch (error) {
    return errorResponse(error, "[academic-cycle] POST failed");
  }
}
