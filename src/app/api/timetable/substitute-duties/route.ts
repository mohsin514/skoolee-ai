import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { loadWorkspacePermissionSnapshot, assertWorkspacePermission } from "@/lib/school-ai/access";
import { substituteSnapshotSchema } from "@/lib/school-ai/school-operations-bookings";
import { operationDate } from "@/lib/school-ai/school-operations";
import { getLocalePackage } from "@/lib/locale/store";
import { calendarDateIn } from "@/lib/datetime";
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser(); if (!canManageOperations(user) && user.role !== "TEACHER") throw new ApiError("Forbidden", 403);
    await assertWorkspacePermission(user, "timetable", "view", await loadWorkspacePermissionSnapshot(user));
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId")), scope = { schoolId: user.schoolId, campusId };
    const locale = await getLocalePackage(user.schoolId, campusId), date = operationDate.parse(request.nextUrl.searchParams.get("date") || calendarDateIn(locale.timezone)), start = new Date(`${date}T00:00:00Z`), end = new Date(start.getTime() + 31 * 86400000);
    const duties = await prisma.schoolAiSubstituteDuty.findMany({ where: { ...scope, status: "ASSIGNED", date: { gte: start, lt: end }, ...(user.role === "TEACHER" ? { OR: [{ teacherId: user.userId }, { originalTeacherId: user.userId }] } : {}) }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 501 });
    if (duties.length > 500) throw new ApiError("Choose a narrower duty window", 422);
    const [lessons, teachers] = await Promise.all([prisma.timetableSlot.findMany({ where: { schoolId: user.schoolId, id: { in: duties.map(duty => duty.timetableSlotId) }, timetable: { campusId } }, include: { timetable: { include: { class: { select: { name: true, section: true } } } }, subject: { select: { name: true } }, room: { select: { roomNumber: true } } } }), prisma.user.findMany({ where: { ...scope, id: { in: [...new Set(duties.flatMap(duty => [duty.teacherId, duty.originalTeacherId]))] } }, select: { id: true, fullName: true } })]);
    return Response.json({ duties: duties.flatMap(duty => { const lesson = lessons.find(slot => slot.id === duty.timetableSlotId), snapshot = substituteSnapshotSchema.safeParse(duty.lessonSnapshot); if (snapshot.success) return [{ id: duty.id, date: duty.date.toISOString().slice(0, 10), ...snapshot.data, covering: duty.teacherId === user.userId }]; return lesson ? [{ id: duty.id, date: duty.date.toISOString().slice(0, 10), startTime: lesson.startTime, endTime: lesson.endTime, className: [lesson.timetable.class.name, lesson.timetable.class.section].filter(Boolean).join(" · "), subjectName: lesson.subject?.name ?? "", roomNumber: lesson.room?.roomNumber ?? lesson.roomNumber, teacherName: teachers.find(teacher => teacher.id === duty.teacherId)?.fullName ?? "", originalTeacherName: teachers.find(teacher => teacher.id === duty.originalTeacherId)?.fullName ?? "", covering: duty.teacherId === user.userId }] : []; }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Unable to load dated substitute duties"); }
}
