import { writeObservedAttendance } from "@/lib/school-ai/school-operations-register-write";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canMarkAttendance, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canMarkAttendance(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await parseBody(req, jsonObjectBody);
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

    const records = await writeObservedAttendance(user, { campusId, classId, date: toDate, copyFrom: fromDate });

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
