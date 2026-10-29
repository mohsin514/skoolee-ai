import { validateStoredExamSchedules } from "@/lib/academic/exam-bookings";
import { withSchedulingResourceWrite, resourceScope } from "@/lib/academic/resource-write";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageCampusOps, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import type { Prisma } from "@prisma/client";
import { classPeriodEditDecision, findPeriodOverlap, periodImpactMessage, periodInputProblem, type PeriodTimetableImpact } from "@/lib/academic/period-rules";

// GET /api/academic/periods?campusId=&timeType=CLASS|EXAM — list period definitions
// POST /api/academic/periods {campusId, timeType?, periodNumber, startTime, endTime}
// PATCH /api/academic/periods {id, periodNumber?, startTime?, endTime?, applyToTimetables?}
// DELETE /api/academic/periods?id=
//
// Edge cases: overlapping period times within a timeType are rejected (409);
// SKAI-146: class slots reference periods by number, so renumbering or deleting a
// period in use is refused (409 PERIOD_IN_USE); a time change on a period in use
// needs applyToTimetables=true (else 409 PERIOD_TIMETABLE_CONFIRM) and then moves
// the draft slots to the new times. Published versions stay until republished.

const findOverlap = findPeriodOverlap;

/** Class timetable slots in this campus that sit on the given period number (slots reference periods by number). */
async function classPeriodImpact(tx: Prisma.TransactionClient, schoolId: string, campusId: string, periodNumber: number): Promise<PeriodTimetableImpact> {
  const slots = await tx.timetableSlot.findMany({ where: { schoolId, periodNumber, timetable: { schoolId, campusId } }, select: { timetableId: true, timetable: { select: { status: true } } } });
  const timetables = new Map(slots.map((slot) => [slot.timetableId, slot.timetable.status]));
  return { slots: slots.length, timetables: timetables.size, published: [...timetables.values()].filter((status) => status === "PUBLISHED").length };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const timeType = searchParams.get("timeType") === "EXAM" ? "EXAM" : "CLASS";

    const periods = await prisma.periodDefinition.findMany({
      where: { campusId, timeType },
      orderBy: [{ periodNumber: "asc" }],
    });

    return Response.json({ success: true, data: periods });
  } catch (error) {
    return errorResponse(error, "[academic/periods] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "add");

    const body = await parseBody(req, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    const timeType = String(body.timeType ?? "CLASS").toUpperCase() === "EXAM" ? "EXAM" : "CLASS";
    const periodNumber = parseInt(String(body.periodNumber ?? ""), 10);
    const startTime = String(body.startTime ?? "").trim();
    const endTime = String(body.endTime ?? "").trim();

    const problem = periodInputProblem(periodNumber, startTime, endTime);
    if (problem) throw new ApiError(problem, 400);

    return await withSchedulingResourceWrite(user, campusId, "timetable", "add", async tx => {
      const dup = await tx.periodDefinition.findUnique({
        where: { campusId_timeType_periodNumber: { campusId, timeType, periodNumber } },
      });
      if (dup) throw new ApiError(`Period ${periodNumber} already exists for ${timeType.toLowerCase()}`, 409);

      const rows = await tx.periodDefinition.findMany({ where: { campusId, timeType } });
      const clash = findOverlap(rows, startTime, endTime);
      if (clash) {
        throw new ApiError(
          `Period ${periodNumber} (${startTime}–${endTime}) overlaps Period ${clash.periodNumber} (${clash.startTime}–${clash.endTime})`,
          409
        );
      }

      const period = await tx.periodDefinition.create({
        data: { campusId, timeType, periodNumber, startTime, endTime },
      });

      return Response.json({ success: true, data: period });
    });
  } catch (error) {
    return errorResponse(error, "[academic/periods] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "edit");

    const body = await parseBody(req, jsonObjectBody);
    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);

    const target = await prisma.periodDefinition.findFirst({ where: { id, ...resourceScope(user) }, select: { campusId: true } });
    if (!target) throw new ApiError("Resource not found in your campus", 404);
    return await withSchedulingResourceWrite(user, target.campusId, "timetable", "edit", async tx => {
      const period = await tx.periodDefinition.findFirst({
        where: { id, ...resourceScope(user), campusId: target.campusId },
      });
      if (!period) throw new ApiError("Period not found", 404);

      const timeType = period.timeType;
      const periodNumber = body.periodNumber !== undefined ? parseInt(String(body.periodNumber), 10) : period.periodNumber;
      const startTime = body.startTime !== undefined ? String(body.startTime).trim() : period.startTime;
      const endTime = body.endTime !== undefined ? String(body.endTime).trim() : period.endTime;

      const problem = periodInputProblem(periodNumber, startTime, endTime);
      if (problem) throw new ApiError(problem, 400);

      if (periodNumber !== period.periodNumber) {
        const dup = await tx.periodDefinition.findUnique({
          where: { campusId_timeType_periodNumber: { campusId: period.campusId, timeType, periodNumber } },
        });
        if (dup) throw new ApiError(`Period ${periodNumber} already exists`, 409);
      }

      const rows = await tx.periodDefinition.findMany({
        where: { campusId: period.campusId, timeType },
        select: { id: true, periodNumber: true, startTime: true, endTime: true },
      });
      const clash = findOverlap(rows, startTime, endTime, id);
      if (clash) {
        throw new ApiError(
          `Period ${periodNumber} (${startTime}–${endTime}) overlaps Period ${clash.periodNumber} (${clash.startTime}–${clash.endTime})`,
          409
        );
      }

      const timesShifted = startTime !== period.startTime || endTime !== period.endTime;
      if (period.timeType === "EXAM" && (timesShifted || periodNumber !== period.periodNumber) && await tx.examSchedule.count({ where: { schoolId: user.schoolId, campusId: period.campusId, periodDefinitionId: id, OR: [{ exam: { isLocked: true } }, { exam: { status: { notIn: ["DRAFT", "ACTIVE"] } } }, { exam: { class: { archivedAt: { not: null } } } }] } })) throw new ApiError("This period belongs to an exam whose datesheet is closed. Create a new exam period for future papers to preserve its recorded timing.", 409);
      const impact = period.timeType === "CLASS" ? await classPeriodImpact(tx, user.schoolId, period.campusId, period.periodNumber) : { slots: 0, timetables: 0, published: 0 };
      const decision = classPeriodEditDecision({ impact, renumbered: periodNumber !== period.periodNumber, timesShifted, applyToTimetables: body.applyToTimetables === true });
      if (decision === "blocked-renumber") throw new ApiError(`Period ${period.periodNumber} is used by ${impact.slots} timetable slot(s). Move those lessons first, or add a new period number instead.`, 409, "PERIOD_IN_USE");
      if (decision === "confirm") throw new ApiError(periodImpactMessage(period.periodNumber, impact), 409, "PERIOD_TIMETABLE_CONFIRM");

      const updated = await tx.periodDefinition.update({
        where: { id },
        data: { periodNumber, startTime, endTime },
      });

      if (decision === "apply") {
        const scope = { schoolId: user.schoolId, campusId: period.campusId };
        const affected = await tx.timetableSlot.findMany({ where: { schoolId: user.schoolId, periodNumber, timetable: scope }, select: { timetableId: true } });
        await tx.timetableSlot.updateMany({ where: { schoolId: user.schoolId, periodNumber, timetable: scope }, data: { startTime, endTime } });
        // A draft edit: bump the revision so a published timetable shows unpublished changes until it is republished.
        await tx.timetable.updateMany({ where: { id: { in: [...new Set(affected.map((slot) => slot.timetableId))] }, ...scope }, data: { draftRevision: { increment: 1 } } });
      }

      if (period.timeType === "EXAM" && (timesShifted || periodNumber !== period.periodNumber)) {
        const schedules = await tx.examSchedule.findMany({ where: { schoolId: user.schoolId, campusId: period.campusId, periodDefinitionId: id }, select: { id: true } });
        await validateStoredExamSchedules(tx, { schoolId: user.schoolId, campusId: period.campusId }, schedules.map(item => item.id));
      }

      return Response.json({
        success: true,
        data: updated,
        warning:
          decision === "apply"
            ? `Moved ${impact.slots} timetable slot(s) to ${startTime}–${endTime}.${impact.published ? ` Republish ${impact.published} timetable(s) so families see the new times.` : ""}`
            : undefined,
      });
    });
  } catch (error) {
    return errorResponse(error, "[academic/periods] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "delete");

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const target = await prisma.periodDefinition.findFirst({ where: { id, ...resourceScope(user) }, select: { campusId: true } });
    if (!target) throw new ApiError("Resource not found in your campus", 404);
    return await withSchedulingResourceWrite(user, target.campusId, "timetable", "delete", async tx => {
      const period = await tx.periodDefinition.findFirst({
        where: { id, ...resourceScope(user), campusId: target.campusId },
        select: { id: true, campusId: true, periodNumber: true, timeType: true },
      });
      if (!period) throw new ApiError("Period not found", 404);

      if (period.timeType === "CLASS") {
        const impact = await classPeriodImpact(tx, user.schoolId, period.campusId, period.periodNumber);
        if (impact.slots > 0) throw new ApiError(`Period ${period.periodNumber} is used by ${impact.slots} slot(s) in ${impact.timetables} timetable(s). Clear those lessons first, then remove the period.`, 409, "PERIOD_IN_USE");
      }

      if (await tx.examSchedule.count({ where: { schoolId: user.schoolId, campusId: period.campusId, periodDefinitionId: id } })) throw new ApiError("This period is used by an exam datesheet. Move its papers to another period first.", 409);
      await tx.periodDefinition.delete({ where: { id } });
      return Response.json({ success: true, data: { id } });
    });
  } catch (error) {
    return errorResponse(error, "[academic/periods] DELETE failed");
  }
}
