import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { SchoolAiError, assertSchoolAiAccess, isSchoolAiManager, loadWorkspacePermissionSnapshot, assertWorkspacePermission } from "./access";
import { curriculumDataSchema, type CurriculumData } from "./assessment";
import { schoolAiTransaction } from "./transaction";
import { isoDate, lastTaughtOn, linePosition, lineOrder, moveLine, taughtOutcomeIds, unitOf, type ProgressRow } from "./teaching-progress";

/**
 * SKO-500 (SKO-408 slice 1): the Teaching Line service.
 *
 * Reads and moves a class's taught boundary over its current approved curriculum. The curriculum is
 * never written: progress lives in `teaching_progress`. Sections of one grade share an approved
 * curriculum for the same subject, so a curriculum approved for 7-A is the current one for 7-B when
 * 7-B has none of its own.
 *
 * Who may move the line: the subject teacher of that class, a teacher timetabled for that subject in
 * that class (a co-teacher or substitute), or a manager. Heads of department and managers may read.
 */

const id = z.string().trim().min(1).max(128);
export const moveLineInput = z.strictObject({
  subjectId: id,
  classId: id,
  curriculumId: id,
  curriculumVersion: z.number().int().positive(),
  upToOutcomeId: id.nullable(),
  taughtOn: z.string().regex(isoDate),
  timetableSlotId: id.optional(),
});
export type MoveLineInput = z.infer<typeof moveLineInput>;

export interface TeachingLineView {
  subject: { id: string; name: string; classId: string; className: string };
  curriculum: { id: string; version: number; title: string; sharedFromClassId: string | null } | null;
  units: Array<{ unit: string; outcomes: Array<{ id: string; title: string; page: string; taught: boolean; taughtOn: string | null }> }>;
  linePosition: string | null;
  lastTaughtOn: string | null;
  taughtCount: number;
  totalCount: number;
  canMove: boolean;
}

async function loadSubject(tx: TxClient, user: AuthUser, subjectId: string, classId: string) {
  const subject = await tx.subject.findFirst({
    where: { id: subjectId, classId, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}), class: { status: "ACTIVE" } },
    select: { id: true, name: true, classId: true, campusId: true, teacherId: true, class: { select: { name: true, section: true } } },
  });
  if (!subject) throw new SchoolAiError("This subject and class are not available on your campus.", 404, "TEACHING_LINE_SCOPE");
  return subject;
}

async function mayMove(tx: TxClient, user: AuthUser, subject: { id: string; classId: string; teacherId: string | null }) {
  if (isSchoolAiManager(user)) return true;
  if (user.role !== "TEACHER") return false;
  if (subject.teacherId === user.userId) return true;
  const slot = await tx.timetableSlot.findFirst({ where: { schoolId: user.schoolId, subjectId: subject.id, teacherId: user.userId, timetable: { classId: subject.classId } }, select: { id: true } });
  return Boolean(slot);
}

async function mayRead(tx: TxClient, user: AuthUser, subject: { id: string; classId: string; teacherId: string | null }) {
  if (await mayMove(tx, user, subject)) return true;
  // A head of department reads the coverage of the subject teacher they head.
  if (!subject.teacherId) return false;
  const headed = await tx.departmentMember.findFirst({ where: { schoolId: user.schoolId, userId: subject.teacherId, isPrimary: true, endedAt: null, department: { isActive: true, OR: [{ headId: user.userId }, { members: { some: { userId: user.userId, role: { in: ["HEAD", "DEPUTY_HEAD"] }, endedAt: null } } }] } }, select: { id: true } });
  return Boolean(headed);
}

