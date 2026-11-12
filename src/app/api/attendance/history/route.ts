import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canMarkAttendance,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { bucketHistory } from "@/lib/attendance/history-buckets";

const HISTORY_DAYS = 60;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canMarkAttendance(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    if (!classId) throw new ApiError("classId is required", 400);

    const campusId = user.role === "SUPER_ADMIN"
      ? await resolveCampusId(user, searchParams.get("campusId"))
      : await resolveCampusId(user, user.campusId);

    const cls = await prisma.class.findFirst({
      where: {
        id: classId,
        campusId,
        campus: { schoolId: user.schoolId },
        ...(user.role === "TEACHER"
          ? {
              OR: [
                { classTeacherId: user.userId },
                { subjects: { some: { teacherId: user.userId } } },
              ],
            }
          : {}),
      },
      select: { id: true },
    });
    if (!cls) throw new ApiError("Class not found or not assigned to you", 404);

    // SKAI-1870: find the 60 most recent marked days first, so the grouped scan stops there instead of
    // reading the class's whole history. The count runs alongside it.
    const [studentCount, recentDays] = await Promise.all([
      prisma.student.count({ where: { classId, campusId } }),
      prisma.attendance.groupBy({ by: ["date"], where: { campusId, classId }, orderBy: { date: "desc" }, take: HISTORY_DAYS }),
    ]);
    const oldestDay = recentDays.at(-1)?.date;

    // SKAI-1620: a row belongs to the class it was taken in (as in the monthly report, SKAI-1407),
    // so a pupil who moved here does not bring their earlier class's marks.
    const raw = oldestDay
      ? await prisma.attendance.groupBy({
          by: ["date", "status"],
          where: { campusId, classId, date: { gte: oldestDay } },
          _count: true,
          orderBy: { date: "desc" },
        })
      : [];

    const history = bucketHistory(raw)
      .map((entry) => ({
        ...entry,
        unmarked: Math.max(studentCount - entry.total, 0),
        marked: entry.total === studentCount,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, HISTORY_DAYS);

    return Response.json({ success: true, history, studentCount });
  } catch (error) {
    return errorResponse(error, "[attendance/history] GET failed");
  }
}
