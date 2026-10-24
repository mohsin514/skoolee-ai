import { randomInt } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { schoolAiTransaction } from "./transaction";
import { resultDecisionAccess, scopedAssignment, staffExamAccess } from "./exam-service";
import { examReviewSchema, responsesSchema, validateExamReview } from "./exam";
import { applyResultRevision } from "./exam-results";

/**
 * SKO-424 marking moderation and corrections.
 *
 * - A released result changes only through a correction proposed by one reviewer and approved by a
 *   different authorized reviewer against the exact version it was proposed on. One correction can
 *   be pending per result version, so contradictory corrections cannot both be approved.
 * - A moderation sample is chosen by a recorded rule from reviewed scripts, assigned to a reviewer
 *   who did not mark them, optionally blind (original marks and marker hidden until the second mark
 *   is in), and flags scripts whose totals differ by more than the threshold for a decision.
 * - Nothing here is decided by AI, and family-visible history is never rewritten: every change is a
 *   new revision with its reason, and rejected corrections keep their evidence and explanation.
 */

const id = z.string().trim().min(1).max(120);
const reason = z.string().trim().min(8).max(4000);
const ProposeInput = z.object({ attemptId: id, version: z.number().int().min(1), reason, review: examReviewSchema, appealId: id.optional(), source: z.enum(["REGRADE", "APPEAL", "MODERATION", "KEY_CORRECTION"]).default("REGRADE") }).strict();
const DecideInput = z.object({ correctionId: id, version: z.number().int().positive(), decision: z.enum(["APPROVE", "REJECT"]), note: reason }).strict();
const SampleInput = z.object({ method: z.enum(["RANDOM", "LOWEST", "HIGHEST"]), size: z.number().int().min(1).max(50), threshold: z.number().min(0).max(100), blind: z.boolean().default(true), reviewerId: id }).strict();
const SecondMarkInput = z.object({ attemptId: id, version: z.number().int().positive(), marks: z.array(z.object({ questionId: id, marks: z.number().min(0).max(100) }).strict()).min(1).max(100), note: z.string().trim().max(2000).optional() }).strict();
const ResolveInput = z.object({ attemptId: id, version: z.number().int().positive(), outcome: z.enum(["CONFIRM_ORIGINAL", "PROPOSE_CORRECTION"]), reason, review: examReviewSchema.optional() }).strict();

type SampleItem = { attemptId: string; originalVersion: number; originalTotal: number; originalMarkerId: string | null; secondMarks: { questionId: string; marks: number }[] | null; secondTotal: number | null; discrepancy: number | null; flagged: boolean; outcome: string | null; note: string | null };

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
const total = (review: unknown) => { const t = (review as { total?: unknown } | null)?.total; return typeof t === "number" ? t : ((review as { marks?: { marks: number }[] } | null)?.marks ?? []).reduce((s, m) => s + m.marks, 0); };

/** SKO-504: proposals and decisions on released results are open to managers and to the head of department. */
async function decisionScope(user: AuthUser, assignmentId: string, tx: TxClient) {
  const assignment = await tx.schoolAiExamAssignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) } });
  if (!assignment) throw new ApiError("Exam unavailable.", 404);
  return { assignment, paper: await resultDecisionAccess(user, assignment, tx) };
}

async function proposeIn(tx: TxClient, user: AuthUser, assignmentId: string, input: z.infer<typeof ProposeInput>) {
  const { assignment, paper } = await decisionScope(user, assignmentId, tx);
  if (!assignment.resultsReleasedAt) throw new ApiError("This result is not released yet; revise it directly.", 409);
  const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: input.attemptId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, status: "REVIEWED", reviewVersion: input.version } });
  if (!attempt) throw new ApiError("The result changed. Reload its current version before proposing a correction.", 409);
  const issues = validateExamReview(paper, responsesSchema.parse(attempt.responses), input.review);
  if (issues.length) throw new ApiError(issues.join(" "), 422);
  if (input.appealId && !(await tx.schoolAiExamAppeal.findFirst({ where: { id: input.appealId, attemptId: attempt.id, schoolId: user.schoolId, resultVersion: input.version }, select: { id: true } }))) throw new ApiError("That review request belongs to another result.", 400);
  const pending = await tx.schoolAiResultCorrection.findFirst({ where: { schoolId: user.schoolId, attemptId: attempt.id, fromVersion: input.version, status: "PENDING" } });
  if (pending) {
    // An exact retry by the same proposer replays; anything else is a competing correction.
    if (pending.proposedById === user.userId && pending.reason === input.reason && isDeepStrictEqual(pending.review, input.review)) return pending;
    throw new ApiError("A correction for this result version is already awaiting approval.", 409);
  }
  const previousTotal = total(attempt.review), proposedTotal = input.review.marks.reduce((s, m) => s + m.marks, 0);
  const created = await tx.schoolAiResultCorrection.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, attemptId: attempt.id, fromVersion: input.version, review: input.review as Prisma.InputJsonValue,
    previousTotal, proposedTotal, reason: input.reason, source: input.source, appealId: input.appealId ?? null, proposedById: user.userId } });
  await writeAuditEvent(tx, user, { table: "school_ai_result_corrections", recordId: created.id, action: "CREATE", campusId: assignment.campusId, after: { attemptId: attempt.id, fromVersion: input.version, previousTotal, proposedTotal, source: input.source } });
  return created;
}

