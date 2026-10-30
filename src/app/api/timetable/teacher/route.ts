import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertStaffRole, canManageOperations, requireAuthUser, errorResponse, resolveCampusId } from "@/lib/api/scope";
import { schoolToday } from "@/lib/datetime";
import { slotsOf, versionsFor } from "@/lib/timetable/versions";

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

    // SKO-403: each class's published version in force today, never a working draft.
    const [boards, taught, today] = await Promise.all([
      prisma.timetable.findMany({ where: { campusId, status: "PUBLISHED" }, select: { id: true, class: { select: { id: true, name: true, section: true } } } }),
      prisma.subject.findMany({ where: { campusId, teacherId }, select: { id: true } }),
      schoolToday(user.schoolId, campusId),
    ]);
    const mine = new Set(taught.map((subject) => subject.id));
    const schedule = [];
    for (const board of boards) {
      const { inForce } = await versionsFor(board.id, today);
      for (const s of slotsOf(inForce)) {
        if (s.teacherId !== teacherId && !(s.subjectId && mine.has(s.subjectId))) continue;
        schedule.push({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          periodNumber: s.periodNumber,
          startTime: s.startTime,
          endTime: s.endTime,
          slotType: s.slotType,
          subject: s.subjectId ? { id: s.subjectId, name: s.subjectName ?? "" } : null,
          className: board.class.name,
          classSection: board.class.section,
          classId: board.class.id,
          roomNumber: s.roomNumber,
          version: inForce!.version,
        });
      }
    }
    schedule.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime) || a.periodNumber - b.periodNumber);

    return Response.json({ success: true, data: schedule });
  } catch (error) {
    return errorResponse(error, "[timetable/teacher] GET failed");
  }
}
