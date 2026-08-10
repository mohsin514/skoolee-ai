import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// GET /api/academic/periods?campusId=&timeType=CLASS|EXAM — list period definitions
// POST /api/academic/periods {campusId, timeType?, periodNumber, startTime, endTime}
// PATCH /api/academic/periods {id, periodNumber?, startTime?, endTime?}
// DELETE /api/academic/periods?id=
//
// Edge cases: overlapping period times within a timeType are rejected (409);
// PATCH warns (via response field) when a timetable already exists and times
// shift — the caller surfaces the warning rather than silently shifting.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return minutes(aStart) < minutes(bEnd) && minutes(bStart) < minutes(aEnd);
}

function findOverlap(
  rows: { id: string; periodNumber: number; startTime: string; endTime: string }[],
  start: string,
  end: string,
  excludeId?: string
) {
  return rows.find((r) => r.id !== excludeId && overlaps(r.startTime, r.endTime, start, end));
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
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "add");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const timeType = String(body.timeType ?? "CLASS").toUpperCase() === "EXAM" ? "EXAM" : "CLASS";
    const periodNumber = parseInt(String(body.periodNumber ?? ""), 10);
    const startTime = String(body.startTime ?? "").trim();
    const endTime = String(body.endTime ?? "").trim();

    if (!Number.isFinite(periodNumber) || periodNumber < 1) throw new ApiError("periodNumber must be >= 1", 400);
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) throw new ApiError("startTime/endTime must be HH:mm", 400);
    if (minutes(startTime) >= minutes(endTime)) throw new ApiError("endTime must be after startTime", 400);

    const dup = await prisma.periodDefinition.findUnique({
      where: { campusId_timeType_periodNumber: { campusId, timeType, periodNumber } },
    });
    if (dup) throw new ApiError(`Period ${periodNumber} already exists for ${timeType.toLowerCase()}`, 409);

    const rows = await prisma.periodDefinition.findMany({ where: { campusId, timeType } });
    const clash = findOverlap(rows, startTime, endTime);
    if (clash) {
      throw new ApiError(
        `Period ${periodNumber} (${startTime}–${endTime}) overlaps Period ${clash.periodNumber} (${clash.startTime}–${clash.endTime})`,
        409
      );
    }

    const period = await prisma.periodDefinition.create({
      data: { campusId, timeType, periodNumber, startTime, endTime },
    });

    return Response.json({ success: true, data: period });
  } catch (error) {
    return errorResponse(error, "[academic/periods] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "edit");

    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);

    const period = await prisma.periodDefinition.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!period) throw new ApiError("Period not found", 404);

    const timeType = period.timeType;
    const periodNumber = body.periodNumber !== undefined ? parseInt(String(body.periodNumber), 10) : period.periodNumber;
    const startTime = body.startTime !== undefined ? String(body.startTime).trim() : period.startTime;
    const endTime = body.endTime !== undefined ? String(body.endTime).trim() : period.endTime;

    if (!Number.isFinite(periodNumber) || periodNumber < 1) throw new ApiError("periodNumber must be >= 1", 400);
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) throw new ApiError("startTime/endTime must be HH:mm", 400);
    if (minutes(startTime) >= minutes(endTime)) throw new ApiError("endTime must be after startTime", 400);

    if (periodNumber !== period.periodNumber) {
      const dup = await prisma.periodDefinition.findUnique({
        where: { campusId_timeType_periodNumber: { campusId: period.campusId, timeType, periodNumber } },
      });
      if (dup) throw new ApiError(`Period ${periodNumber} already exists`, 409);
    }

    const rows = await prisma.periodDefinition.findMany({
      where: { campusId: period.campusId, timeType },
      select: { id: true, periodNumber: true, startTime: true, endTime: true },
    });
    const clash = findOverlap(rows as any, startTime, endTime, id);
    if (clash) {
      throw new ApiError(
        `Period ${periodNumber} (${startTime}–${endTime}) overlaps Period ${clash.periodNumber} (${clash.startTime}–${clash.endTime})`,
        409
      );
    }

    const timesShifted = startTime !== period.startTime || endTime !== period.endTime;
    const timetableCount = timesShifted
      ? await prisma.timetableSlot.count({ where: { timetable: { campusId: period.campusId }, periodNumber } })
      : 0;

    const updated = await prisma.periodDefinition.update({
      where: { id },
      data: { periodNumber, startTime, endTime },
    });

    return Response.json({
      success: true,
      data: updated,
      warning:
        timetableCount > 0
          ? `This time change affects ${timetableCount} existing timetable slot(s) for period ${periodNumber}. Existing slots were not modified.`
          : undefined,
    });
  } catch (error) {
    return errorResponse(error, "[academic/periods] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "delete");

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const period = await prisma.periodDefinition.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      select: { id: true, campusId: true, periodNumber: true, timeType: true },
    });
    if (!period) throw new ApiError("Period not found", 404);

    const slotCount = await prisma.timetableSlot.count({
      where: { timetable: { campusId: period.campusId }, periodNumber: period.periodNumber },
    });

    await prisma.periodDefinition.delete({ where: { id } });
    return Response.json({ success: true, data: { id }, warning: slotCount > 0 ? `Removed — ${slotCount} timetable slot(s) still reference period ${period.periodNumber}.` : undefined });
  } catch (error) {
    return errorResponse(error, "[academic/periods] DELETE failed");
  }
}