/** SKO-504: the same proposal from inside another transaction (an upheld appeal, a released-result revise). */
export async function proposeCorrectionIn(tx: TxClient, user: AuthUser, assignmentId: string, raw: unknown) {
  return proposeIn(tx, user, assignmentId, parse(ProposeInput, raw));
}

/** Propose a change to a released result. It does not change the published result. */
export async function proposeResultCorrection(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = parse(ProposeInput, raw);
  return schoolAiTransaction(user, (tx) => proposeIn(tx, user, assignmentId, input));
}

/** Approve or reject a pending correction. The proposer can never approve their own. */
export async function decideResultCorrection(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = parse(DecideInput, raw);
  const result = await schoolAiTransaction(user, async (tx) => {
    const { assignment, paper } = await decisionScope(user, assignmentId, tx);
    const correction = await tx.schoolAiResultCorrection.findFirst({ where: { id: input.correctionId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId } });
    if (!correction) throw new ApiError("Correction not found", 404);
    if (correction.version !== input.version || correction.status !== "PENDING") throw new ApiError("This correction changed since you opened it. Review the latest decision.", 409);
    if (correction.proposedById === user.userId) throw new ApiError("An independent reviewer must approve this correction.", 403);
    let revision: Awaited<ReturnType<typeof applyResultRevision>> | null = null;
    if (input.decision === "APPROVE") {
      const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: correction.attemptId, schoolId: user.schoolId, campusId: assignment.campusId, status: "REVIEWED", reviewVersion: correction.fromVersion } });
      if (!attempt) {
        // Recorded (committed) before the conflict is reported, so the stale correction can never be approved later.
        await tx.schoolAiResultCorrection.updateMany({ where: { id: correction.id, version: input.version }, data: { status: "SUPERSEDED", version: { increment: 1 }, decisionNote: "The result changed after this correction was proposed." } });
        return { superseded: true as const };
      }
      revision = await applyResultRevision(tx, user, { assignmentId, campusId: assignment.campusId, paper, attempt, fromVersion: correction.fromVersion, review: examReviewSchema.parse(correction.review), reason: correction.reason, createdById: correction.proposedById });
    }
    const done = await tx.schoolAiResultCorrection.updateMany({ where: { id: correction.id, version: input.version, status: "PENDING" }, data: { status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED", decidedById: user.userId, decidedAt: new Date(), decisionNote: input.note, version: { increment: 1 } } });
    if (done.count !== 1) throw new ApiError("Another decision was saved first.", 409);
    await writeAuditEvent(tx, user, { table: "school_ai_result_corrections", recordId: correction.id, action: input.decision === "APPROVE" ? "APPROVE" : "REJECT", campusId: assignment.campusId,
      before: { status: "PENDING", total: correction.previousTotal }, after: { status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED", total: input.decision === "APPROVE" ? correction.proposedTotal : correction.previousTotal, resultVersion: revision?.version ?? correction.fromVersion } });
    return { id: correction.id, status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED", resultVersion: revision?.version ?? correction.fromVersion };
  });
  if ("superseded" in result) throw new ApiError("The result changed after this correction was proposed. It has been marked superseded.", 409);
  return result;
}

/** Choose a second-marking sample by a recorded rule; the reviewer never second-marks their own scripts. */
export async function createModerationSample(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = parse(SampleInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const { assignment } = await scopedAssignment(user, assignmentId, tx);
    await staffExamAccess(user, assignment, "edit", tx);
    // Reviewers must be able to open every sampled script, which teachers can only do for exams they
    // set themselves; second marking is therefore assigned to an academic lead on this campus.
    const reviewer = await tx.user.findFirst({ where: { id: input.reviewerId, schoolId: user.schoolId, campusId: assignment.campusId, isActive: true, role: { in: ["CAMPUS_ADMIN", "PRINCIPAL", "ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
    if (!reviewer) throw new ApiError("Choose an active academic lead on this campus as the reviewer.", 400);
    const attempts = await tx.schoolAiExamAttempt.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, status: "REVIEWED", NOT: { reviewedById: input.reviewerId } }, select: { id: true, reviewVersion: true, review: true, reviewedById: true }, take: 2000 });
    if (!attempts.length) throw new ApiError("There are no reviewed scripts this reviewer did not mark.", 409);
    const scored = attempts.map((a) => ({ ...a, total: total(a.review) }));
    let chosen: typeof scored;
    if (input.method === "RANDOM") { const pool = [...scored]; chosen = []; while (chosen.length < input.size && pool.length) chosen.push(pool.splice(randomInt(pool.length), 1)[0]); }
    else chosen = [...scored].sort((a, b) => (input.method === "LOWEST" ? a.total - b.total : b.total - a.total) || a.id.localeCompare(b.id)).slice(0, input.size);
    const items: SampleItem[] = chosen.map((a) => ({ attemptId: a.id, originalVersion: a.reviewVersion, originalTotal: a.total, originalMarkerId: a.reviewedById, secondMarks: null, secondTotal: null, discrepancy: null, flagged: false, outcome: null, note: null }));
    return tx.schoolAiModerationSample.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, method: input.method, size: items.length, threshold: input.threshold, blind: input.blind, reviewerId: input.reviewerId, createdById: user.userId, items: items as unknown as Prisma.InputJsonValue } });
  });
}

/**
 * The reviewer's view hides original marks and the original marker while an item is unmarked in a
 * blind sample. Leads (exam editors other than the reviewer) see everything.
 */
function sampleView(sample: { reviewerId: string; blind: boolean; items: Prisma.JsonValue }, viewerId: string) {
  const items = sample.items as unknown as SampleItem[];
  return items.map((item) => (sample.blind && viewerId === sample.reviewerId && item.secondTotal == null ? { ...item, originalTotal: null, originalMarkerId: null } : item));
}

export async function moderationOverview(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async (tx) => {
    const { assignment, paper } = await scopedAssignment(user, assignmentId, tx);
    await staffExamAccess(user, assignment, "view", tx);
    const reviewers = await tx.user.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, isActive: true, role: { in: ["CAMPUS_ADMIN", "PRINCIPAL", "ADMIN", "SUPER_ADMIN"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 200 });
    const [corrections, samples] = await Promise.all([
      tx.schoolAiResultCorrection.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId }, orderBy: { createdAt: "desc" }, take: 200 }),
      tx.schoolAiModerationSample.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const appeals = await tx.schoolAiExamAppeal.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId }, orderBy: { createdAt: "desc" }, take: 200 });
    return {
      released: !!assignment.resultsReleasedAt, userId: user.userId, reviewers,
      questions: paper.questions.map((q, index) => ({ id: q.id, number: index + 1, marks: q.marks })),
      corrections: corrections.map((c) => ({ ...c, canDecide: c.status === "PENDING" && c.proposedById !== user.userId })),
      appeals,
      samples: samples.map((s) => ({ ...s, items: sampleView(s, user.userId) })),
    };
  });
}

