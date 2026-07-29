import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canMarkAttendance, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canMarkAttendance(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const { classId, fromDate, toDate } = body;
    if (!classId || !fromDate || !toDate) throw new ApiError("classId, fromDate, and toDate are required", 400);

    const campusId = user.role === "SUPER_ADMIN"
      ? await resolveCampusId(user, body.campusId)
      : await resolveCampusId(user, user.campusId);

    // Verify teacher has access to this class
    const cls = await prisma.class.findFirst({
      where: {
        id: classId, campusId, campus: { schoolId: user.schoolId },
        ...(user.role === "TEACHER"
          ? { OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] }
          : {}),
      },
      select: { id: true, campusId: true },
    });
    if (!cls) throw new ApiError("Class not found or not assigned to you", 404);

    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new ApiError("Invalid date format", 400);

    // Get previous day's attendance
    const previousRecords = await prisma.attendance.findMany({
      where: { campusId, classId, date: from },
      select: { studentId: true, status: true },
    });

    if (!previousRecords.length) throw new ApiError("No attendance found for the source date", 404);

    // Upsert for the target date
    const records = await prisma.$transaction(
      previousRecords.map(entry =>
        prisma.attendance.upsert({
          where: { studentId_date: { studentId: entry.studentId, date: to } },
          update: { status: entry.status, markedBy: user.userId, campusId, classId, markedAt: new Date() },
          create: { campusId, classId, studentId: entry.studentId, date: to, status: entry.status, markedBy: user.userId },
        })
      )
    );

    return Response.json({
      success: true,
      classId,
      copiedRecords: records.length,
      fromDate, toDate,
      message: `Attendance copied from ${fromDate} to ${toDate}`,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[attendance/copy-previous] POST failed");
  }
}
