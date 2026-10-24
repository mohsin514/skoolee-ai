import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { examReviewSchema, responsesSchema } from "./exam";
import { scopedAssignment, staffExamAccess } from "./exam-service";
import { familyNoteLanguage, familySentence } from "./family-note";
import { outcomeTitles } from "./improve-service";
import { deriveFeedback } from "./recovery";
import { gradebookPublicationSchema } from "./exam-gradebook";
import { schoolAiTransaction } from "./transaction";

/**
 * SKO-504 Family Note lifecycle. A note is drafted per reviewed result in the language of the learner's
 * first active guardian account, edited by staff, and sent explicitly. Plan §5 rule 9 (family results
 * gating): a sitting that belongs to an exam session sends only once that learner's report card for
 * the session is published, unless the session opts in to sending on release. A classroom sitting has
 * no report card and sends on release. Writing a note is authoring ("add"), as teachers hold no AI edit right.
 */

type Gate = "OPEN" | "WAITING_FOR_REPORT_CARD";
const PUBLISHED_REPORT = ["PUBLISHED", "SENT", "CORRECTED"];
const reviewOf = (value: unknown) => examReviewSchema.parse({ marks: (value as { marks?: unknown })?.marks, note: (value as { note?: unknown })?.note });

async function gates(tx: TxClient, assignment: { schoolId: string; paperSlotId: string | null; gradebookPublication: unknown }, studentIds: readonly string[]) {
  const publication = assignment.gradebookPublication ? gradebookPublicationSchema.safeParse(assignment.gradebookPublication) : null;
  const examId = publication?.success ? publication.data.examId : null;
  const slot = assignment.paperSlotId ? await tx.examPaperSlot.findFirst({ where: { id: assignment.paperSlotId, schoolId: assignment.schoolId }, select: { examSession: { select: { familyNotesOnRelease: true } } } }) : null;
  const exam = examId ? await tx.exam.findFirst({ where: { id: examId, schoolId: assignment.schoolId }, select: { session: { select: { familyNotesOnRelease: true } } } }) : null;
  const result = new Map<string, Gate>();
  if (!assignment.paperSlotId && !examId) { for (const id of studentIds) result.set(id, "OPEN"); return result; }
  if (slot?.examSession.familyNotesOnRelease || exam?.session?.familyNotesOnRelease) { for (const id of studentIds) result.set(id, "OPEN"); return result; }
  const published = examId ? await tx.reportCard.findMany({ where: { schoolId: assignment.schoolId, examId, studentId: { in: [...studentIds] }, OR: [{ publishedVersionId: { not: null } }, { status: { in: PUBLISHED_REPORT } }] }, select: { studentId: true } }) : [];
  const open = new Set(published.map(row => row.studentId));
  for (const id of studentIds) result.set(id, open.has(id) ? "OPEN" : "WAITING_FOR_REPORT_CARD");
  return result;
}

async function guardiansOf(tx: TxClient, schoolId: string, studentIds: readonly string[]) {
  const rows = await tx.guardianRelationship.findMany({ where: { schoolId, studentId: { in: [...studentIds] }, status: "ACTIVE", guardianUserId: { not: null }, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] }, select: { studentId: true, guardian: { select: { preferredLanguage: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const first = new Map<string, string | null>();
  for (const row of rows) if (!first.has(row.studentId)) first.set(row.studentId, row.guardian?.preferredLanguage ?? null);
  return first;
}

async function released(user: AuthUser, assignmentId: string, tx: TxClient, action: "view" | "add") {
  const { assignment, paper } = await scopedAssignment(user, assignmentId, tx);
  await staffExamAccess(user, assignment, action, tx);
  if (!assignment.resultsReleasedAt || assignment.endsAt > new Date()) throw new ApiError("Family notes follow the release of results.", 409);
  return { assignment, paper };
}

async function view(user: AuthUser, assignmentId: string, tx: TxClient) {
  const { assignment } = await released(user, assignmentId, tx, "view");
  const notes = await tx.familyResultNote.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId }, orderBy: { createdAt: "asc" } });
  const studentIds = notes.map(note => note.studentId);
  const [gate, guardians, students] = await Promise.all([gates(tx, assignment, studentIds), guardiansOf(tx, user.schoolId, studentIds), tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: studentIds } }, select: { id: true, fullName: true } })]);
  const names = new Map(students.map(row => [row.id, row.fullName]));
  return notes.map(note => ({ id: note.id, studentId: note.studentId, name: names.get(note.studentId) ?? null, language: note.language, sentence: note.sentence, status: note.status, version: note.version, resultVersion: note.resultVersion, sentAt: note.sentAt, gate: gate.get(note.studentId) ?? "WAITING_FOR_REPORT_CARD", hasGuardian: guardians.has(note.studentId) }));
}

export async function listFamilyNotes(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, tx => view(user, assignmentId, tx));
}

