import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { examKeyCorrectionSchema, examReviewSchema, correctedExamPaper, responsesSchema, scoreObjectiveResponses } from "./exam";
import { scopedAssignment, staffExamAccess } from "./exam-service";
import { regradeExamAttempt } from "./exam-results";
import { assertStudioAction } from "./studio-access";
import { schoolAiTransaction } from "./transaction";

// SKO-408 R17: live incidents. During a sitting the frozen paper never changes; an authorized,
// versioned notice reaches exactly its audience and each display is acknowledged per attempt.
// Afterwards a remedy is previewed per candidate and applied only when an approver authorizes that
// exact proposal; every candidate's outcome is recorded, including the ones that could not apply.

const id = z.string().trim().min(1).max(120);
const json = (value: unknown) => value as Prisma.InputJsonValue;
const audienceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("SITTING") }),
  z.strictObject({ kind: z.literal("ATTEMPTS"), attemptIds: z.array(id).min(1).max(500) }),
]);
export const issueClarificationSchema = z.strictObject({ text: z.string().trim().min(1).max(2000), audience: audienceSchema, revisesId: id.optional(), questionId: id.optional() });
export const acknowledgeSchema = z.strictObject({ acknowledge: id });
type Audience = z.infer<typeof audienceSchema>;
const inAudience = (audience: unknown, attemptId: string) => { const parsed = audienceSchema.safeParse(audience); return parsed.success && (parsed.data.kind === "SITTING" || parsed.data.attemptIds.includes(attemptId)); };

/** The newest version of each notice thread; a revised notice is shown as revised, never silently replaced. */
function latest<T extends { id: string; revisesId: string | null }>(rows: T[]) {
  const superseded = new Set(rows.map(row => row.revisesId).filter(Boolean) as string[]);
  return rows.filter(row => !superseded.has(row.id));
}

export async function listClarifications(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper, student } = await scopedAssignment(user, assignmentId, tx);
    const rows = await tx.schoolAiExamClarification.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId }, orderBy: { version: "asc" } });
    const number = (questionId: string | null) => questionId ? paper.questions.findIndex(question => question.id === questionId) + 1 || null : null;
    if (student) {
      const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, studentId: student.id, userId: user.userId }, select: { id: true, pausedAt: true, deadlineAt: true } });
      if (!attempt) return { notices: [], pausedAt: null, deadlineAt: null };
      const mine = latest(rows.filter(row => inAudience(row.audience, attempt.id)));
      const acks = new Set((await tx.schoolAiExamClarificationAck.findMany({ where: { schoolId: user.schoolId, attemptId: attempt.id, clarificationId: { in: mine.map(row => row.id) } }, select: { clarificationId: true } })).map(row => row.clarificationId));
      // SKO-502: the deadline travels with the notice poll, so an extension reaches an idle candidate's clock.
      return { pausedAt: attempt.pausedAt, deadlineAt: attempt.deadlineAt, notices: mine.map(row => ({ id: row.id, version: row.version, revised: !!row.revisesId, text: row.text, question: number(row.questionId), createdAt: row.createdAt, acknowledged: acks.has(row.id) })) };
    }
    await staffExamAccess(user, assignment, "view", tx);
    const attempts = await tx.schoolAiExamAttempt.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId }, select: { id: true, status: true, studentId: true, pausedAt: true, deadlineAt: true } });
    const acks = await tx.schoolAiExamClarificationAck.findMany({ where: { schoolId: user.schoolId, clarificationId: { in: rows.map(row => row.id) } }, select: { clarificationId: true } });
    const people = new Map((await tx.user.findMany({ where: { schoolId: user.schoolId, id: { in: rows.map(row => row.issuedById) } }, select: { id: true, fullName: true } })).map(row => [row.id, row.fullName]));
    const names = new Map((await tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: attempts.map(row => row.studentId) } }, select: { id: true, fullName: true } })).map(row => [row.id, row.fullName]));
    const current = new Set(latest(rows).map(row => row.id));
    return {
      questions: paper.questions.map((question, index) => ({ id: question.id, number: index + 1 })),
      attempts: attempts.map(row => ({ id: row.id, studentId: row.studentId, status: row.status, name: names.get(row.studentId) ?? null, pausedAt: row.pausedAt, deadlineAt: row.deadlineAt })),
      notices: rows.map(row => ({
        id: row.id, version: row.version, revisesId: row.revisesId, current: current.has(row.id), text: row.text, question: number(row.questionId), audience: row.audience as Audience,
        audienceSize: attempts.filter(attempt => inAudience(row.audience, attempt.id)).length, acknowledged: acks.filter(ack => ack.clarificationId === row.id).length,
        issuedBy: people.get(row.issuedById) ?? null, createdAt: row.createdAt,
      })),
    };
  });
}

