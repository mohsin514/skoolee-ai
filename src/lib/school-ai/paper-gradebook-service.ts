import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { gradeForMark, thresholdsForClass } from "@/lib/academic/report-cards";
import { assertWorkspacePermission, loadWorkspacePermissionSnapshot } from "./access";
import { curriculumDataSchema } from "./assessment";
import { convertGradebookMark, gradebookConversionSchema, type GradebookConversion } from "./exam-gradebook";
import { paperGradebookReceiptSchema, paperGradebookSendSchema, paperOutcomeEvidence, type PaperGradebookBlocker, type PaperGradebookPreview, type PaperGradebookReceipt } from "./paper-gradebook";
import { currentSealedPaper, roster, sealedSlot } from "./paper-sitting-service";
import { PAPER_GRADEBOOK_AUDIT_TABLE, totalScriptMarks } from "./paper-sitting";
import { assertExamOffice } from "./paper-slot-service";
import { canonicalDigest } from "./canonical";
import { schoolAiTransaction } from "./transaction";

async function authorize(user: AuthUser, slotId: string, scheduleId: string, tx: TxClient) {
  const slot = await sealedSlot(user, slotId, tx);
  await assertExamOffice(user, slot.campusId, tx);
  await assertWorkspacePermission(user, "exams", "edit", await loadWorkspacePermissionSnapshot(user, tx));
  const schedule = slot.schedules.find(row => row.id === scheduleId);
  if (!schedule) throw new ApiError("That sitting is not part of this paper.", 404);
  return { slot, schedule };
}

async function readReceipt(user: AuthUser, scheduleId: string, tx: TxClient) {
  const audit = await tx.auditLog.findFirst({ where: { schoolId: user.schoolId, tableName: PAPER_GRADEBOOK_AUDIT_TABLE, recordId: scheduleId }, orderBy: { createdAt: "asc" }, select: { newValue: true } });
  if (!audit) return null;
  return paperGradebookReceiptSchema.parse(audit.newValue);
}

/** Historical evidence stays readable after pupils move or a paper seal becomes unusable. */
async function receiptView(user: AuthUser, campusId: string, receipt: PaperGradebookReceipt, tx: TxClient): Promise<PaperGradebookPreview> {
  const scope = { schoolId: user.schoolId, campusId };
  const [marks, subject] = await Promise.all([
    tx.mark.findMany({ where: { ...scope, examId: receipt.examId, subjectId: receipt.subjectId, id: { in: receipt.rows.map(row => row.markId) } }, select: { id: true, marksObtained: true, isAbsent: true, isExempt: true, grade: true } }),
    tx.subject.findFirst({ where: { ...scope, id: receipt.subjectId }, select: { totalMarks: true } }),
  ]);
  const drift = receipt.rows.flatMap(row => {
    const current = marks.find(mark => mark.id === row.markId);
    return current && current.marksObtained === row.targetMark && current.isAbsent === row.isAbsent && current.grade === row.grade && !current.isExempt && subject?.totalMarks === receipt.targetMaximum ? [] : [{ studentId: row.studentId, fullName: row.fullName, sent: row.targetMark, current: current?.marksObtained ?? null }];
  });
  return { slotId: receipt.slotId, scheduleId: receipt.scheduleId, examId: receipt.examId, examTitle: receipt.examTitle, subjectName: receipt.subjectName, sourceMaximum: receipt.sourceMaximum, targetMaximum: receipt.targetMaximum, conversion: receipt.conversion, previewHash: receipt.previewHash, rows: receipt.rows, blockers: [], outcomes: receipt.outcomes, receipt, drift };
}

