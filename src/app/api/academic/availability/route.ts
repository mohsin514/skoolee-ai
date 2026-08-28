import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  getAvailableTeachers,
  getAvailableRooms,
  getAvailableExamRooms,
} from "@/lib/academic/availability";
import {
  ApiError,
  assertModuleRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

// GET /api/academic/availability
//   context=timetable & day=1..6 & period=N [&excludeTimetableId=]
//      → returns teachers + rooms free for that class period
//   context=exam & date=YYYY-MM-DD & periodDefinitionId=ID [&examId=]
//      → returns rooms free for that exam slot
//
// Used by every assignment dropdown so a busy teacher/room can never be picked.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Who is free when, across every teacher and room on campus. A scheduling
    // tool, not something a family has any business reading.
    await assertModuleRead(user, "timetable");
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const context = searchParams.get("context") || "timetable";

    if (context === "exam") {
      const date = searchParams.get("date");
      const periodDefinitionId = searchParams.get("periodDefinitionId");
      const examId = searchParams.get("examId") || undefined;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new ApiError("date (YYYY-MM-DD) is required for exam context", 400);
      }
      const rooms = await getAvailableExamRooms(campusId, date, periodDefinitionId, examId);
      return Response.json({ success: true, data: { rooms, teachers: [] } });
    }

    const day = parseInt(searchParams.get("day") || "", 10);
    const period = parseInt(searchParams.get("period") || "", 10);
    const excludeTimetableId = searchParams.get("excludeTimetableId") || undefined;
    if (!Number.isFinite(day) || day < 1 || day > 7) {
      throw new ApiError("day must be 1-7", 400);
    }
    if (!Number.isFinite(period) || period < 1) {
      throw new ApiError("period must be >= 1", 400);
    }

    const [teachers, rooms] = await Promise.all([
      getAvailableTeachers(campusId, day, period, excludeTimetableId),
      getAvailableRooms(campusId, day, period, excludeTimetableId),
    ]);
    return Response.json({ success: true, data: { teachers, rooms } });
  } catch (error) {
    return errorResponse(error, "[academic/availability] GET failed");
  }
}
