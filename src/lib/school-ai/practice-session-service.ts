import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { schoolAiTransaction } from "./transaction";
import { paperDataSchema } from "./assessment";
import { practiceSetSchema, type PracticeSet } from "./practice";
import { getWorkspaceRecordInTransaction } from "./repository";
import { assertSchoolAiAccess, assertWorkspacePermission, loadWorkspacePermissionSnapshot } from "./access";
import { GENERIC_HINTS, MAX_HINTS, hintLadder, learnerMayReschedule, needsSupport, nextRevisit, progressLabel, sessionSummary } from "./practice-session";

/**
 * SKO-426 practice sessions. Learners practise only the approved revision of a practice set for
 * their class, built from exams they sat whose results are released. Keys and worked examples stay
 * on the server: an answer is checked against the released source item, and the worked example is
 * shown only after the learner has answered. Nothing here reads or writes a formal grade.
 */

const id = z.string().trim().min(1).max(120);
const day = z.iso.date();
const StartInput = z.object({ practiceRecordId: id }).strict();
const HintInput = z.object({ itemKey: id.max(260) }).strict();
const AnswerInput = z.object({ itemKey: id.max(260), answer: z.string().trim().min(1).max(4000), confidence: z.number().int().min(1).max(3).optional(), explanation: z.string().trim().max(2000).optional() }).strict();
const LearnerRescheduleInput = z.object({ revisitId: id, dueOn: day }).strict();
const TeacherRevisitInput = z.object({ practiceRecordId: id, studentId: id, action: z.enum(["SET", "CANCEL"]), dueOn: day.optional(), reason: z.string().trim().min(8).max(500) }).strict();

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
const keyOf = (item: { sourceAssignmentId: string; questionId: string }) => `${item.sourceAssignmentId}:${item.questionId}`;
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const pushHistory = (history: Prisma.JsonValue, entry: Record<string, unknown>) => [...(Array.isArray(history) ? history : []), { at: new Date().toISOString(), ...entry }] as Prisma.InputJsonValue;

async function learner(tx: TxClient, user: AuthUser) {
  if (user.role !== "STUDENT") throw new ApiError("Only learners practise here.", 403);
  const student = await tx.student.findFirst({ where: { schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null }, select: { id: true, classId: true, campusId: true } });
  if (!student) throw new ApiError("Learner record not found", 404);
  return student;
}

/** The approved revision of a practice set this learner may use, or 404. */
async function approvedSet(tx: TxClient, user: AuthUser, student: { id: string; classId: string; campusId: string }, practiceRecordId: string, revisionId?: string) {
  const revision = await tx.schoolAiRevision.findFirst({
    where: { schoolId: user.schoolId, campusId: student.campusId, recordId: practiceRecordId, status: "APPROVED", ...(revisionId ? { id: revisionId } : {}), record: { kind: "PRACTICE", classId: student.classId, ...(revisionId ? {} : { status: "APPROVED" }) } },
    orderBy: { createdAt: "desc" }, select: { id: true, title: true, data: true },
  });
  if (!revision) throw new ApiError("This practice set is not available for your class.", 404);
  const practice = practiceSetSchema.parse(revision.data);
  const assigned = await tx.schoolAiExamAssignment.count({ where: { id: { in: practice.sourceAssignmentIds }, schoolId: user.schoolId, campusId: student.campusId, studentIds: { array_contains: [student.id] }, resultsReleasedAt: { not: null } } });
  if (!assigned) throw new ApiError("This practice set is not available for your class.", 404);
  return { revisionId: revision.id, title: revision.title, practice };
}

/** The released source question, server-side only (key and model answer never go to the browser unasked). */
async function sourceQuestion(tx: TxClient, user: AuthUser, item: PracticeSet["items"][number]) {
  const assignment = await tx.schoolAiExamAssignment.findFirst({ where: { id: item.sourceAssignmentId, schoolId: user.schoolId, resultsReleasedAt: { not: null } }, select: { paperSnapshot: true } });
  const paper = assignment ? paperDataSchema.safeParse(assignment.paperSnapshot) : null;
  return paper?.success ? paper.data.questions.find((q) => q.id === item.questionId) ?? null : null;
}