/** The current approved curriculum for the class's subject, or a sibling section's for the same subject name. */
export async function currentCurriculumFor(tx: TxClient, user: AuthUser, subject: { id: string; name: string; classId: string; campusId: string; class: { name: string } }) {
  const own = await tx.schoolAiRecord.findFirst({ where: { schoolId: user.schoolId, campusId: subject.campusId, kind: "CURRICULUM", status: "APPROVED", subjectId: subject.id, classId: subject.classId }, orderBy: { updatedAt: "desc" }, select: { id: true, version: true, title: true, data: true, classId: true } });
  if (own) return { record: own, sharedFromClassId: null as string | null };
  const siblings = await tx.subject.findMany({ where: { schoolId: user.schoolId, campusId: subject.campusId, name: { equals: subject.name, mode: "insensitive" }, class: { name: subject.class.name, status: "ACTIVE" }, NOT: { id: subject.id } }, select: { id: true, classId: true }, take: 40 });
  if (!siblings.length) return null;
  const shared = await tx.schoolAiRecord.findFirst({ where: { schoolId: user.schoolId, campusId: subject.campusId, kind: "CURRICULUM", status: "APPROVED", OR: siblings.map(row => ({ subjectId: row.id, classId: row.classId })) }, orderBy: { updatedAt: "desc" }, select: { id: true, version: true, title: true, data: true, classId: true } });
  return shared ? { record: shared, sharedFromClassId: shared.classId } : null;
}

const asDate = (value: Date) => value.toISOString().slice(0, 10);

function view(subject: { id: string; name: string; classId: string; class: { name: string; section: string | null } }, current: Awaited<ReturnType<typeof currentCurriculumFor>>, rows: ProgressRow[], canMove: boolean): TeachingLineView {
  const className = [subject.class.name, subject.class.section].filter(Boolean).join(" ");
  if (!current) return { subject: { id: subject.id, name: subject.name, classId: subject.classId, className }, curriculum: null, units: [], linePosition: null, lastTaughtOn: null, taughtCount: 0, totalCount: 0, canMove };
  const curriculum = curriculumDataSchema.parse(current.record.data) as CurriculumData;
  const taught = taughtOutcomeIds(curriculum, rows);
  const dates = new Map(rows.map(row => [row.outcomeId, row.taughtOn]));
  const units: TeachingLineView["units"] = [];
  for (const outcome of lineOrder(curriculum)) {
    const unit = unitOf(outcome);
    let bucket = units.at(-1);
    if (!bucket || bucket.unit !== unit) { bucket = { unit, outcomes: [] }; units.push(bucket); }
    bucket.outcomes.push({ id: outcome.id, title: outcome.title, page: outcome.sourcePage, taught: taught.has(outcome.id), taughtOn: dates.get(outcome.id) ?? null });
  }
  return {
    subject: { id: subject.id, name: subject.name, classId: subject.classId, className },
    curriculum: { id: current.record.id, version: current.record.version, title: current.record.title, sharedFromClassId: current.sharedFromClassId },
    units, linePosition: linePosition(curriculum, rows), lastTaughtOn: lastTaughtOn(rows), taughtCount: taught.size, totalCount: lineOrder(curriculum).length, canMove,
  };
}

async function progressRows(tx: TxClient, user: AuthUser, subject: { id: string; classId: string; campusId: string }, curriculumId: string): Promise<ProgressRow[]> {
  const rows = await tx.teachingProgress.findMany({ where: { schoolId: user.schoolId, campusId: subject.campusId, subjectId: subject.id, classId: subject.classId, curriculumId }, select: { outcomeId: true, taughtOn: true } });
  return rows.map(row => ({ outcomeId: row.outcomeId, taughtOn: asDate(row.taughtOn) }));
}

async function authorize(tx: TxClient, user: AuthUser, action: "view" | "edit") {
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  await assertWorkspacePermission(user, "exams", action, permissions);
}

export async function getTeachingLine(user: AuthUser, input: { subjectId: string; classId: string }): Promise<TeachingLineView> {
  return schoolAiTransaction(user, async tx => {
    await authorize(tx, user, "view");
    const subject = await loadSubject(tx, user, input.subjectId, input.classId);
    if (!(await mayRead(tx, user, subject))) throw new SchoolAiError("This class's teaching progress belongs to its subject teacher and their head of department.", 403, "TEACHING_LINE_FORBIDDEN");
    const current = await currentCurriculumFor(tx, user, subject);
    const rows = current ? await progressRows(tx, user, subject, current.record.id) : [];
    return view(subject, current, rows, await mayMove(tx, user, subject));
  });
}

