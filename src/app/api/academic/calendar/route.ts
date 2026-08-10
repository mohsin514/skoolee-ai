import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

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
      prisma.weekend.findMany({ where: { campusId }, select: { dayOfWeek: true } }),
      prisma.holiday.findMany({ where: { campusId }, orderBy: { fromDate: "asc" } }),
    ]);

    return Response.json({
      success: true,
      data: {
        weekends: weekends.map((w) => w.dayOfWeek).sort(),
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
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "edit");

    const campusId = await resolveCampusId(user);
    const body = await req.json();
    const days = body.days;
    if (!Array.isArray(days) || days.length === 0 || !days.every((d: number) => DAYS.has(Number(d)))) {
      throw new ApiError("days must be a non-empty array of 1-7 (Mon..Sun)", 400);
    }

    const uniqueDays = [...new Set(days.map((d) => Number(d)))];
    await prisma.$transaction([
      prisma.weekend.deleteMany({ where: { campusId } }),
      prisma.weekend.createMany({
        data: uniqueDays.map((dayOfWeek) => ({ campusId, dayOfWeek })),
      }),
    ]);

    const weekends = await prisma.weekend.findMany({ where: { campusId }, select: { dayOfWeek: true } });
    return Response.json({ success: true, data: { weekends: weekends.map((w) => w.dayOfWeek).sort() } });
  } catch (error) {
    return errorResponse(error, "[academic/calendar] PATCH failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "add");

    const campusId = await resolveCampusId(user);
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const fromDate = String(body.fromDate ?? "");
    const toDate = String(body.toDate ?? "");

    if (!name) throw new ApiError("name is required", 400);
    if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) throw new ApiError("fromDate/toDate must be YYYY-MM-DD", 400);
    if (fromDate > toDate) throw new ApiError("toDate must be on or after fromDate", 400);

    const holiday = await prisma.holiday.create({
      data: {
        campusId,
        name,
        fromDate: new Date(`${fromDate}T00:00:00.000Z`),
        toDate: new Date(`${toDate}T00:00:00.000Z`),
      },
    });

    return Response.json({ success: true, data: holiday }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[academic/calendar] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "delete");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const existing = await prisma.holiday.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Holiday not found", 404);

    await prisma.holiday.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[academic/calendar] DELETE failed");
  }
}