function checkAnswer(question: Awaited<ReturnType<typeof sourceQuestion>>, answer: string): boolean | null {
  if (!question) return null;
  if (question.type === "SINGLE_CHOICE") return question.correctOptionId ? answer === question.correctOptionId : null;
  if (question.type === "MULTIPLE_CHOICE") {
    const key = [...(question.correctOptionIds ?? [])].sort();
    try { const given: unknown = JSON.parse(answer); return Array.isArray(given) && key.length > 0 && JSON.stringify([...given].sort()) === JSON.stringify(key); } catch { return false; }
  }
  return null; // Written answers are compared with the worked example by the learner and seen by the teacher.
}

async function sessionFor(tx: TxClient, user: AuthUser, sessionId: string) {
  const student = await learner(tx, user);
  const session = await tx.practiceSession.findFirst({ where: { id: sessionId, schoolId: user.schoolId, studentId: student.id }, include: { responses: true } });
  if (!session) throw new ApiError("Practice session not found", 404);
  const set = await approvedSet(tx, user, student, session.practiceRecordId, session.revisionId);
  return { student, session, set };
}

async function view(tx: TxClient, user: AuthUser, sessionId: string) {
  const { session, set } = await sessionFor(tx, user, sessionId);
  const items = await Promise.all(set.practice.items.map(async (item) => {
    const response = session.responses.find((r) => r.itemKey === keyOf(item));
    const answered = !!response?.answeredAt;
    const question = answered ? await sourceQuestion(tx, user, item) : null;
    return {
      key: keyOf(item), prompt: item.prompt, type: item.type, options: item.options,
      // Generic hints are interface copy the browser translates; teacher hints are shown as written.
      hints: hintLadder(item.hints).slice(0, response?.hintsUsed ?? 0).map((text) => ({ text, generic: (GENERIC_HINTS as readonly string[]).includes(text) })), hintsAvailable: MAX_HINTS - (response?.hintsUsed ?? 0),
      answer: response?.answer ?? null, correct: response?.correct ?? null, assisted: response?.assisted ?? false,
      // Revealed only after an attempt, so practice never starts from the answer.
      workedExample: answered ? question?.modelAnswer ?? null : null,
    };
  }));
  return { id: session.id, title: set.title, status: session.status, expectedMinutes: session.expectedMinutes, version: session.version, practiceRecordId: session.practiceRecordId, items, summary: session.summary };
}

/** Start, or resume the open session (same approved revision, all accepted answers kept). */
export async function startPractice(user: AuthUser, raw: unknown) {
  const input = parse(StartInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const student = await learner(tx, user);
    const open = await tx.practiceSession.findFirst({ where: { schoolId: user.schoolId, studentId: student.id, practiceRecordId: input.practiceRecordId, status: { in: ["ACTIVE", "PAUSED"] } }, orderBy: { startedAt: "desc" } });
    if (open) {
      if (open.status === "PAUSED") await tx.practiceSession.update({ where: { id: open.id }, data: { status: "ACTIVE", pausedAt: null, version: { increment: 1 } } });
      return view(tx, user, open.id);
    }
    const set = await approvedSet(tx, user, student, input.practiceRecordId);
    const due = await tx.practiceRevisit.findFirst({ where: { schoolId: user.schoolId, studentId: student.id, practiceRecordId: input.practiceRecordId, status: "SCHEDULED", dueOn: { lte: today() } }, orderBy: { dueOn: "asc" } });
    const created = await tx.practiceSession.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, practiceRecordId: input.practiceRecordId, revisionId: set.revisionId, revisitId: due?.id ?? null, expectedMinutes: Math.min(20, Math.max(5, set.practice.items.length * 2)) } });
    return view(tx, user, created.id);
  });
}

export async function practiceSession(user: AuthUser, sessionId: string) {
  return schoolAiTransaction(user, (tx) => view(tx, user, sessionId));
}