/** R17.1, R17.4, R17.5, R17.6: a new notice version with its audience; nothing about the paper, keys or timing changes. */
export async function issueClarification(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = issueClarificationSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper, student } = await scopedAssignment(user, assignmentId, tx);
    if (student) throw new ApiError("Only exam staff can issue a notice.", 403);
    // Issuing a notice changes no paper, key, timer or mark, so it needs the exam's "add" right, not "edit".
    await staffExamAccess(user, assignment, "add", tx);
    const live = await tx.schoolAiExamAttempt.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, status: "IN_PROGRESS" }, select: { id: true } });
    if (!live.length) throw new ApiError("No candidate is sitting this exam now. A notice reaches only an attempt in progress.", 409);
    if (input.audience.kind === "ATTEMPTS" && input.audience.attemptIds.some(attemptId => !live.some(row => row.id === attemptId))) throw new ApiError("Choose only candidates whose attempt is in progress.", 422);
    if (input.questionId && !paper.questions.some(question => question.id === input.questionId)) throw new ApiError("That question is not in this exam.", 422);
    if (input.revisesId) {
      const revised = await tx.schoolAiExamClarification.findFirst({ where: { id: input.revisesId, assignmentId, schoolId: user.schoolId } });
      if (!revised) throw new ApiError("The notice being revised is not part of this exam.", 404);
      if (await tx.schoolAiExamClarification.count({ where: { revisesId: input.revisesId, schoolId: user.schoolId } })) throw new ApiError("That notice was already revised. Revise its newest version.", 409);
    }
    const last = await tx.schoolAiExamClarification.findFirst({ where: { assignmentId, schoolId: user.schoolId }, orderBy: { version: "desc" }, select: { version: true } });
    const row = await tx.schoolAiExamClarification.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, version: (last?.version ?? 0) + 1, revisesId: input.revisesId ?? null, questionId: input.questionId ?? null, text: input.text, audience: json(input.audience), issuedById: user.userId } });
    await writeAuditEvent(tx, user, { table: "school_ai_exam_clarifications", recordId: row.id, action: "CREATE", campusId: assignment.campusId, after: { assignmentId, version: row.version, revisesId: row.revisesId, audience: input.audience.kind, audienceSize: input.audience.kind === "SITTING" ? live.length : input.audience.attemptIds.length } });
    return { id: row.id, version: row.version };
  });
}

/** R17.2: the candidate's own acknowledgement, once per notice, only for a notice addressed to them. */
export async function acknowledgeClarification(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = acknowledgeSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { assignment, student } = await scopedAssignment(user, assignmentId, tx);
    if (!student) throw new ApiError("Only the candidate acknowledges a notice.", 403);
    const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, studentId: student.id, userId: user.userId }, select: { id: true } });
    const notice = await tx.schoolAiExamClarification.findFirst({ where: { id: input.acknowledge, assignmentId, schoolId: user.schoolId } });
    if (!attempt || !notice || !inAudience(notice.audience, attempt.id)) throw new ApiError("Notice unavailable.", 404);
    await tx.schoolAiExamClarificationAck.upsert({ where: { clarificationId_attemptId: { clarificationId: notice.id, attemptId: attempt.id } }, create: { schoolId: user.schoolId, campusId: assignment.campusId, clarificationId: notice.id, attemptId: attempt.id }, update: {} });
    return { acknowledged: notice.id };
  });
}

