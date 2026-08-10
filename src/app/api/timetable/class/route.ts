import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse } from "@/lib/api/scope";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const classId = req.nextUrl.searchParams.get("classId");

    let resolvedClassId = classId;

    if (!resolvedClassId && (user.role === "STUDENT" || user.role === "PARENT")) {
      const student = await prisma.student.findFirst({
        where: user.role === "STUDENT"
          ? { studentUserId: user.userId }
          : { parentUserId: user.userId },
        select: { classId: true },
      });
      resolvedClassId = student?.classId || null;
    }

    if (!resolvedClassId) {
      return Response.json({ error: "No class specified" }, { status: 400 });
    }

    const timetable = await prisma.timetable.findFirst({
      where: {
        classId: resolvedClassId,
        status: "PUBLISHED",
      },
      include: {
        class: { select: { name: true, section: true } },
        slots: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, fullName: true } },
            room: { select: { id: true, roomNumber: true, capacity: true } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
        },
      },
    });

    if (!timetable) {
      return Response.json({ success: true, data: null });
    }

    return Response.json({
      success: true,
      data: {
        classId: timetable.classId,
        className: timetable.class.name,
        classSection: timetable.class.section,
        slots: timetable.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          periodNumber: s.periodNumber,
          startTime: s.startTime,
          endTime: s.endTime,
          slotType: s.slotType,
          subject: s.subject,
          teacher: s.teacher,
          roomNumber: s.roomNumber,
        })),
      },
    });
  } catch (error) {
    return errorResponse(error, "[timetable/class] GET failed");
  }
}
