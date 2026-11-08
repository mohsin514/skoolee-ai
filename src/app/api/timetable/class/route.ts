import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { campusScope, studentScope } from "@/lib/auth/policy";
import { ApiError, assertSharedModuleRead, requireAuthUser, errorResponse } from "@/lib/api/scope";
import { publishedClassTimetable } from "@/lib/timetable/versions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "timetable");
    const classId = req.nextUrl.searchParams.get("classId");

    let resolvedClassId = classId;

    // Families are pinned to their own class: an explicit ?classId= from a
    // student or guardian is ignored, so it can't be swapped for another
    // section's published timetable.
    if (user.role === "STUDENT" || user.role === "PARENT") {
      const student = await prisma.student.findFirst({
        where: studentScope(user, "learningRecords"),
        select: { classId: true },
      });
      resolvedClassId = student?.classId || null;
    }

    if (!resolvedClassId) {
      return Response.json({ error: "No class specified" }, { status: 400 });
    }

    // Validate the tenant/campus boundary before looking up any published version.
    // Family class IDs were resolved exclusively through their authorized student relationship.
    const visibleClass = await prisma.class.findFirst({
      where: { id: resolvedClassId, ...campusScope(user) },
      select: { id: true },
    });
    if (!visibleClass) throw new ApiError("Class is not available", 404);

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