// ─── Remedies (R17.7-R17.12) ────────────────────────────────────────
export const proposeRemedySchema = z.strictObject({
  type: z.enum(["KEY_CORRECTION", "ITEM_NEUTRALIZATION", "RUBRIC_CORRECTION", "REGRADE"]), questionId: id, reason: z.string().trim().min(5).max(2000), notify: z.boolean().default(true),
  correction: examKeyCorrectionSchema.optional(),
  /** RUBRIC_CORRECTION and REGRADE: the moderator's new mark per script for this question; scripts not named keep their mark. */
  marks: z.record(id, z.number().min(0).max(100)).optional(),
  /** RUBRIC_CORRECTION: what changed in the rubric, kept with the remedy as evidence. */
  rubricChange: z.string().trim().min(5).max(2000).optional(),
});
const REMEDY_WORDS = { KEY_CORRECTION: "Key correction", ITEM_NEUTRALIZATION: "Item neutralization", RUBRIC_CORRECTION: "Rubric correction", REGRADE: "Re-marking" } as const;
const REMEDY_FEEDBACK = { KEY_CORRECTION: "Re-marked after the answer key was corrected.", ITEM_NEUTRALIZATION: "Credited in full after the item was neutralized.", RUBRIC_CORRECTION: "Re-marked after the rubric was corrected.", REGRADE: "Re-marked by moderation." } as const;
type PreviewRow = { attemptId: string; name: string | null; resultVersion: number; previous: number; proposed: number; previousTotal: number; proposedTotal: number };

export async function proposeRemedy(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = proposeRemedySchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper, student } = await scopedAssignment(user, assignmentId, tx);
    if (student) throw new ApiError("Only exam staff can propose a remedy.", 403);
    await staffExamAccess(user, assignment, "add", tx); // a proposal changes nothing; applying it needs "edit" and AUTHORIZE_REMEDY
    const question = paper.questions.find(entry => entry.id === input.questionId);
    if (!question) throw new ApiError("That question is not in this exam.", 422);
    if (input.type === "KEY_CORRECTION" && (!input.correction || input.correction.questionId !== input.questionId)) throw new ApiError("Give the corrected key for this question.", 422);
    const manual = input.type === "RUBRIC_CORRECTION" || input.type === "REGRADE";
    if (manual && !input.marks) throw new ApiError("Enter the new mark for each script you re-marked.", 422);
    if (input.type === "RUBRIC_CORRECTION" && !input.rubricChange) throw new ApiError("Describe what changed in the rubric.", 422);
    if (manual && Object.values(input.marks!).some(value => value > question.marks)) throw new ApiError(`A mark cannot exceed the question's ${question.marks} marks.`, 422);
    let corrected = paper;
    if (input.type === "KEY_CORRECTION") { try { corrected = correctedExamPaper(paper, [input.correction!]); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Invalid corrected key.", 422); } }
    const attempts = await tx.schoolAiExamAttempt.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId }, select: { id: true, studentId: true, status: true, responses: true, review: true, reviewVersion: true }, orderBy: { startedAt: "asc" } });
    const names = new Map((await tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: attempts.map(row => row.studentId) } }, select: { id: true, fullName: true } })).map(row => [row.id, row.fullName]));
    const rows: PreviewRow[] = [];
    for (const attempt of attempts.filter(row => row.status === "REVIEWED" && row.review)) {
      const stored = attempt.review as { marks: unknown; note: unknown };
      const review = examReviewSchema.parse({ marks: stored.marks, note: stored.note });
      const previous = review.marks.find(mark => mark.questionId === question.id)?.marks ?? 0;
      // Neutralization credits every candidate with the item's full marks, so nobody is disadvantaged by a faulty item.
      const proposed = input.type === "ITEM_NEUTRALIZATION" ? question.marks : manual ? input.marks![attempt.id] ?? previous : scoreObjectiveResponses(corrected, responsesSchema.parse(attempt.responses)).questions.find(row => row.questionId === question.id)?.marks ?? 0;
      const previousTotal = review.marks.reduce((sum, mark) => sum + mark.marks, 0);
      rows.push({ attemptId: attempt.id, name: names.get(attempt.studentId) ?? null, resultVersion: attempt.reviewVersion, previous, proposed, previousTotal, proposedTotal: previousTotal - previous + proposed });
    }
    const pending = attempts.filter(row => row.status !== "REVIEWED").length;
    if (manual && Object.keys(input.marks!).some(attemptId => !rows.some(row => row.attemptId === attemptId))) throw new ApiError("Re-mark only moderated scripts of this exam.", 422);
    const remedy = await tx.schoolAiExamRemedy.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, type: input.type, questionId: question.id, reason: input.reason, notify: input.notify, correction: input.type === "KEY_CORRECTION" && input.correction ? json(input.correction) : input.type === "RUBRIC_CORRECTION" ? json({ rubricChange: input.rubricChange }) : Prisma.JsonNull, preview: json({ rows, pending }), proposedById: user.userId } });
    return { id: remedy.id, type: remedy.type, questionId: question.id, rows, pending, changed: rows.filter(row => row.proposed !== row.previous).length };
  });
}

