import { errorResponse } from "@/lib/api/scope";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withParentScope } from "@/lib/parent/resolve-child";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async ({ studentId }) => {
    const student = await prisma.student.findFirst({ where: { id: studentId! }, select: { classId: true } });
    const classId = student?.classId;
    if (!classId) {
      return Response.json({ success: true, data: null });
    }

    const timetable = await prisma.timetable.findFirst({
      where: { classId, status: "PUBLISHED" },
      include: {
        class: { select: { name: true, section: true, campusId: true } },
        slots: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, fullName: true } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
        },
      },
    });

    if (!timetable) {
      return Response.json({ success: true, data: null });
    }

    const weekends = await prisma.weekend.findMany({
      where: { campusId: timetable.class.campusId },
      select: { dayOfWeek: true },
    });

    return Response.json({
      success: true,
      data: {
        className: timetable.class.name,
        classSection: timetable.class.section,
        weekends: weekends.map((w) => w.dayOfWeek).sort(),
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
    });
  } catch (error) {
    return errorResponse(error, "Failed to load timetable");
  }
}
