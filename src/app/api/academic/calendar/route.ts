import { inspectHolidayRange, inspectWeekendChange } from "@/lib/academic/calendar-write";
import { withSchedulingResourceWrite } from "@/lib/academic/resource-write";
import { getLocalePackage } from "@/lib/locale/store";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageCampusOps, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// GET    /api/academic/calendar?campusId=            → { weekends: number[], holidays: [...] }
// PATCH  /api/academic/calendar { days: [1..7] }     → replace the campus weekend set
// POST   /api/academic/calendar { name, fromDate, toDate } → add a holiday
// DELETE /api/academic/calendar?id=<holidayId>       → remove a holiday
//
// Module 13: weekend/holiday awareness — grids grey these out and exam
// scheduling refuses campus weekend days.

const DAYS = new Set([1, 2, 3, 4, 5, 6, 7]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, new URL(req.url).searchParams.get("campusId"));

    const [weekends, holidays] = await Promise.all([
      getLocalePackage(user.schoolId, campusId),
      prisma.holiday.findMany({ where: { campusId }, orderBy: { fromDate: "asc" } }),
    ]);

    return Response.json({
      success: true,
      data: {
        weekends: weekends.weekend.map((day) => day || 7).sort(),
        weekStartsOn: weekends.weekStartsOn,
        holidays,
      },
    });
  } catch (error) {
    return errorResponse(error, "[academic/calendar] GET failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "edit");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const days = body.days;
    if (!Array.isArray(days) || days.length === 0 || !days.every((d: number) => DAYS.has(Number(d)))) {
      throw new ApiError("days must be a non-empty array of 1-7 (Mon..Sun)", 400);
    }

    return await withSchedulingResourceWrite(user, campusId, "timetable", "edit", async tx => {
      const uniqueDays = [...new Set(days.map((day) => Number(day)))];
      await inspectWeekendChange(tx, { schoolId: user.schoolId, campusId }, uniqueDays);
      await tx.weekend.deleteMany({ where: { campusId } });
      await tx.weekend.createMany({ data: uniqueDays.map(dayOfWeek => ({ schoolId: user.schoolId, campusId, dayOfWeek })) });

      const weekends = await tx.weekend.findMany({ where: { campusId }, select: { dayOfWeek: true } });
      return Response.json({ success: true, data: { weekends: weekends.map((w) => w.dayOfWeek).sort() } });
    });
  } catch (error) {
    return errorResponse(error, "[academic/calendar] PATCH failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "add");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name ?? "").trim();
    const fromDate = String(body.fromDate ?? "");
    const toDate = String(body.toDate ?? "");

    if (!name) throw new ApiError("name is required", 400);
    if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) throw new ApiError("fromDate/toDate must be YYYY-MM-DD", 400);
    if (fromDate > toDate) throw new ApiError("toDate must be on or after fromDate", 400);

    return await withSchedulingResourceWrite(user, campusId, "timetable", "add", async tx => {
      const start = new Date(`${fromDate}T00:00:00Z`), end = new Date(`${toDate}T00:00:00Z`);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.toISOString().slice(0, 10) !== fromDate || end.toISOString().slice(0, 10) !== toDate) throw new ApiError("Choose real calendar dates.", 400);
      await inspectHolidayRange(tx, { schoolId: user.schoolId, campusId }, start, end);
      const holiday = await tx.holiday.create({
        data: {
          campusId,
          name,
          fromDate: new Date(`${fromDate}T00:00:00.000Z`),
          toDate: new Date(`${toDate}T00:00:00.000Z`),
        },
      });

      return Response.json({ success: true, data: holiday }, { status: 201 });
    });
  } catch (error) {
    return errorResponse(error, "[academic/calendar] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "delete");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    return await withSchedulingResourceWrite(user, campusId, "timetable", "delete", async tx => {
      const existing = await tx.holiday.findFirst({ where: { id, campusId } });
      if (!existing) throw new ApiError("Holiday not found", 404);

      await tx.holiday.delete({ where: { id } });
      return Response.json({ success: true });
    });
  } catch (error) {
    return errorResponse(error, "[academic/calendar] DELETE failed");
  }
}