export async function listRemedies(user: AuthUser, assignmentId: string, questionId?: string | null) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper, student } = await scopedAssignment(user, assignmentId, tx);
    if (student) throw new ApiError("Exam unavailable.", 404);
    await staffExamAccess(user, assignment, "view", tx);
    const rows = await tx.schoolAiExamRemedy.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId }, orderBy: { createdAt: "desc" }, take: 50 });
    // For re-marking: each moderated script's answer to the chosen question and its current mark.
    const target = questionId ? paper.questions.find(question => question.id === questionId) : null;
    const scripts = target ? await (async () => {
      const attempts = await tx.schoolAiExamAttempt.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, status: "REVIEWED" }, select: { id: true, studentId: true, responses: true, review: true }, orderBy: { startedAt: "asc" } });
      const names = new Map((await tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: attempts.map(row => row.studentId) } }, select: { id: true, fullName: true } })).map(row => [row.id, row.fullName]));
      return attempts.map(attempt => {
        const answer = responsesSchema.parse(attempt.responses)[target.id] ?? "";
        const text = target.options.length ? target.options.filter(option => answer === option.id || answer.includes(`"${option.id}"`)).map(option => option.text).join(" · ") : answer;
        return { attemptId: attempt.id, name: names.get(attempt.studentId) ?? null, answer: text, marks: ((attempt.review as { marks?: Array<{ questionId: string; marks: number }> } | null)?.marks ?? []).find(mark => mark.questionId === target.id)?.marks ?? 0, maximum: target.marks };
      });
    })() : [];
    return { scripts, questions: paper.questions.map((question, index) => ({ id: question.id, number: index + 1, type: question.type, marks: question.marks, options: question.options })), remedies: rows.map(row => ({ id: row.id, type: row.type, question: paper.questions.findIndex(question => question.id === row.questionId) + 1, reason: row.reason, notify: row.notify, status: row.status, preview: row.preview as { rows: PreviewRow[]; pending: number }, outcomes: row.outcomes, createdAt: row.createdAt, appliedAt: row.appliedAt })) };
  });
}

/**
 * R17.9-R17.12: an approver authorizes the exact proposal by id. Each candidate's result is revised
 * through the ordinary result-revision path (a new immutable version, appeals resolved there), one
 * at a time, so a candidate whose result changed since the preview is skipped and named rather than
 * silently recalculated, and one failure never hides the others.
 */
