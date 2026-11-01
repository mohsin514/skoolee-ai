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

    const studentCount = await prisma.student.count({
      where: { classId, campusId },
    });

    const studentIds = await prisma.student.findMany({
      where: { classId, campusId },
      select: { id: true },
    });
    const ids = studentIds.map((s) => s.id);

    const raw = await prisma.attendance.groupBy({
      by: ["date", "status"],
      where: { campusId, studentId: { in: ids } },
      _count: true,
      orderBy: { date: "desc" },
    });

    const history = bucketHistory(raw)
      .map((entry) => ({
        ...entry,
        unmarked: Math.max(studentCount - entry.total, 0),
        marked: entry.total === studentCount,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60);

    return Response.json({ success: true, history, studentCount });
  } catch (error) {
    return errorResponse(error, "[attendance/history] GET failed");
  }
}
