import { loadCampusLocaleTimeline } from "@/lib/locale/store";
import { errorResponse } from "@/lib/api/scope";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withParentScope } from "@/lib/parent/resolve-child";
import { publishedClassTimetable } from "@/lib/timetable/versions";
import { AccessDenied } from "@/lib/auth/policy";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async ({ studentId, permissions }) => {
    if (!permissions.learningRecords) throw new AccessDenied("timetable");
    const student = await prisma.student.findFirst({ where: { id: studentId! }, select: { classId: true } });
    const classId = student?.classId;
    if (!classId) {
      return Response.json({ success: true, data: null });
    }

    // SKO-403: the published version in force today, never the working draft.
    const published = await publishedClassTimetable(classId);
    if (!published?.version) {
      return Response.json({ success: true, data: null, upcoming: published?.upcoming ?? null });
    }
    const timetable = { class: published.timetable.class, slots: published.slots };

    const localeAt = await loadCampusLocaleTimeline(timetable.class.campusId);
    const weekends = localeAt().weekend.map((day) => day || 7);

    return Response.json({
      success: true,
      data: {
        className: timetable.class.name,
        classSection: timetable.class.section,
        weekends: weekends.sort(),
        version: published.version,
        upcoming: published.upcoming,
        slots: timetable.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          periodNumber: s.periodNumber,
          startTime: s.startTime,
          endTime: s.endTime,
          slotType: s.slotType,
          subject: s.subjectId ? { id: s.subjectId, name: s.subjectName ?? "" } : null,
          teacher: s.teacherId ? { id: s.teacherId, fullName: s.teacherName ?? "" } : null,
          roomNumber: s.roomNumber,
        })),
      },
    });
    });
  } catch (error) {
    return errorResponse(error, "Failed to load timetable");
  }
}
