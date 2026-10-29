import { operationDeleteResponse } from "@/lib/destructive/operations";
import { assertHolidayWritable, inspectWeekendChange } from "@/lib/academic/calendar-write";
import { expandRecurring, isoDay, parseHolidayInput } from "@/lib/academic/holiday-rules";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { withSchedulingResourceWrite } from "@/lib/academic/resource-write";
import { getLocalePackage } from "@/lib/locale/store";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageCampusOps, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// GET    /api/academic/calendar?campusId=            → { weekends: number[], holidays: [...] }
// PATCH  /api/academic/calendar { days: [1..7] }     → replace the campus weekend set
// POST   /api/academic/calendar { name, fromDate, toDate, repeatYears?, allCampuses? } → add a holiday
// DELETE /api/academic/calendar?id=<holidayId>       → remove a holiday
//
// Module 13: weekend/holiday awareness — grids grey these out and exam
// scheduling refuses campus weekend days.

const DAYS = new Set([1, 2, 3, 4, 5, 6, 7]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, new URL(req.url).searchParams.get("campusId"));

    const [weekends, holidays] = await Promise.all([
      getLocalePackage(user.schoolId, campusId),
      prisma.holiday.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { fromDate: "asc" } }),
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

    const body = await parseBody(req, jsonObjectBody);
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

    const body = await parseBody(req, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    const input = parseHolidayInput(body);
    if (input.allCampuses && user.role !== "SUPER_ADMIN") throw new ApiError("Only the school owner can add a whole-school holiday.", 403);

    return await withSchedulingResourceWrite(user, campusId, "timetable", "add", async tx => {
      // Whole-school holidays become one row per active campus, all fenced and checked in this transaction.
      const campusIds = input.allCampuses
        ? (await tx.campus.findMany({ where: { schoolId: user.schoolId, archivedAt: null }, select: { id: true }, orderBy: { id: "asc" } })).map(c => c.id)
        : [campusId];
      for (const id of campusIds) if (id !== campusId) await lockTimetableCampus(tx, user.schoolId, id);
      const ranges = expandRecurring(input.range, input.repeatYears), created = [];
      for (const id of campusIds) for (const range of ranges) {
        await assertHolidayWritable(tx, { schoolId: user.schoolId, campusId: id }, range);
        const holiday = await tx.holiday.create({ data: { schoolId: user.schoolId, campusId: id, name: input.name, fromDate: range.start, toDate: range.end } });
        await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: id, userId: user.userId, tableName: "holidays", recordId: holiday.id, newValue: { action: "CREATE", name: holiday.name, fromDate: isoDay(range.start), toDate: isoDay(range.end), allCampuses: input.allCampuses, repeatYears: input.repeatYears } } });
        created.push(holiday);
      }
      return Response.json({ success: true, data: created[0], created: created.length }, { status: 201 });
    });
  } catch (error) {
    return errorResponse(error, "[academic/calendar] POST failed");
  }
}

// PUT /api/academic/calendar { id, name, fromDate, toDate, version } → edit one holiday.
// `version` is "name|fromDate|toDate" as last read; a different stored value is a stale edit (409).
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "edit");

    const body = await parseBody(req, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);
    const input = parseHolidayInput({ ...body, repeatYears: 0, allCampuses: false });

    return await withSchedulingResourceWrite(user, campusId, "timetable", "edit", async tx => {
      const current = await tx.holiday.findFirst({ where: { id, schoolId: user.schoolId, campusId } });
      if (!current) throw new ApiError("Holiday not found", 404);
      const version = `${current.name}|${isoDay(current.fromDate)}|${isoDay(current.toDate)}`;
      if (body.version !== version) throw new ApiError("Someone changed this holiday after you opened it. Reload to see the latest dates.", 409);
      await assertHolidayWritable(tx, { schoolId: user.schoolId, campusId }, input.range, id);
      const holiday = await tx.holiday.update({ where: { id }, data: { name: input.name, fromDate: input.range.start, toDate: input.range.end } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId, userId: user.userId, tableName: "holidays", recordId: id, oldValue: { name: current.name, fromDate: isoDay(current.fromDate), toDate: isoDay(current.toDate) }, newValue: { action: "UPDATE", name: holiday.name, fromDate: isoDay(holiday.fromDate), toDate: isoDay(holiday.toDate) } } });
      return Response.json({ success: true, data: holiday });
    });
  } catch (error) {
    return errorResponse(error, "[academic/calendar] PUT failed");
  }
}

export async function DELETE(req: NextRequest) {
  return operationDeleteResponse(req, "academic/calendar");
}