async function prepare(user: AuthUser, slotId: string, scheduleId: string, conversion: GradebookConversion, tx: TxClient) {
  const { slot, schedule } = await authorize(user, slotId, scheduleId, tx);
  const paper = await currentSealedPaper(user, tx, slot);
  const scope = { schoolId: user.schoolId, campusId: slot.campusId };
  const [exam, subject, pupils, attendance, scripts, curriculumRecord] = await Promise.all([
    tx.exam.findFirst({ where: { ...scope, id: schedule.exam.id, classId: schedule.exam.classId }, select: { id: true, title: true, classId: true, subjectId: true, academicYear: true, academicModelVersionId: true, status: true, isLocked: true, class: { select: { status: true, archivedAt: true } } } }),
    tx.subject.findFirst({ where: { ...scope, id: schedule.subjectId, classId: schedule.exam.classId }, select: { id: true, name: true, totalMarks: true } }),
    roster(tx, user.schoolId, schedule.exam.classId),
    tx.examAttendance.findMany({ where: { ...scope, scheduleId }, select: { studentId: true, status: true, recordedAt: true, reopenedAt: true }, orderBy: { studentId: "asc" } }),
    tx.examPaperScript.findMany({ where: { ...scope, slotId, scheduleId }, orderBy: { studentId: "asc" } }),
    tx.schoolAiRevision.findFirst({ where: { ...scope, recordId: paper.curriculumId, version: paper.curriculumVersion, status: "APPROVED", record: { kind: "CURRICULUM" } }, select: { data: true } }),
  ]);
  if (!exam || !subject || exam.subjectId && exam.subjectId !== subject.id || !Number.isSafeInteger(subject.totalMarks) || subject.totalMarks <= 0) throw new ApiError("The sitting no longer matches its gradebook class and subject.", 409);
  const targetMaximum = subject.totalMarks;
  const [thresholds, existingMarks, reports] = await Promise.all([
    thresholdsForClass(exam.classId, exam.academicYear, tx, exam.academicModelVersionId),
    tx.mark.findMany({ where: { ...scope, examId: exam.id, subjectId: subject.id }, select: { id: true, studentId: true, marksObtained: true, isAbsent: true, isExempt: true, grade: true, correctionVersion: true }, orderBy: { id: "asc" } }),
    tx.reportCard.count({ where: { ...scope, examId: exam.id } }),
  ]);
  const blockers = new Set<PaperGradebookBlocker>();
  if (!pupils.length) blockers.add("EMPTY_ROSTER");
  if (exam.isLocked || !["ACTIVE", "MARKS_ENTRY"].includes(exam.status) || exam.class.status !== "ACTIVE" || exam.class.archivedAt) blockers.add("TARGET_LOCKED");
  if (existingMarks.length) blockers.add("MARKS_EXIST");
  if (reports) blockers.add("REPORTS_EXIST");
  const attendanceById = new Map(attendance.map(row => [row.studentId, row]));
  const scriptsById = new Map(scripts.map(row => [row.studentId, row]));
  const outcomeScripts: Array<{ marks: Record<string, number> }> = [];
  const rows: PaperGradebookPreview["rows"] = pupils.map(pupil => {
    const present = attendanceById.get(pupil.id)?.status === "PRESENT";
    const isAbsent = attendanceById.get(pupil.id)?.status === "ABSENT";
    const script = scriptsById.get(pupil.id);
    const row = { studentId: pupil.id, fullName: pupil.fullName, rollNo: pupil.rollNo, scriptId: script?.id ?? null, scriptVersion: script?.version ?? null, rawTotal: null as number | null, targetMark: isAbsent ? 0 : null as number | null, isAbsent, grade: null as string | null };
    if (!present && !isAbsent) blockers.add("ATTENDANCE_INCOMPLETE");
    if (!present) return row;
    if (!script?.markedAt || !script.markedById || !script.scannedAt || script.total === null || !script.marks) { blockers.add("MARKS_INCOMPLETE"); return row; }
    try {
      if (script.sealPrefix !== slot.sealHash!.slice(0, 16)) throw new Error("Stale seal");
      const marks = script.marks as Record<string, number>;
      const total = totalScriptMarks(paper, marks);
      if (Math.abs(total - script.total) > 1e-8) throw new Error("Stored total differs");
      row.rawTotal = total;
      row.targetMark = convertGradebookMark(total, paper.blueprint.totalMarks, targetMaximum, conversion);
      if (row.targetMark === null) blockers.add("CONVERSION_REQUIRED");
      else row.grade = gradeForMark(row.targetMark, targetMaximum, thresholds);
      outcomeScripts.push({ marks });
    } catch { blockers.add("INVALID_SCRIPT"); }
    return row;
  });
  const curriculum = curriculumRecord ? curriculumDataSchema.safeParse(curriculumRecord.data) : null;
  const titles = new Map(curriculum?.success ? curriculum.data.outcomes.map(outcome => [outcome.id, outcome.title]) : []);
  const outcomes = paperOutcomeEvidence(paper, outcomeScripts, titles);
  // JSON serialization fixes Date values to ISO text before canonical hashing.
  const previewHash = canonicalDigest(JSON.parse(JSON.stringify({ slotId, scheduleId, slotVersion: slot.version, paperId: slot.paperRecordId, paperVersion: slot.paperVersion, sealHash: slot.sealHash, exam, subject, pupils, attendance, scripts: scripts.map(script => ({ id: script.id, version: script.version, sealPrefix: script.sealPrefix, scannedAt: script.scannedAt, markedAt: script.markedAt, markedById: script.markedById, marks: script.marks, total: script.total })), conversion, thresholds, existingMarks, reports, outcomes })));
  const view: PaperGradebookPreview = { slotId, scheduleId, examId: exam.id, examTitle: exam.title, subjectName: subject.name, sourceMaximum: paper.blueprint.totalMarks, targetMaximum, conversion, previewHash, rows, blockers: [...blockers], outcomes, receipt: null, drift: [] };
  return { view, slot, paper, scripts, thresholds };
}

