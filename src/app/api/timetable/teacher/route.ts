import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse, resolveCampusId } from "@/lib/api/scope";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user);
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });

    const teacherId = req.nextUrl.searchParams.get("teacherId") || user.userId;

    const slots = await prisma.timetableSlot.findMany({
      where: {
        teacherId,
        timetable: {
          campusId,
          status: "PUBLISHED",
        },
      },
      include: {
        subject: { select: { id: true, name: true } },
        timetable: {
          include: {
            class: { select: { id: true, name: true, section: true } },
          },
        },
      },
      orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
    });

    const schedule = slots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      periodNumber: s.periodNumber,
      startTime: s.startTime,
      endTime: s.endTime,
      slotType: s.slotType,
      subject: s.subject,
      className: s.timetable.class.name,
      classSection: s.timetable.class.section,
      classId: s.timetable.class.id,
      roomNumber: s.roomNumber,
    }));

    return Response.json({ success: true, data: schedule });
  } catch (error) {
    return errorResponse(error, "[timetable/teacher] GET failed");
  }
}