/** Reveal the next hint for an unanswered item. Any hint makes the eventual answer assisted. */
export async function takeHint(user: AuthUser, sessionId: string, raw: unknown) {
  const input = parse(HintInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const { session, set } = await sessionFor(tx, user, sessionId);
    if (session.status !== "ACTIVE") throw new ApiError("Resume this practice before asking for a hint.", 409);
    if (!set.practice.items.some((item) => keyOf(item) === input.itemKey)) throw new ApiError("That question is not in this practice set.", 404);
    const existing = session.responses.find((r) => r.itemKey === input.itemKey);
    if (existing?.answeredAt) throw new ApiError("This question is already answered; read the worked example instead.", 409);
    if ((existing?.hintsUsed ?? 0) >= MAX_HINTS) throw new ApiError("All hints for this question are showing.", 409);
    await tx.practiceResponse.upsert({ where: { sessionId_itemKey: { sessionId, itemKey: input.itemKey } }, create: { schoolId: user.schoolId, sessionId, itemKey: input.itemKey, hintsUsed: 1, assisted: true }, update: { hintsUsed: { increment: 1 }, assisted: true } });
    return view(tx, user, sessionId);
  });
}

/** Accept one answer per question. The same answer again replays; a different one is refused. */
export async function answerPractice(user: AuthUser, sessionId: string, raw: unknown) {
  const input = parse(AnswerInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const { session, set } = await sessionFor(tx, user, sessionId);
    if (session.status !== "ACTIVE") throw new ApiError("Resume this practice before answering.", 409);
    const item = set.practice.items.find((i) => keyOf(i) === input.itemKey);
    if (!item) throw new ApiError("That question is not in this practice set.", 404);
    const existing = session.responses.find((r) => r.itemKey === input.itemKey);
    if (existing?.answeredAt) {
      if (existing.answer === input.answer) return view(tx, user, sessionId);
      throw new ApiError("This question already has your answer. Try the next one.", 409);
    }
    const correct = checkAnswer(await sourceQuestion(tx, user, item), input.answer);
    const data = { answer: input.answer, correct, confidence: input.confidence ?? null, explanation: input.explanation ?? null, answeredAt: new Date() };
    await tx.practiceResponse.upsert({ where: { sessionId_itemKey: { sessionId, itemKey: input.itemKey } }, create: { schoolId: user.schoolId, sessionId, itemKey: input.itemKey, ...data }, update: data });
    return view(tx, user, sessionId);
  });
}

export async function pausePractice(user: AuthUser, sessionId: string) {
  return schoolAiTransaction(user, async (tx) => {
    const { session } = await sessionFor(tx, user, sessionId);
    if (session.status !== "ACTIVE") throw new ApiError("Only an active practice can be paused.", 409);
    await tx.practiceSession.update({ where: { id: session.id }, data: { status: "PAUSED", pausedAt: new Date(), version: { increment: 1 } } });
    return view(tx, user, sessionId);
  });
}

/** Finish: record the summary (independent and assisted kept apart) and set the next revisit by rule. */
export async function finishPractice(user: AuthUser, sessionId: string) {
  return schoolAiTransaction(user, async (tx) => {
    const { student, session } = await sessionFor(tx, user, sessionId);
    if (session.status === "COMPLETED") return { ...(await view(tx, user, sessionId)), next: null };
    if (!session.responses.some((r) => r.answeredAt)) throw new ApiError("Answer at least one question before finishing.", 409);
    const summary = sessionSummary(session.responses.filter((r) => r.answeredAt).map((r) => ({ correct: r.correct, assisted: r.assisted })));
    const now = new Date();
    const done = await tx.practiceSession.updateMany({ where: { id: session.id, status: { in: ["ACTIVE", "PAUSED"] } }, data: { status: "COMPLETED", completedAt: now, summary, version: { increment: 1 } } });
    if (!done.count) return { ...(await view(tx, user, sessionId)), next: null };
    if (session.revisitId) await tx.practiceRevisit.updateMany({ where: { id: session.revisitId, status: "SCHEDULED" }, data: { status: "DONE" } });
    const completedRevisits = await tx.practiceRevisit.count({ where: { schoolId: user.schoolId, studentId: student.id, practiceRecordId: session.practiceRecordId, status: "DONE", source: "RULE" } });
    const pending = await tx.practiceRevisit.findFirst({ where: { schoolId: user.schoolId, studentId: student.id, practiceRecordId: session.practiceRecordId, status: "SCHEDULED" } });
    let next: { dueOn: string; reason: string } | null = null;
    if (pending) next = { dueOn: pending.dueOn.toISOString().slice(0, 10), reason: pending.reason };
    else {
      const rule = nextRevisit(summary, completedRevisits, now);
      if (rule) {
        await tx.practiceRevisit.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, practiceRecordId: session.practiceRecordId, dueOn: rule.dueOn, originalDueOn: rule.dueOn, reason: rule.reason, source: "RULE", history: [{ at: now.toISOString(), action: "SCHEDULED", by: "RULE", reason: rule.reason }] } });
        next = { dueOn: rule.dueOn.toISOString().slice(0, 10), reason: rule.reason };
      }
    }
    return { ...(await view(tx, user, sessionId)), next };
  });
}

