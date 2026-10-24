import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { studentScope } from "@/lib/auth/policy";
import { requireAuthUser, errorResponse } from "@/lib/api/scope";
import { publishedClassTimetable } from "@/lib/timetable/versions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const classId = req.nextUrl.searchParams.get("classId");

    let resolvedClassId = classId;

    // Families are pinned to their own class: an explicit ?classId= from a
    // student or guardian is ignored, so it can't be swapped for another
    // section's published timetable.
    if (user.role === "STUDENT" || user.role === "PARENT") {
      const student = await prisma.student.findFirst({
        where: user.role === "STUDENT"
          ? { studentUserId: user.userId }
          : studentScope(user, "learningRecords"),
        select: { classId: true },
      });
      resolvedClassId = student?.classId || null;
    }

    if (!resolvedClassId) {
      return Response.json({ error: "No class specified" }, { status: 400 });
    }

    // SKO-403: the published version in force today, never the working draft.
    const published = await publishedClassTimetable(resolvedClassId);
    if (!published?.version) {
      return Response.json({ success: true, data: null, upcoming: published?.upcoming ?? null });
    }

    return Response.json({
      success: true,
      data: {
        classId: published.timetable.classId,
        className: published.timetable.class.name,
        classSection: published.timetable.class.section,
        version: published.version,
        upcoming: published.upcoming,
        slots: published.slots.map((s) => ({
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
  } catch (error) {
    return errorResponse(error, "[timetable/class] GET failed");
  }
}
