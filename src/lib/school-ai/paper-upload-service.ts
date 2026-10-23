/**
 * SKO-501 (plan F2b): a teacher's own written paper becomes an ordinary draft PAPER. The uploaded file
 * goes through the existing intake (documentKind "paper"); this reads its text into questions and saves
 * a PAPER with generation UPLOADED, every item in DRAFT review, so review, moderation, rehearsal and the
 * Seal apply unchanged. For a requested paper the syllabus, subject, class, duration and exam type come
 * from the request; otherwise the caller names an approved syllabus.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { SchoolAiError, loadWorkspacePermissionSnapshot } from "./access";
import { curriculumDataSchema } from "./assessment";
import { sourceDataSchema, workspaceIdSchema } from "./schemas";
import { createWorkspaceRecord, getWorkspaceRecordInTransaction } from "./repository";
import { schoolAiTransaction } from "./transaction";
import { paperFromReading, readPaperText } from "./paper-upload";
import { currentCurriculumFor } from "./teaching-progress-service";

export const uploadedPaperInput = z.strictObject({
  slotId: workspaceIdSchema.optional(),
  curriculumId: workspaceIdSchema.optional(),
  title: z.string().trim().min(1).max(180).optional(),
  durationMinutes: z.number().int().min(1).max(480).optional(),
  language: z.enum(["en", "ar", "ur"]).optional(),
});

export async function createUploadedPaper(user: AuthUser, sourceId: string, raw: unknown) {
  const input = uploadedPaperInput.parse(raw ?? {});
  const prepared = await schoolAiTransaction(user, async tx => {
    const permissions = await loadWorkspacePermissionSnapshot(user, tx);
    const source = await getWorkspaceRecordInTransaction(user, sourceId, tx, permissions);
    if (source.kind !== "SOURCE") throw new SchoolAiError("Choose an uploaded paper.", 400, "UPLOAD_NOT_A_SOURCE");
    const data = sourceDataSchema.parse(source.data);
    if (data.documentKind !== "paper") throw new SchoolAiError("This upload is not marked as a question paper.", 422, "UPLOAD_NOT_A_PAPER");
    if (!data.extractedText.trim()) throw new SchoolAiError("The paper has no readable text yet. Check the text first.", 422, "UPLOAD_NO_TEXT");
    let curriculumId = input.curriculumId ?? null, durationMinutes = input.durationMinutes ?? 60, examType: "QUIZ" | "CLASS_TEST" | "MID_TERM" | "FINAL" = "CLASS_TEST", title = input.title ?? source.title;
    if (input.slotId) {
      const slot = await tx.examPaperSlot.findFirst({ where: { id: input.slotId, schoolId: user.schoolId, campusId: source.campusId ?? "" }, select: { authorUserId: true, durationMinutes: true, subjectName: true, examSession: { select: { examType: true, title: true } }, schedules: { select: { exam: { select: { classId: true } } } } } });
      if (!slot || slot.authorUserId !== user.userId) throw new SchoolAiError("Only the paper's author uploads the requested paper.", 403, "UPLOAD_NOT_AUTHOR");
      durationMinutes = input.durationMinutes ?? slot.durationMinutes;
      examType = slot.examSession.examType === "FINAL" ? "FINAL" : "MID_TERM";
      const subject = await tx.subject.findFirst({ where: { schoolId: user.schoolId, teacherId: user.userId, classId: { in: slot.schedules.map(row => row.exam.classId) }, name: { equals: slot.subjectName, mode: "insensitive" } }, select: { id: true, name: true, classId: true, campusId: true, class: { select: { name: true } } } });
      if (!subject) throw new SchoolAiError("You do not teach this subject in the requested grade.", 403, "UPLOAD_SCOPE");
      const current = curriculumId ? null : await currentCurriculumFor(tx, user, subject);
      curriculumId = curriculumId ?? current?.record.id ?? null;
      title = input.title ?? `${slot.examSession.title} · ${subject.name}`;
    }
    if (!curriculumId) throw new SchoolAiError("Approve the syllabus for this class and subject first.", 409, "UPLOAD_NO_SYLLABUS");
    const curriculumRecord = await tx.schoolAiRecord.findFirst({ where: { id: curriculumId, schoolId: user.schoolId, kind: "CURRICULUM", status: "APPROVED" }, select: { id: true, version: true, campusId: true, data: true } });
    if (!curriculumRecord) throw new SchoolAiError("Approve the syllabus for this class and subject first.", 409, "UPLOAD_NO_SYLLABUS");
    const curriculum = curriculumDataSchema.parse(curriculumRecord.data);
    return { source, text: data.extractedText, language: input.language ?? data.sourceLanguage ?? "en", curriculumRecord, curriculum, durationMinutes, examType, title };
  });
  const reading = readPaperText(prepared.text);
  if (!reading.questions.length) throw new SchoolAiError("No numbered questions were found. Number each question (1., 2., …) and try again.", 422, "UPLOAD_NO_QUESTIONS");
  const paper = paperFromReading(reading, {
    curriculumId: prepared.curriculumRecord.id, curriculumVersion: prepared.curriculumRecord.version, subjectId: prepared.curriculum.subjectId, classId: prepared.curriculum.classId,
    // The source's own time keeps the draft deterministic, so a repeated request replays the same record.
    language: prepared.language, title: prepared.title.slice(0, 240), durationMinutes: prepared.durationMinutes, now: new Date(prepared.source.updatedAt).toISOString(),
    ...(input.slotId ? { slotId: input.slotId } : {}), examType: prepared.examType,
  });
  const key = createHash("sha256").update(JSON.stringify([prepared.source.id, prepared.source.version, input.slotId ?? "", prepared.curriculumRecord.id])).digest("hex").slice(0, 64);
  const record = await createWorkspaceRecord(user, { kind: "PAPER", title: prepared.title.slice(0, 180), campusId: prepared.source.campusId, idempotencyKey: `upload-${key}`.slice(0, 128), data: paper as unknown as Record<string, unknown> });
  return { record: { id: record.id, version: record.version }, questions: reading.questions.length, warnings: reading.warnings };
}