/** The assigned reviewer records an independent mark; a difference above the threshold is flagged. */
export async function submitSecondMark(user: AuthUser, sampleId: string, raw: unknown) {
  const input = parse(SecondMarkInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const sample = await tx.schoolAiModerationSample.findFirst({ where: { id: sampleId, schoolId: user.schoolId } });
    if (!sample) throw new ApiError("Sample not found", 404);
    if (sample.reviewerId !== user.userId) throw new ApiError("Only the assigned reviewer can second-mark this sample.", 403);
    if (sample.version !== input.version) throw new ApiError("This sample changed since you opened it. Reload and try again.", 409);
    const { assignment, paper } = await scopedAssignment(user, sample.assignmentId, tx);
    await staffExamAccess(user, assignment, "edit", tx);
    const items = sample.items as unknown as SampleItem[];
    const item = items.find((i) => i.attemptId === input.attemptId);
    if (!item) throw new ApiError("That script is not in this sample.", 404);
    if (item.secondTotal != null) throw new ApiError("This script already has a second mark.", 409);
    for (const mark of input.marks) {
      const question = paper.questions.find((q) => q.id === mark.questionId);
      if (!question || mark.marks > question.marks) throw new ApiError("Each second mark must be for a question on this paper and within its maximum.", 400);
    }
    const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: item.attemptId, schoolId: user.schoolId }, select: { reviewVersion: true, review: true } });
    const secondTotal = input.marks.reduce((s, m) => s + m.marks, 0);
    // Compare with the result as it stands now; if it moved since sampling, the comparison says so.
    const currentTotal = total(attempt?.review);
    const discrepancy = Math.abs(secondTotal - currentTotal);
    const next = items.map((i) => (i.attemptId === item.attemptId ? { ...i, secondMarks: input.marks, secondTotal, discrepancy, flagged: discrepancy > sample.threshold, note: input.note ?? null, originalTotal: currentTotal, originalVersion: attempt?.reviewVersion ?? i.originalVersion } : i));
    const complete = next.every((i) => i.secondTotal != null && (!i.flagged || i.outcome));
    const done = await tx.schoolAiModerationSample.updateMany({ where: { id: sample.id, version: input.version }, data: { items: next as unknown as Prisma.InputJsonValue, status: complete ? "COMPLETE" : "OPEN", version: { increment: 1 } } });
    if (!done.count) throw new ApiError("This sample changed since you opened it. Reload and try again.", 409);
    return { sampleId: sample.id, attemptId: item.attemptId, secondTotal, discrepancy, flagged: discrepancy > sample.threshold };
  });
}

