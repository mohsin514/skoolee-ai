import { NextRequest } from "next/server";
import { ok, failFrom } from "@/lib/api/envelope";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageAcademics, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { alertKeyFragment, followUpLane } from "@/lib/attendance/follow-up";

// SKAI-823: unexplained absences from the last `days` days, split by why the family has not answered.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageAcademics(user)) throw new ApiError("Insufficient permissions", 403);
    const { searchParams } = new URL(req.url);
    const days = Number(searchParams.get("days") ?? "7");
    if (!Number.isInteger(days) || days < 1 || days > 31) throw new ApiError("days must be a whole number from 1 to 31", 400);
    const campusId = user.role === "SUPER_ADMIN"
      ? await resolveCampusId(user, searchParams.get("campusId"))
      : await resolveCampusId(user, user.campusId);

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));
    const absences = await prisma.attendance.findMany({
      where: { schoolId: user.schoolId, campusId, status: "ABSENT", date: { gte: since }, explanations: { none: {} } },
      select: { id: true, date: true, studentId: true, student: { select: { fullName: true, rollNo: true } } },
      orderBy: [{ date: "desc" }, { studentId: "asc" }],
      take: 500,
    });
    const alerts = absences.length ? await prisma.parentCommunication.findMany({
      where: { schoolId: user.schoolId, templateKey: "ATTENDANCE_ALERT", studentId: { in: [...new Set(absences.map(row => row.studentId))] }, createdAt: { gte: since } },
      select: { idempotencyKey: true, status: true, channel: true, failedReason: true },
    }) : [];

    const items = absences.map(absence => {
      const fragment = alertKeyFragment(absence.studentId, absence.date);
      const sent = alerts.filter(alert => alert.idempotencyKey?.includes(fragment));
      return {
        attendanceId: absence.id, date: absence.date.toISOString().slice(0, 10), studentId: absence.studentId,
        fullName: absence.student.fullName, rollNo: absence.student.rollNo,
        lane: followUpLane(sent),
        channels: sent.map(alert => ({ channel: alert.channel, status: alert.status, failedReason: alert.failedReason })),
      };
    });
    const count = (lane: string) => items.filter(item => item.lane === lane).length;
    return ok({
      days, truncated: absences.length === 500, items,
      counts: { notSent: count("NOT_SENT"), deliveryFailed: count("DELIVERY_FAILED"), awaitingResponse: count("AWAITING_RESPONSE") },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failFrom(error); }
}
