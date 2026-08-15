import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertStaffRole, canManageOperations, requireAuthUser, errorResponse, resolveCampusId } from "@/lib/api/scope";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // A staff member's weekly whereabouts. Families get their own class
    // timetable through /api/parent/timetable and the student portal.
    assertStaffRole(user);
    const campusId = await resolveCampusId(user);
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });

    // Reading someone else's schedule is an administrative act: a teacher may
    // only ever ask for their own, whatever the query string says.
    const requested = req.nextUrl.searchParams.get("teacherId");
    if (requested && requested !== user.userId && !canManageOperations(user)) {
      throw new ApiError("Forbidden", 403);
    }
    const teacherId = requested || user.userId;

    const slots = await prisma.timetableSlot.findMany({
      where: {
        timetable: {
          campusId,
          status: "PUBLISHED",
        },
        OR: [
          { teacherId },
          { subject: { teacherId } },
        ],
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