/** Drafts (or refreshes an unsent draft of) one note per reviewed result. A sent note is never rewritten. */
export async function draftFamilyNotes(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper } = await released(user, assignmentId, tx, "add");
    const attempts = await tx.schoolAiExamAttempt.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, status: "REVIEWED" }, select: { id: true, studentId: true, review: true, responses: true, reviewVersion: true } });
    const [titles, guardians, students, existing] = await Promise.all([
      outcomeTitles(tx, user, paper),
      guardiansOf(tx, user.schoolId, attempts.map(row => row.studentId)),
      tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: attempts.map(row => row.studentId) } }, select: { id: true, fullName: true } }),
      tx.familyResultNote.findMany({ where: { schoolId: user.schoolId, assignmentId }, select: { id: true, attemptId: true, status: true, resultVersion: true, language: true } }),
    ]);
    const names = new Map(students.map(row => [row.id, row.fullName]));
    for (const attempt of attempts) {
      if (!attempt.review) continue;
      const language = familyNoteLanguage(guardians.get(attempt.studentId));
      const sentence = familySentence(language, names.get(attempt.studentId) ?? "", assignment.title, deriveFeedback(paper, reviewOf(attempt.review), responsesSchema.parse(attempt.responses), titles));
      const prior = existing.find(row => row.attemptId === attempt.id);
      if (!prior) await tx.familyResultNote.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, attemptId: attempt.id, studentId: attempt.studentId, resultVersion: attempt.reviewVersion, language, sentence, createdById: user.userId } });
      // A corrected result or a changed guardian language refreshes the unsent draft; the teacher's own wording otherwise stays.
      else if (prior.status === "DRAFT" && (prior.resultVersion !== attempt.reviewVersion || prior.language !== language)) await tx.familyResultNote.update({ where: { id: prior.id }, data: { resultVersion: attempt.reviewVersion, language, sentence, version: { increment: 1 } } });
    }
    return view(user, assignmentId, tx);
  });
}

const saveSchema = z.strictObject({ version: z.number().int().positive(), sentence: z.string().trim().min(8).max(400) });
const sendSchema = z.strictObject({ version: z.number().int().positive() });

async function noteFor(user: AuthUser, tx: TxClient, noteId: string, version: number) {
  const note = await tx.familyResultNote.findFirst({ where: { id: noteId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
  if (!note) throw new ApiError("Family note not found.", 404);
  const { assignment } = await released(user, note.assignmentId, tx, "add");
  if (note.version !== version || note.status !== "DRAFT") throw new ApiError("This note changed or was already sent. Reload it.", 409);
  return { note, assignment };
}

export async function saveFamilyNote(user: AuthUser, noteId: string, raw: unknown) {
  const input = saveSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { note } = await noteFor(user, tx, noteId, input.version);
    // One sentence: the family reads a line, not a report.
    if ((input.sentence.match(/[.!?؟۔](\s|$)/g) ?? []).length > 1) throw new ApiError("Keep the family note to one sentence.", 422);
    const updated = await tx.familyResultNote.update({ where: { id: note.id }, data: { sentence: input.sentence, version: { increment: 1 } } });
    return { id: updated.id, version: updated.version, sentence: updated.sentence };
  });
}

export async function sendFamilyNote(user: AuthUser, noteId: string, raw: unknown) {
  const input = sendSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { note, assignment } = await noteFor(user, tx, noteId, input.version);
    const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: note.attemptId, schoolId: user.schoolId, status: "REVIEWED" }, select: { reviewVersion: true } });
    if (!attempt || attempt.reviewVersion !== note.resultVersion) throw new ApiError("The result was corrected after this note was drafted. Draft the notes again.", 409);
    if ((await gates(tx, assignment, [note.studentId])).get(note.studentId) !== "OPEN") throw new ApiError("This note sends after the learner's report card is published.", 409);
    if (!(await guardiansOf(tx, user.schoolId, [note.studentId])).has(note.studentId)) throw new ApiError("This learner has no active guardian account to receive the note.", 409);
    const sent = await tx.familyResultNote.updateMany({ where: { id: note.id, version: input.version, status: "DRAFT" }, data: { status: "SENT", sentById: user.userId, sentAt: new Date(), version: { increment: 1 } } });
    if (sent.count !== 1) throw new ApiError("Another change was saved first.", 409);
    await writeAuditEvent(tx, user, { table: "family_result_notes", recordId: note.id, action: "UPDATE", campusId: note.campusId, before: { status: "DRAFT" }, after: { status: "SENT", assignmentId: note.assignmentId, studentId: note.studentId, resultVersion: note.resultVersion, language: note.language } });
    return { id: note.id, status: "SENT", version: input.version + 1 };
  });
}

/** The family's read: sent notes only, newest first, for one linked child. */
export async function familyNotesForStudent(studentId: string, schoolId: string) {
  const notes = await prisma.familyResultNote.findMany({ where: { schoolId, studentId, status: "SENT" }, orderBy: { sentAt: "desc" }, take: 30, select: { id: true, assignmentId: true, language: true, sentence: true, sentAt: true } });
  const titles = new Map((await prisma.schoolAiExamAssignment.findMany({ where: { schoolId, id: { in: notes.map(note => note.assignmentId) } }, select: { id: true, title: true } })).map(row => [row.id, row.title]));
  return notes.map(note => ({ id: note.id, examTitle: titles.get(note.assignmentId) ?? null, language: note.language, sentence: note.sentence, sentAt: note.sentAt }));
}
