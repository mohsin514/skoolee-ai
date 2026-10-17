import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { ruleRate } from "@/lib/attendance";
import { attendanceRuleFor } from "@/lib/attendance/register";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "today";
    const campusId = user.role === "SUPER_ADMIN"
      ? await resolveCampusId(user, searchParams.get("campusId"))
      : await resolveCampusId(user, user.campusId);

    const now = new Date();
    let startDate: Date;
    if (period === "week") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    }

    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const [totalStudents, records, classCounts] = await Promise.all([
      prisma.student.count({ where: { campusId, campus: { schoolId: user.schoolId } } }),
      prisma.attendance.findMany({
        where: { campusId, date: { gte: startDate, lte: endDate } },
        select: { status: true, studentId: true, date: true, student: { select: { classId: true } } },
      }),
      prisma.class.findMany({
        where: { campusId, campus: { schoolId: user.schoolId } },
        select: { id: true, name: true, section: true, _count: { select: { students: true } } },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
    ]);

    const present = records.filter(r => r.status === "PRESENT").length;
    const absent = records.filter(r => r.status === "ABSENT").length;
    const leave = records.filter(r => r.status === "LEAVE").length;

    // Per-class breakdown for today only
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayRecords = records.filter(r => r.date >= todayStart);

    const classBreakdown = classCounts.map(cls => {
      const classRecords = todayRecords.filter(r => r.student.classId === cls.id);
      return {
        classId: cls.id,
        className: [cls.name, cls.section].filter(Boolean).join(" "),
        totalStudents: cls._count.students,
        present: classRecords.filter(r => r.status === "PRESENT").length,
        absent: classRecords.filter(r => r.status === "ABSENT").length,
        leave: classRecords.filter(r => r.status === "LEAVE").length,
        marked: classRecords.length,
        unmarked: cls._count.students - classRecords.length,
      };
    });

    // Unique dates with attendance
    const uniqueDates = new Set(records.map(r => r.date.toISOString().slice(0, 10)));
    // SKO-405: the school's published counting rule.
    const attendanceRate = ruleRate(records, await attendanceRuleFor(user.schoolId));

    return Response.json({
      period,
      totalStudents,
      present, absent, leave,
      totalRecords: records.length,
      attendanceRate,
      daysTracked: uniqueDates.size,
      classBreakdown,
    });
  } catch (error) {
    return errorResponse(error, "[attendance/school-summary] GET failed");
  }
}