export async function applyRemedy(user: AuthUser, assignmentId: string, remedyId: string) {
  const claim = await schoolAiTransaction(user, async tx => {
    const { assignment, student } = await scopedAssignment(user, assignmentId, tx);
    if (student) throw new ApiError("Exam unavailable.", 404);
    await staffExamAccess(user, assignment, "edit", tx);
    await assertStudioAction(user, "AUTHORIZE_REMEDY", { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId }, undefined, tx);
    // SKO-504: after release every per-candidate revision would fail, yet the remedy used to be marked APPLIED.
    if (assignment.resultsReleasedAt) throw new ApiError("Results are released, so this remedy cannot change them directly. Propose a correction for each affected result instead; another reviewer approves it.", 409);
    const remedy = await tx.schoolAiExamRemedy.findFirst({ where: { id: remedyId, assignmentId, schoolId: user.schoolId } });
    if (!remedy) throw new ApiError("Remedy unavailable.", 404);
    if (remedy.status !== "PROPOSED") throw new ApiError("This remedy was already applied or withdrawn.", 409);
    return remedy;
  });
  const preview = claim.preview as { rows: PreviewRow[] };
  const correction = claim.type === "KEY_CORRECTION" && claim.correction ? examKeyCorrectionSchema.parse(claim.correction) : null;
  const type = claim.type as keyof typeof REMEDY_WORDS;
  const outcomes: Array<{ attemptId: string; outcome: "APPLIED" | "UNCHANGED" | "SKIPPED_CHANGED" | "FAILED"; version?: number; detail?: string }> = [];
  for (const row of preview.rows) {
    if (row.proposed === row.previous) { outcomes.push({ attemptId: row.attemptId, outcome: "UNCHANGED" }); continue; }
    try {
      const current = await schoolAiTransaction(user, tx => tx.schoolAiExamAttempt.findFirst({ where: { id: row.attemptId, assignmentId, schoolId: user.schoolId }, select: { review: true, reviewVersion: true, status: true } }));
      if (!current?.review || current.status !== "REVIEWED" || current.reviewVersion !== row.resultVersion) { outcomes.push({ attemptId: row.attemptId, outcome: "SKIPPED_CHANGED" }); continue; }
      const stored = current.review as { marks: unknown; note: unknown; keyCorrections?: unknown };
      const review = examReviewSchema.parse({ marks: stored.marks, note: stored.note, keyCorrections: stored.keyCorrections });
      const marks = review.marks.some(mark => mark.questionId === claim.questionId)
        ? review.marks.map(mark => mark.questionId === claim.questionId ? { ...mark, marks: row.proposed } : mark)
        : [...review.marks, { questionId: claim.questionId, marks: row.proposed, feedback: REMEDY_FEEDBACK[type] }];
      const keyCorrections = correction ? [...(review.keyCorrections ?? []).filter(entry => entry.questionId !== correction.questionId), correction] : review.keyCorrections;
      const result = await regradeExamAttempt(user, assignmentId, { attemptId: row.attemptId, version: row.resultVersion, reason: `${REMEDY_WORDS[type]} (remedy ${claim.id}): ${claim.reason}`, review: { ...review, marks, ...(keyCorrections?.length ? { keyCorrections } : {}) } });
      outcomes.push({ attemptId: row.attemptId, outcome: "APPLIED", version: result.version });
    } catch (error) {
      outcomes.push({ attemptId: row.attemptId, outcome: "FAILED", detail: error instanceof Error ? error.message.slice(0, 300) : "Failed" });
    }
  }
  return schoolAiTransaction(user, async tx => {
    const updated = await tx.schoolAiExamRemedy.updateMany({ where: { id: claim.id, schoolId: user.schoolId, status: "PROPOSED" }, data: { status: "APPLIED", authorizedById: user.userId, appliedAt: new Date(), outcomes: json(outcomes) } });
    if (updated.count !== 1) throw new ApiError("This remedy was applied meanwhile.", 409);
    await writeAuditEvent(tx, user, { table: "school_ai_exam_remedies", recordId: claim.id, action: "UPDATE", campusId: claim.campusId, before: { status: "PROPOSED" }, after: { status: "APPLIED", applied: outcomes.filter(row => row.outcome === "APPLIED").length, skipped: outcomes.filter(row => row.outcome === "SKIPPED_CHANGED").length, failed: outcomes.filter(row => row.outcome === "FAILED").length, notify: claim.notify } });
    return { id: claim.id, status: "APPLIED" as const, outcomes };
  });
}