const normalise = (text: string) => text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export async function moveTeachingLine(user: AuthUser, raw: unknown, today: string): Promise<TeachingLineView & { moved: { written: number; removed: number; flagged: boolean } }> {
  const input = moveLineInput.parse(raw);
  if (input.taughtOn > today) throw new SchoolAiError("A taught date cannot be in the future.", 422, "TEACHING_LINE_FUTURE");
  return schoolAiTransaction(user, async tx => {
    await authorize(tx, user, "edit");
    const subject = await loadSubject(tx, user, input.subjectId, input.classId);
    if (!(await mayMove(tx, user, subject))) throw new SchoolAiError("Only this class's subject teacher, a teacher timetabled for it, or a manager can move its Teaching Line.", 403, "TEACHING_LINE_FORBIDDEN");
    const current = await currentCurriculumFor(tx, user, subject);
    if (!current) throw new SchoolAiError("Add and approve this subject's syllabus before recording what has been taught.", 409, "TEACHING_LINE_NO_CURRICULUM");
    if (current.record.id !== input.curriculumId || current.record.version !== input.curriculumVersion) throw new SchoolAiError("The syllabus changed meanwhile. Reload to see the current one.", 409, "TEACHING_LINE_STALE");
    const curriculum = curriculumDataSchema.parse(current.record.data) as CurriculumData;
    const rows = await progressRows(tx, user, subject, current.record.id);
    let move: ReturnType<typeof moveLine>;
    try { move = moveLine(curriculum, rows, input.upToOutcomeId); }
    catch { throw new SchoolAiError("That outcome is not on this syllabus.", 422, "TEACHING_LINE_UNKNOWN_OUTCOME"); }
    const scope = { schoolId: user.schoolId, campusId: subject.campusId, subjectId: subject.id, classId: subject.classId, curriculumId: current.record.id };
    if (move.write.length) await tx.teachingProgress.createMany({ data: move.write.map(outcomeId => ({ ...scope, curriculumVersion: current.record.version, outcomeId, taughtOn: new Date(`${input.taughtOn}T00:00:00Z`), teacherId: user.userId, timetableSlotId: input.timetableSlotId ?? null })), skipDuplicates: true });
    if (move.remove.length) await tx.teachingProgress.deleteMany({ where: { ...scope, outcomeId: { in: move.remove } } });
    // Keep the office's subject syllabus tracker in step, by exact topic title.
    const titles = new Map(curriculum.outcomes.map(outcome => [outcome.id, normalise(outcome.title)]));
    if (move.write.length || move.remove.length) {
      const topics = await tx.syllabusTopic.findMany({ where: { schoolId: user.schoolId, subjectId: subject.id }, select: { id: true, title: true } });
      const byTitle = new Map(topics.map(topic => [normalise(topic.title), topic.id]));
      const done = move.write.map(id => byTitle.get(titles.get(id) ?? "")).filter((value): value is string => Boolean(value));
      const undone = move.remove.map(id => byTitle.get(titles.get(id) ?? "")).filter((value): value is string => Boolean(value));
      if (done.length) await tx.syllabusTopic.updateMany({ where: { id: { in: done }, schoolId: user.schoolId }, data: { status: "COMPLETED", completedAt: new Date(`${input.taughtOn}T00:00:00Z`) } });
      if (undone.length) await tx.syllabusTopic.updateMany({ where: { id: { in: undone }, schoolId: user.schoolId }, data: { status: "IN_PROGRESS", completedAt: null } });
    }
    await writeAuditEvent(tx, user, { table: "teaching_progress", recordId: `${current.record.id}:${subject.classId}`, action: "UPDATE", campusId: subject.campusId, after: { upToOutcomeId: input.upToOutcomeId, taughtOn: input.taughtOn, recordedOn: today, backdated: input.taughtOn < today, written: move.write.length, removed: move.remove.length, unitsCrossed: move.unitsCrossed, flagged: move.flagged } });
    const nextRows = await progressRows(tx, user, subject, current.record.id);
    return { ...view(subject, current, nextRows, true), moved: { written: move.write.length, removed: move.remove.length, flagged: move.flagged } };
  });
}
