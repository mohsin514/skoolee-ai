import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { attendanceSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  assertPermission,
  canMarkAttendance,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { dateOnly, getClassForAttendance, saveAttendanceRegister } from "@/lib/attendance/save-register-command";
import { schoolToday } from "@/lib/datetime";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canMarkAttendance(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    // Default to TODAY IN THE SCHOOL'S TIMEZONE, not UTC. For a UTC+5 tenant the
    // two disagree between 00:00 and 05:00 local, so the old UTC default dated
    // early-morning attendance to the previous day.
    const requestedCampusId = searchParams.get("campusId");
    const campusId = user.role === "SUPER_ADMIN"
      ? await resolveCampusId(user, requestedCampusId)
      : await resolveCampusId(user, user.campusId);
    const dateParam = searchParams.get("date") || (await schoolToday(user.schoolId, campusId));
    const date = dateOnly(dateParam);

    if (classId) {
      await getClassForAttendance(classId, user);
    } else if (user.role === "TEACHER") {
      throw new ApiError("Class is required for teacher attendance", 400);
    }

    const students = await prisma.student.findMany({
      where: {
        campusId,
        campus: { schoolId: user.schoolId },
        ...(classId ? { classId } : {}),
      },
      select: { id: true, fullName: true, rollNo: true, profileImageUrl: true, classId: true, class: { select: { name: true, section: true } } },
      orderBy: [{ class: { name: "asc" } }, { rollNo: "asc" }],
    });

    const studentIds = students.map((student) => student.id);
    const [attendance, recentAbsences] = await Promise.all([
      prisma.attendance.findMany({
        where: { campusId, date, studentId: { in: studentIds } },
        select: { id: true, studentId: true, status: true, date: true, notes: true },
      }),
      prisma.attendance.findMany({
        where: {
          campusId,
          studentId: { in: studentIds },
          status: "ABSENT",
          date: { gte: new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000), lte: date },
        },
        select: { studentId: true },
      }),
    ]);

    const attendanceByStudent = new Map(attendance.map((entry) => [entry.studentId, entry]));
    const absenceCounts = recentAbsences.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.studentId] = (acc[entry.studentId] || 0) + 1;
      return acc;
    }, {});
    const roster = students.map((student) => ({
      ...student,
      attendance: attendanceByStudent.get(student.id) || null,
      absenceWarning: (absenceCounts[student.id] || 0) >= 3,
      recentAbsences: absenceCounts[student.id] || 0,
    }));

    const summary = {
      total: students.length,
      present: attendance.filter((entry) => entry.status === "PRESENT").length,
      absent: attendance.filter((entry) => entry.status === "ABSENT").length,
      leave: attendance.filter((entry) => entry.status === "LEAVE").length,
      unmarked: Math.max(students.length - attendance.length, 0),
      repeatedAbsenceWarnings: roster.filter((student) => student.absenceWarning).length,
    };

    return Response.json({ success: true, date: dateParam, students: roster, summary });
  } catch (error) {
    return errorResponse(error, "[attendance] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canMarkAttendance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "attendance", "add");

    const body = await parseBody(req, jsonObjectBody);
    const parsed = attendanceSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { records, summary, absenceAlerts } = await saveAttendanceRegister(user, parsed.data);

    return Response.json({ success: true, records, summary, absenceAlerts: absenceAlerts.length });
  } catch (error) {
    return errorResponse(error, "[attendance] POST failed");
  }
}