export async function previewPaperGradebook(user: AuthUser, slotId: string, scheduleId: string, rawConversion: unknown) {
  const conversion = gradebookConversionSchema.parse(rawConversion);
  return schoolAiTransaction(user, async tx => {
    const { slot } = await authorize(user, slotId, scheduleId, tx);
    const receipt = await readReceipt(user, scheduleId, tx);
    if (receipt) {
      if (receipt.slotId !== slotId) throw new ApiError("This sitting already has a transfer receipt from another paper request.", 409);
      return receiptView(user, slot.campusId, receipt, tx);
    }
    return (await prepare(user, slotId, scheduleId, conversion, tx)).view;
  });
}

/** Insert once into the existing gradebook. Publication remains the office's separate locked workflow. */
export async function sendPaperGradebook(user: AuthUser, slotId: string, scheduleId: string, raw: unknown) {
  const input = paperGradebookSendSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { slot, schedule } = await authorize(user, slotId, scheduleId, tx);
    await tx.$queryRaw`SELECT id FROM exam_paper_slots WHERE id = ${slot.id} AND school_id = ${user.schoolId} FOR UPDATE`;
    const receipt = await readReceipt(user, scheduleId, tx);
    if (receipt) {
      if (receipt.slotId !== slotId || receipt.previewHash !== input.previewHash || receipt.conversion !== input.conversion) throw new ApiError("These results were already sent from another preview. Reload the gradebook receipt.", 409, "PAPER_GRADEBOOK_RECEIPT_CONFLICT");
      return { receipt, replayed: true };
    }
    await tx.$queryRaw`SELECT id FROM exams WHERE id = ${schedule.exam.id} AND school_id = ${user.schoolId} AND campus_id = ${slot.campusId} FOR UPDATE`;
    const checked = await prepare(user, slotId, scheduleId, input.conversion, tx);
    if (checked.view.previewHash !== input.previewHash) throw new ApiError("The paper marks or gradebook changed. Review a fresh preview before sending.", 409, "PAPER_GRADEBOOK_STALE_PREVIEW");
    if (checked.view.blockers.length) throw new ApiError("Resolve the preview's blockers before sending paper marks.", 409, "PAPER_GRADEBOOK_BLOCKED");
    const rows = [];
    for (const row of checked.view.rows) {
      const mark = await tx.mark.create({ data: { schoolId: user.schoolId, campusId: slot.campusId, examId: checked.view.examId, subjectId: schedule.subjectId, studentId: row.studentId, marksObtained: row.targetMark!, isAbsent: row.isAbsent, isExempt: false, grade: row.grade, enteredBy: user.userId } });
      rows.push({ ...row, targetMark: mark.marksObtained, markId: mark.id });
      const script = checked.scripts.find(script => script.id === row.scriptId);
      await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: slot.campusId, tableName: "marks", recordId: mark.id, userId: user.userId, oldValue: Prisma.JsonNull, newValue: { source: "sealed_paper_script", slotId, scheduleId, paperId: slot.paperRecordId, paperVersion: slot.paperVersion, sealHash: slot.sealHash, scriptId: row.scriptId, scriptVersion: row.scriptVersion, markedById: script?.markedById ?? null, questionMarks: script?.marks ?? null, rawTotal: row.rawTotal, sourceMaximum: checked.view.sourceMaximum, targetMaximum: checked.view.targetMaximum, conversion: input.conversion, marksObtained: mark.marksObtained, isAbsent: mark.isAbsent, isExempt: false, grade: mark.grade, enteredBy: user.userId } } });
    }
    const saved = paperGradebookReceiptSchema.parse({ id: randomUUID(), slotId, scheduleId, examId: checked.view.examId, examTitle: checked.view.examTitle, subjectId: schedule.subjectId, subjectName: checked.view.subjectName, paperId: slot.paperRecordId, paperVersion: slot.paperVersion, curriculumId: checked.paper.curriculumId, curriculumVersion: checked.paper.curriculumVersion, sealHash: slot.sealHash, sourceMaximum: checked.view.sourceMaximum, targetMaximum: checked.view.targetMaximum, conversion: input.conversion, previewHash: input.previewHash, idempotencyKey: input.idempotencyKey, createdAt: new Date().toISOString(), createdById: user.userId, rows, outcomes: checked.view.outcomes });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: slot.campusId, tableName: PAPER_GRADEBOOK_AUDIT_TABLE, recordId: scheduleId, userId: user.userId, newValue: saved as Prisma.InputJsonValue } });
    await tx.exam.updateMany({ where: { id: checked.view.examId, schoolId: user.schoolId, status: "ACTIVE" }, data: { status: "MARKS_ENTRY", marksEntryAt: new Date() } });
    return { receipt: saved, replayed: false };
  }).catch(error => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new ApiError("The gradebook changed concurrently. Review a fresh preview before sending.", 409, "PAPER_GRADEBOOK_STALE_PREVIEW");
    throw error;
  });
}