/** The learner's practice: approved sets, open sessions, revisits and evidence-based wording. */
export async function myPractice(user: AuthUser) {
  return schoolAiTransaction(user, async (tx) => {
    const student = await learner(tx, user);
    const approved = await tx.schoolAiRevision.findMany({ where: { schoolId: user.schoolId, campusId: student.campusId, status: "APPROVED", record: { kind: "PRACTICE", classId: student.classId, status: "APPROVED" } }, orderBy: { createdAt: "desc" }, take: 40, select: { recordId: true, title: true } });
    const ids = [...new Set(approved.map((r) => r.recordId))];
    const sets = [];
    for (const recordId of ids) {
      try { await approvedSet(tx, user, student, recordId); } catch { continue; }
      const sessions = await tx.practiceSession.findMany({ where: { schoolId: user.schoolId, studentId: student.id, practiceRecordId: recordId }, orderBy: { startedAt: "asc" } });
      const revisit = await tx.practiceRevisit.findFirst({ where: { schoolId: user.schoolId, studentId: student.id, practiceRecordId: recordId, status: "SCHEDULED" }, orderBy: { dueOn: "asc" } });
      const completed = sessions.filter((s) => s.completedAt && s.summary).map((s) => ({ completedAt: s.completedAt!, summary: s.summary as ReturnType<typeof sessionSummary> }));
      sets.push({ practiceRecordId: recordId, title: approved.find((r) => r.recordId === recordId)!.title, open: sessions.find((s) => s.status !== "COMPLETED")?.status ?? null,
        sessions: completed.length, progress: progressLabel(completed, new Date()),
        revisit: revisit ? { id: revisit.id, dueOn: revisit.dueOn.toISOString().slice(0, 10), originalDueOn: revisit.originalDueOn.toISOString().slice(0, 10), reason: revisit.reason, source: revisit.source } : null });
    }
    return { sets };
  });
}

/** Learners may move a revisit by up to three days; the reason and the original date are kept. */
export async function rescheduleRevisit(user: AuthUser, raw: unknown) {
  const input = parse(LearnerRescheduleInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const student = await learner(tx, user);
    const revisit = await tx.practiceRevisit.findFirst({ where: { id: input.revisitId, schoolId: user.schoolId, studentId: student.id, status: "SCHEDULED" } });
    if (!revisit) throw new ApiError("Revisit not found", 404);
    const requested = new Date(`${input.dueOn}T00:00:00Z`);
    if (!learnerMayReschedule(revisit.originalDueOn, requested, today())) throw new ApiError("You can move a revisit by up to 3 days, and not into the past. Ask your teacher for a bigger change.", 400);
    await tx.practiceRevisit.update({ where: { id: revisit.id }, data: { dueOn: requested, history: pushHistory(revisit.history, { action: "RESCHEDULED", by: "LEARNER", from: revisit.dueOn.toISOString().slice(0, 10), to: input.dueOn }) } });
    return { id: revisit.id, dueOn: input.dueOn };
  });
}