/**
 * A lead (not the second marker) decides a flagged script: keep the original with a reason, or
 * propose a correction — applied directly before release, or as a correction needing independent
 * approval after release.
 */
export async function resolveSampleItem(user: AuthUser, sampleId: string, raw: unknown) {
  const input = parse(ResolveInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const sample = await tx.schoolAiModerationSample.findFirst({ where: { id: sampleId, schoolId: user.schoolId } });
    if (!sample) throw new ApiError("Sample not found", 404);
    if (sample.version !== input.version) throw new ApiError("This sample changed since you opened it. Reload and try again.", 409);
    if (sample.reviewerId === user.userId) throw new ApiError("The second marker cannot decide their own discrepancy.", 403);
    const { assignment, paper } = await scopedAssignment(user, sample.assignmentId, tx);
    await staffExamAccess(user, assignment, "edit", tx);
    const items = sample.items as unknown as SampleItem[];
    const item = items.find((i) => i.attemptId === input.attemptId);
    if (!item || !item.flagged || item.outcome) throw new ApiError("Only a flagged, undecided script can be resolved.", 409);
    let outcome = "ORIGINAL_CONFIRMED";
    if (input.outcome === "PROPOSE_CORRECTION") {
      if (!input.review) throw new ApiError("Enter the corrected marks.", 400);
      const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: item.attemptId, schoolId: user.schoolId, campusId: assignment.campusId, status: "REVIEWED" } });
      if (!attempt) throw new ApiError("Script not found", 404);
      if (assignment.resultsReleasedAt) { await proposeIn(tx, user, sample.assignmentId, { attemptId: attempt.id, version: attempt.reviewVersion, reason: input.reason, review: input.review, source: "MODERATION" }); outcome = "CORRECTION_PROPOSED"; }
      else { await applyResultRevision(tx, user, { assignmentId: sample.assignmentId, campusId: assignment.campusId, paper, attempt, fromVersion: attempt.reviewVersion, review: input.review, reason: input.reason }); outcome = "CORRECTED"; }
    }
    const next = items.map((i) => (i.attemptId === item.attemptId ? { ...i, outcome, note: input.reason } : i));
    const complete = next.every((i) => i.secondTotal != null && (!i.flagged || i.outcome));
    const done = await tx.schoolAiModerationSample.updateMany({ where: { id: sample.id, version: input.version }, data: { items: next as unknown as Prisma.InputJsonValue, status: complete ? "COMPLETE" : "OPEN", version: { increment: 1 } } });
    if (!done.count) throw new ApiError("This sample changed since you opened it. Reload and try again.", 409);
    return { sampleId: sample.id, attemptId: item.attemptId, outcome };
  });
}
