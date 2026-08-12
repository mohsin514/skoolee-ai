import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";

function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const sp = req.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, sp.get("campusId"));
    const date = sp.get("date");
    const month = sp.get("month");
    const rawUserId = sp.get("userId");
    const userId = rawUserId === "self" ? user.userId : rawUserId;

    if (user.role === "TEACHER" && userId && userId !== user.userId) {
      throw new ApiError("Forbidden", 403);
    }

    if (userId) {
      const where: any = { userId, campusId };
      if (date) {
        where.date = parseLocalDate(date);
      } else if (month) {
        const [y, m] = month.split("-").map(Number);
        where.date = {
          gte: new Date(`${y}-${String(m).padStart(2, "0")}-01`),
          lt: new Date(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`),
        };
      }

      const records = await prisma.teacherAttendance.findMany({
        where,
        include: { user: { select: { fullName: true, profileImageUrl: true } } },
        orderBy: { date: "desc" },
      });

      const summary = {
        total: records.length,
        present: records.filter((r) => r.status === "PRESENT").length,
        absent: records.filter((r) => r.status === "ABSENT").length,
        leave: records.filter((r) => r.status === "LEAVE").length,
      };

      return Response.json({ success: true, data: records, summary });
    }

    if (date) {
      const targetDate = parseLocalDate(date);

      const [teachers, attendance] = await Promise.all([
        prisma.user.findMany({
          where: { campusId, role: "TEACHER", isActive: true },
          select: { id: true, fullName: true, email: true, profileImageUrl: true },
          orderBy: { fullName: "asc" },
        }),
        prisma.teacherAttendance.findMany({
          where: { campusId, date: targetDate },
        }),
      ]);

      const attendanceMap = new Map(attendance.map((a) => [a.userId, a]));

      const roster = teachers.map((teacher) => ({
        ...teacher,
        attendance: attendanceMap.get(teacher.id) || null,
        status: attendanceMap.get(teacher.id)?.status || "UNMARKED",
      }));

      const summary = {
        total: teachers.length,
        present: attendance.filter((a) => a.status === "PRESENT").length,
        absent: attendance.filter((a) => a.status === "ABSENT").length,
        leave: attendance.filter((a) => a.status === "LEAVE").length,
        unmarked: teachers.length - attendance.length,
      };

      return Response.json({ success: true, data: roster, summary });
    }

    if (month) {
      const [y, m] = month.split("-").map(Number);
      const startDate = new Date(`${y}-${String(m).padStart(2, "0")}-01`);
      const endDate = new Date(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`);

      const [teachers, records] = await Promise.all([
        prisma.user.findMany({
          where: { campusId, role: "TEACHER", isActive: true },
          select: { id: true, fullName: true, email: true, profileImageUrl: true },
          orderBy: { fullName: "asc" },
        }),
        prisma.teacherAttendance.findMany({
          where: { campusId, date: { gte: startDate, lt: endDate } },
          select: { userId: true, status: true },
        }),
      ]);

      const perTeacher = new Map<string, { present: number; absent: number; leave: number; total: number }>();
      for (const r of records) {
        const entry = perTeacher.get(r.userId) || { present: 0, absent: 0, leave: 0, total: 0 };
        entry.total++;
        if (r.status === "PRESENT") entry.present++;
        else if (r.status === "ABSENT") entry.absent++;
        else if (r.status === "LEAVE") entry.leave++;
        perTeacher.set(r.userId, entry);
      }

      const data = teachers.map((teacher) => {
        const stats = perTeacher.get(teacher.id) || { present: 0, absent: 0, leave: 0, total: 0 };
        return {
          userId: teacher.id,
          fullName: teacher.fullName,
          email: teacher.email,
          profileImageUrl: teacher.profileImageUrl,
          presentDays: stats.present,
          absentDays: stats.absent,
          leaveDays: stats.leave,
          totalDays: stats.total,
        };
      });

      const summary = {
        total: teachers.length,
        present: data.reduce((s, d) => s + d.presentDays, 0),
        absent: data.reduce((s, d) => s + d.absentDays, 0),
        leave: data.reduce((s, d) => s + d.leaveDays, 0),
      };

      return Response.json({ success: true, data, summary });
    }

    throw new ApiError("Provide date or userId parameter", 400);
  } catch (error) {
    return errorResponse(error, "[teacher-attendance] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await req.json();

    if (user.role === "TEACHER") {
      const campusId = user.campusId;
      if (!campusId) throw new ApiError("No campus assigned", 400);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = new Date();
      const checkInTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      const existing = await prisma.teacherAttendance.findUnique({
        where: { userId_date: { userId: user.userId, date: today } },
      });

      if (existing) {
        return Response.json({
          success: true,
          message: "Attendance already marked today",
          data: existing,
          alreadyMarked: true,
        });
      }

      const record = await prisma.teacherAttendance.create({
        data: {
          campusId,
          userId: user.userId,
          date: today,
          status: "PRESENT",
          checkInTime,
          notes: body.notes || null,
        },
      });

      return Response.json({ success: true, data: record, message: "Attendance marked" });
    }

    if (!["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "SUPER_ADMIN"].includes(user.role)) {
      throw new ApiError("Forbidden", 403);
    }

    const { entries, date: dateStr } = body;
    if (!Array.isArray(entries) || !dateStr) {
      throw new ApiError("entries array and date required", 400);
    }

    const campusId = await resolveCampusId(user, body.campusId);
    const targetDate = parseLocalDate(dateStr);

    const results = await prisma.$transaction(
      entries.map((entry: { userId: string; status: "PRESENT" | "ABSENT" | "LEAVE"; notes?: string }) =>
        prisma.teacherAttendance.upsert({
          where: { userId_date: { userId: entry.userId, date: targetDate } },
          create: {
            campusId,
            userId: entry.userId,
            date: targetDate,
            status: entry.status,
            notes: entry.notes || null,
          },
          update: {
            status: entry.status,
            notes: entry.notes || null,
          },
        })
      )
    );

    notify("TEACHER_ATTENDANCE_MARKED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      date: dateStr,
      count: results.length,
    });

    return Response.json({ success: true, data: results, message: `Marked ${results.length} records` });
  } catch (error) {
    return errorResponse(error, "[teacher-attendance] POST failed");
  }
}