// ─── Supervised pause (R15.4, §3K) ──────────────────────────────────
export const pauseSchema = z.strictObject({ action: z.enum(["pause", "resume"]), attemptIds: z.array(id).min(1).max(500), reason: z.string().trim().min(3).max(300).optional() });

/**
 * An invigilator stops the clock for named attempts, with a reason; answers cannot be saved and the
 * deadline cannot close the attempt while it is paused. Resuming restores exactly the paused time to
 * the deadline. Every attempt's outcome is reported, so a partial action is never silent.
 */
export async function superviseAttempts(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = pauseSchema.parse(raw);
  if (input.action === "pause" && !input.reason) throw new ApiError("Give the reason for the pause.", 422);
  return schoolAiTransaction(user, async tx => {
    const { assignment, student } = await scopedAssignment(user, assignmentId, tx);
    if (student) throw new ApiError("Only exam staff can pause an attempt.", 403);
    await staffExamAccess(user, assignment, "add", tx);
    const now = new Date();
    const outcomes: Array<{ attemptId: string; outcome: "PAUSED" | "RESUMED" | "NOT_IN_PROGRESS" | "ALREADY_PAUSED" | "NOT_PAUSED"; restoredMs?: number; deadlineAt?: Date }> = [];
    for (const attemptId of [...new Set(input.attemptIds)]) {
      const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: attemptId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId } });
      if (!attempt || attempt.status !== "IN_PROGRESS" || (!attempt.pausedAt && attempt.deadlineAt <= now)) { outcomes.push({ attemptId, outcome: "NOT_IN_PROGRESS" }); continue; }
      if (input.action === "pause") {
        if (attempt.pausedAt) { outcomes.push({ attemptId, outcome: "ALREADY_PAUSED" }); continue; }
        const moved = await tx.schoolAiExamAttempt.updateMany({ where: { id: attempt.id, schoolId: user.schoolId, status: "IN_PROGRESS", pausedAt: null }, data: { pausedAt: now } });
        if (moved.count !== 1) { outcomes.push({ attemptId, outcome: "ALREADY_PAUSED" }); continue; }
        await tx.schoolAiExamPause.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, attemptId: attempt.id, reason: input.reason!, startedById: user.userId, startedAt: now } });
        await writeAuditEvent(tx, user, { table: "school_ai_exam_attempts", recordId: attempt.id, action: "UPDATE", campusId: assignment.campusId, before: { pausedAt: null }, after: { pausedAt: now.toISOString(), reason: input.reason! } });
        outcomes.push({ attemptId, outcome: "PAUSED", deadlineAt: attempt.deadlineAt });
      } else {
        if (!attempt.pausedAt) { outcomes.push({ attemptId, outcome: "NOT_PAUSED" }); continue; }
        const restoredMs = Math.max(0, now.getTime() - attempt.pausedAt.getTime());
        const deadlineAt = new Date(attempt.deadlineAt.getTime() + restoredMs);
        const moved = await tx.schoolAiExamAttempt.updateMany({ where: { id: attempt.id, schoolId: user.schoolId, status: "IN_PROGRESS", pausedAt: attempt.pausedAt }, data: { pausedAt: null, deadlineAt } });
        if (moved.count !== 1) { outcomes.push({ attemptId, outcome: "NOT_PAUSED" }); continue; }
        await tx.schoolAiExamPause.updateMany({ where: { schoolId: user.schoolId, attemptId: attempt.id, endedAt: null }, data: { endedAt: now, endedById: user.userId, restoredMs } });
        await writeAuditEvent(tx, user, { table: "school_ai_exam_attempts", recordId: attempt.id, action: "UPDATE", campusId: assignment.campusId, before: { deadlineAt: attempt.deadlineAt.toISOString() }, after: { deadlineAt: deadlineAt.toISOString(), restoredMs } });
        outcomes.push({ attemptId, outcome: "RESUMED", restoredMs, deadlineAt });
      }
    }
    return { outcomes };
  });
}
