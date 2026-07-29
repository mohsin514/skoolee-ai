import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse, resolveCampusId, canManageOperations } from "@/lib/api/scope";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });

    const classId = req.nextUrl.searchParams.get("classId");
    const academicYear = req.nextUrl.searchParams.get("academicYear");

    const where: any = { campusId };
    if (classId) where.classId = classId;
    if (academicYear) where.academicYear = parseInt(academicYear);

    const timetables = await prisma.timetable.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, section: true } },
        slots: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, fullName: true } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ success: true, data: timetables });
  } catch (error) {
    return errorResponse(error, "[timetable] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) return Response.json({ error: "Forbidden" }, { status: 403 });

    const campusId = await resolveCampusId(user);
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });

    const body = await req.json();
    const { classId, academicYear, term = "ANNUAL", periods } = body;

    if (!classId || !academicYear) {
      return Response.json({ error: "classId and academicYear required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, campusId },
    });
    if (!cls) return Response.json({ error: "Class not found" }, { status: 404 });

    const existing = await prisma.timetable.findUnique({
      where: { classId_academicYear_term: { classId, academicYear, term } },
    });
    if (existing) {
      return Response.json({ error: "Timetable already exists for this class/year/term" }, { status: 409 });
    }

    const defaultPeriods = periods || [
      { period: 1, start: "08:00", end: "08:40" },
      { period: 2, start: "08:40", end: "09:20" },
      { period: 3, start: "09:20", end: "10:00" },
      { period: 4, start: "10:00", end: "10:20", type: "BREAK" },
      { period: 5, start: "10:20", end: "11:00" },
      { period: 6, start: "11:00", end: "11:40" },
      { period: 7, start: "11:40", end: "12:10", type: "PRAYER" },
      { period: 8, start: "12:10", end: "12:50" },
    ];

    const DAYS = [1, 2, 3, 4, 5, 6]; // Mon-Sat

    const timetable = await prisma.timetable.create({
      data: {
        campusId,
        classId,
        academicYear,
        term,
        slots: {
          create: DAYS.flatMap((day) =>
            defaultPeriods.map((p: any) => ({
              dayOfWeek: day,
              periodNumber: p.period,
              startTime: p.start,
              endTime: p.end,
              slotType: p.type || "CLASS",
            }))
          ),
        },
      },
      include: {
        class: { select: { id: true, name: true, section: true } },
        slots: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, fullName: true } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
        },
      },
    });

    return Response.json({ success: true, data: timetable }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[timetable] POST failed");
  }
}