async function staffRecord(tx: TxClient, user: AuthUser, practiceRecordId: string) {
  if (!["TEACHER", "CAMPUS_ADMIN", "PRINCIPAL", "ADMIN", "SUPER_ADMIN"].includes(user.role)) throw new ApiError("Only teaching staff see practice progress.", 403);
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  await assertWorkspacePermission(user, "students", "view", permissions);
  const record = await getWorkspaceRecordInTransaction(user, practiceRecordId, tx, permissions);
  if (record.kind !== "PRACTICE" || !record.campusId) throw new ApiError("Choose a practice set.", 422);
  return { record, practice: practiceSetSchema.parse(record.data) };
}

/** Per learner: independent and assisted results apart, wording from evidence, next revisit, help flag. */
export async function practiceProgress(user: AuthUser, practiceRecordId: string) {
  return schoolAiTransaction(user, async (tx) => {
    const { record, practice } = await staffRecord(tx, user, practiceRecordId);
    const students = await tx.student.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId!, classId: practice.classId, status: "active", archivedAt: null }, select: { id: true, fullName: true, rollNo: true }, orderBy: { rollNo: "asc" }, take: 1000 });
    const sessions = await tx.practiceSession.findMany({ where: { schoolId: user.schoolId, practiceRecordId, studentId: { in: students.map((s) => s.id) } }, orderBy: { startedAt: "asc" } });
    const revisits = await tx.practiceRevisit.findMany({ where: { schoolId: user.schoolId, practiceRecordId, status: "SCHEDULED" } });
    return {
      practiceRecordId, title: record.title,
      learners: students.map((s) => {
        const mine = sessions.filter((x) => x.studentId === s.id);
        const done = mine.filter((x) => x.completedAt && x.summary).map((x) => ({ completedAt: x.completedAt!, summary: x.summary as ReturnType<typeof sessionSummary> }));
        const latest = done.at(-1)?.summary ?? null;
        const revisit = revisits.find((r) => r.studentId === s.id);
        return { studentId: s.id, fullName: s.fullName, rollNo: s.rollNo, sessions: done.length, open: mine.some((x) => x.status !== "COMPLETED"), latest, progress: progressLabel(done, new Date()),
          needsSupport: needsSupport(done.map((d) => d.summary)), revisit: revisit ? { id: revisit.id, dueOn: revisit.dueOn.toISOString().slice(0, 10), reason: revisit.reason, source: revisit.source } : null };
      }),
    };
  });
}

/** Teachers set any revisit date (with a reason) or cancel one; past sessions are never touched. */
export async function teacherRevisit(user: AuthUser, raw: unknown) {
  const input = parse(TeacherRevisitInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const { record, practice } = await staffRecord(tx, user, input.practiceRecordId);
    const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: user.schoolId, campusId: record.campusId!, classId: practice.classId }, select: { id: true } });
    if (!student) throw new ApiError("Choose a learner in this class.", 400);
    const existing = await tx.practiceRevisit.findFirst({ where: { schoolId: user.schoolId, studentId: student.id, practiceRecordId: input.practiceRecordId, status: "SCHEDULED" } });
    if (input.action === "CANCEL") {
      if (!existing) throw new ApiError("There is no revisit to cancel.", 409);
      await tx.practiceRevisit.update({ where: { id: existing.id }, data: { status: "CANCELLED", history: pushHistory(existing.history, { action: "CANCELLED", by: user.userId, reason: input.reason }) } });
      return { cancelled: existing.id };
    }
    if (!input.dueOn) throw new ApiError("Choose a date.", 400);
    const due = new Date(`${input.dueOn}T00:00:00Z`);
    if (existing) {
      await tx.practiceRevisit.update({ where: { id: existing.id }, data: { dueOn: due, originalDueOn: due, reason: input.reason, source: "TEACHER", history: pushHistory(existing.history, { action: "SET", by: user.userId, to: input.dueOn, reason: input.reason }) } });
      return { id: existing.id, dueOn: input.dueOn };
    }
    const created = await tx.practiceRevisit.create({ data: { schoolId: user.schoolId, campusId: record.campusId!, studentId: student.id, practiceRecordId: input.practiceRecordId, dueOn: due, originalDueOn: due, reason: input.reason, source: "TEACHER", history: [{ at: new Date().toISOString(), action: "SET", by: user.userId, reason: input.reason }] } });
    return { id: created.id, dueOn: input.dueOn };
  });
}
