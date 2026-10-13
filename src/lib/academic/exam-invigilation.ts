import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { ApiError } from "@/lib/api/scope";
import { workspaceRequestHash } from "@/lib/school-ai/repository";
import { assertExamSchedulingAccess, resolveExamSchedulingCampus, withExamSchedulingWrite } from "./exam-scheduling-write";
import { validateStoredExamSchedules } from "./exam-bookings";

export const invigilationUpdateSchema = z.strictObject({ examRoomId: z.string().min(1).max(128), teacherId: z.string().min(1).max(128).nullable(), expectedHash: z.string().regex(/^[a-f0-9]{64}$/) });
const editableStatuses = ["DRAFT", "ACTIVE", "MARKS_ENTRY"];
const include = {
  invigilation: { include: { teacher: { select: { fullName: true } } } },
  room: { select: { roomNumber: true } },
  examSchedule: { include: {
    subject: { select: { name: true } },
    periodDefinition: { select: { startTime: true, endTime: true } },
    exam: { select: { status: true, isLocked: true, sessionId: true, class: { select: { name: true, section: true, archivedAt: true, status: true } } } },
  } },
} as const;
type DutyRoom = Prisma.ExamRoomGetPayload<{ include: typeof include }>;
function projection(row: DutyRoom) {
  const schedule = row.examSchedule;
  return { examRoomId: row.id, scheduleId: schedule.id, roomNumber: row.room.roomNumber, className: [schedule.exam.class.name, schedule.exam.class.section].filter(Boolean).join(" · "), subjectName: schedule.subject.name, date: schedule.date.toISOString().slice(0, 10), startTime: schedule.periodDefinition?.startTime ?? null, endTime: schedule.periodDefinition?.endTime ?? null, teacherId: row.invigilation?.teacherId ?? null, teacherName: row.invigilation?.teacher.fullName ?? null, editable: !schedule.exam.isLocked && editableStatuses.includes(schedule.exam.status) && !schedule.exam.class.archivedAt && schedule.exam.class.status === "ACTIVE", expectedHash: workspaceRequestHash(JSON.parse(JSON.stringify(row))) };
}
export type ExamInvigilationDuty = ReturnType<typeof projection>;
async function list(db: TxClient, schoolId: string, campusId: string, sessionId: string) {
  if (!await db.examSession.findFirst({ where: { id: sessionId, schoolId, campusId }, select: { id: true } })) throw new ApiError("Exam session not found", 404);
  const [rows, teachers] = await Promise.all([
    db.examRoom.findMany({ where: { schoolId, campusId, examSchedule: { exam: { sessionId } } }, include, orderBy: [{ examSchedule: { date: "asc" } }, { id: "asc" }], take: 1001 }),
    db.user.findMany({ where: { schoolId, campusId, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true, fullName: true }, orderBy: [{ fullName: "asc" }, { id: "asc" }], take: 1001 }),
  ]);
  if (rows.length > 1000 || teachers.length > 1000) throw new ApiError("Choose a smaller exam session.", 409);
  return { duties: rows.map(projection), teachers };
}
const context = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, work);
export async function listExamInvigilation(user: AuthUser, sessionId: string) {
  return context(user, async () => {
    const campusId = await resolveExamSchedulingCampus(user, null, { kind: "session", id: sessionId });
    const flags = await assertExamSchedulingAccess(user, campusId, "view", prisma);
    return { ...await list(prisma, user.schoolId, campusId, sessionId), canEdit: flags.canEdit };
  });
}
export async function updateExamInvigilation(user: AuthUser, raw: z.infer<typeof invigilationUpdateSchema>) {
  const input = invigilationUpdateSchema.parse(raw);
  return context(user, async () => {
    const campusId = await resolveExamSchedulingCampus(user, null, { kind: "examRoom", id: input.examRoomId });
    return withExamSchedulingWrite(user, campusId, "edit", async tx => {
      const row = await tx.examRoom.findFirst({ where: { id: input.examRoomId, schoolId: user.schoolId, campusId }, include });
      if (!row) throw new ApiError("Exam room no longer exists. Reload the duty roster.", 404);
      const current = projection(row);
      if (!current.editable) throw new ApiError("This exam is no longer editable.", 409);
      if (current.expectedHash !== input.expectedHash) throw new ApiError("The duty or datesheet changed. Reload before saving.", 409);
      if (input.teacherId === current.teacherId) return { duty: current };
      if (input.teacherId && !await tx.user.findFirst({ where: { id: input.teacherId, schoolId: user.schoolId, campusId, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true } })) throw new ApiError("The selected invigilator is no longer available.", 409);
      await tx.examInvigilation.deleteMany({ where: { examRoomId: row.id, schoolId: user.schoolId, campusId } });
      if (input.teacherId) await tx.examInvigilation.create({ data: { schoolId: user.schoolId, campusId, examRoomId: row.id, teacherId: input.teacherId, createdById: user.userId } });
      // Clearing releases a reservation even if another duty or old schedule now needs correction.
      if (input.teacherId) await validateStoredExamSchedules(tx, { schoolId: user.schoolId, campusId }, [row.examScheduleId]);
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "exam_invigilations", recordId: row.id, userId: user.userId, oldValue: { teacherId: current.teacherId }, newValue: { teacherId: input.teacherId } } });
      return { duty: projection(await tx.examRoom.findUniqueOrThrow({ where: { id: row.id }, include })) };
    });
  });
}
