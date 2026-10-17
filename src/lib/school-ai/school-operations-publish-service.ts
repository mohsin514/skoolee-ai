import type { SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { reviewTimetablePublication } from "@/lib/timetable/manual";
import { recordTimetableVersion } from "@/lib/timetable/versions";
import { schoolToday } from "@/lib/datetime";
import { workspaceRequestHash } from "./repository";
import { SchoolAiError } from "./access";
import { publishTimetablesProposalSchema, type PublishTimetablesPreview } from "./school-operations-publish";
export async function previewTimetablePublication(user: AuthUser, record: SchoolAiRecord & { campusId: string }, tx: TxClient): Promise<PublishTimetablesPreview> {
  const proposal = publishTimetablesProposalSchema.parse((record.data as { proposal: unknown }).proposal), timetables: PublishTimetablesPreview["timetables"] = [], source = [];
  for (const id of proposal.timetableIds) {
    const board = await reviewTimetablePublication(user, record.campusId, id, tx), studentCount = await tx.student.count({ where: { schoolId: user.schoolId, campusId: record.campusId, classId: board.classId } }); source.push(board);
    timetables.push({ id: board.id, className: [board.class.name, board.class.section].filter(Boolean).join(" · "), academicYear: board.academicYear, term: board.term, updatedAt: board.updatedAt.toISOString(), studentCount, slots: board.slots.filter(slot => slot.slotType === "CLASS").map(slot => ({ id: slot.id, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, startTime: slot.startTime, endTime: slot.endTime, subjectName: slot.subject!.name, teacherName: slot.teacher!.fullName, roomNumber: slot.room!.roomNumber, roomCapacity: slot.room!.capacity })) });
  }
  if (timetables.reduce((sum, board) => sum + board.slots.length, 0) > 1000) throw new SchoolAiError("Review at most 1,000 lessons in one publication.", 422, "SCHOOL_OPERATIONS_LIMIT");
  const preview = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, timetables, reason: proposal.reason };
  return { ...preview, previewHash: workspaceRequestHash({ preview, source }) };
}
export async function applyTimetablePublication(user: AuthUser, preview: PublishTimetablesPreview, tx: TxClient) {
  for (const board of preview.timetables) {
    const changed = await tx.timetable.updateMany({ where: { id: board.id, schoolId: user.schoolId, campusId: preview.campusId, status: "DRAFT", updatedAt: new Date(board.updatedAt) }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    if (changed.count !== 1) throw new SchoolAiError("The reviewed timetable changed.", 409, "STALE_EXECUTION_PREVIEW");
    // SKO-403: the reviewed publication is a version in force from today, like a manual publication.
    await recordTimetableVersion(tx, { schoolId: user.schoolId, campusId: preview.campusId, timetableId: board.id, effectiveFrom: await schoolToday(user.schoolId, preview.campusId), publishedById: user.userId, note: preview.reason });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "timetables", recordId: board.id, userId: user.userId, oldValue: { status: "DRAFT" }, newValue: { status: "PUBLISHED", recordId: preview.recordId, version: preview.version, reason: preview.reason } } });
  }
  return { operation: preview.operation, ids: preview.timetables.map(board => board.id), count: preview.timetables.length };
}
