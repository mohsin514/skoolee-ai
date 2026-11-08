import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { schoolAiTransaction } from "./transaction";
import { assertWorkspacePermission } from "./access";
import { curriculumDataSchema, paperDataSchema } from "./assessment";
import { examReviewSchema, responsesSchema, validateExamReview, validateResponses } from "./exam";
import { authorizedRecord } from "./learning-service";
import { MIN_SAMPLE, citableAttempts, fingerprint, itemResponses, summarizeItems, type AssignmentInput, type AttemptInput, type ItemResponse } from "./item-evidence";
import { saveLearningAction } from "@/lib/learning/actions";

/**
 * SKO-422: question-level evidence for a curriculum version, and the teacher's reading of it.
 * A hypothesis must cite reviewed answers that lost marks and an objective; a flagged item blocks
 * any teaching group until the flag is resolved; an approved group becomes draft learning actions
 * (SKO-425) that cite each learner's own attempt. Nothing here changes a mark or a published grade.
 */

export const CALCULATION_RULES = [
  "Only reviewed answers count. Awaiting review, not attempted, unanswered and excluded responses are shown separately and are not counted as incorrect.",
  "Paper versions are shown separately and are never combined.",
  `Below ${MIN_SAMPLE} reviewed answers no percentage is shown.`,
  "A key correction or re-review changes the evidence and marks any interpretation of the item stale.",
] as const;

const FLAG_CATEGORIES = ["AMBIGUOUS", "KEY_ERROR", "CURRICULUM_MISMATCH", "OTHER"] as const;
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const DecideInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("HYPOTHESIS"), key: text(3, 400), statement: text(10, 1000), reason: text(8, 1000), citedAttemptIds: z.array(text(1, 120)).min(1).max(40), evidenceHash: text(64, 64) }).strict(),
  z.object({ kind: z.literal("FLAG"), key: text(3, 400), flagCategory: z.enum(FLAG_CATEGORIES), statement: text(10, 1000), reason: text(8, 1000), evidenceHash: text(64, 64) }).strict(),
]);
const ReviewInput = z.object({ action: z.enum(["DISMISS", "RESOLVE", "RECONFIRM"]), version: z.number().int().positive(), reason: text(8, 1000) }).strict();
const GroupInput = z.object({ version: z.number().int().positive(), studentIds: z.array(text(1, 120)).min(1).max(60), reason: text(8, 1000) }).strict();

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}

/** Loads the curriculum version's assignments, roster and attempts, validated as learningEvidence does. */
async function loadScope(tx: TxClient, user: AuthUser, recordId: string, permission: "view" | "edit") {
  const { record, permissions } = await authorizedRecord(user, recordId, tx);
  if (record.kind !== "CURRICULUM") throw new ApiError("Choose a curriculum.", 422);
  await assertWorkspacePermission(user, "exams", permission, permissions);
  await assertWorkspacePermission(user, "students", "view", permissions);
  const curriculum = curriculumDataSchema.parse(record.data);
  const assignments = await tx.schoolAiExamAssignment.findMany({
    where: { schoolId: user.schoolId, campusId: record.campusId!, classId: curriculum.classId, paper: { subjectId: curriculum.subjectId }, ...(user.role === "TEACHER" ? { createdById: user.userId } : {}),
      mode: { in: ["STANDARD", "SECURE_BROWSER"] }, AND: [{ paperSnapshot: { path: ["curriculumId"], equals: record.id } }, { paperSnapshot: { path: ["curriculumVersion"], equals: record.version } }] },
    orderBy: { createdAt: "desc" }, take: 201, select: { id: true, title: true, paperId: true, paperVersion: true, paperSnapshot: true },
  });
  if (assignments.length > 200) throw new ApiError("This curriculum has more than 200 assessments. Select a smaller scope.", 422);
  const students = await tx.student.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId!, classId: curriculum.classId, status: "active", archivedAt: null }, select: { id: true, fullName: true, rollNo: true }, orderBy: { rollNo: "asc" }, take: 1001 });
  if (students.length > 1000) throw new ApiError("Select a class with at most 1,000 active learners.", 422);
  const roster = students.map((s) => s.id);
  const inputs: AssignmentInput[] = assignments.flatMap((a) => {
    const paper = paperDataSchema.safeParse(a.paperSnapshot);
    return paper.success ? [{ id: a.id, title: a.title, paperId: a.paperId, paperVersion: a.paperVersion, paper: paper.data, audience: roster }] : [];
  });
  const rows = await tx.schoolAiExamAttempt.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId!, assignmentId: { in: inputs.map((a) => a.id) }, studentId: { in: roster } }, select: { id: true, studentId: true, assignmentId: true, status: true, responses: true, review: true }, take: 10001 });
  if (rows.length > 10000) throw new ApiError("This assessment scope exceeds 10,000 attempts. Select a smaller curriculum scope.", 422);
  const attempts: AttemptInput[] = rows.map((row) => {
    if (row.status !== "REVIEWED") return { attemptId: row.id, studentId: row.studentId, assignmentId: row.assignmentId, status: row.status, reviewed: null };
    const paper = inputs.find((a) => a.id === row.assignmentId)!.paper;
    const saved = (row.review ?? {}) as { marks?: unknown; note?: unknown; keyCorrections?: unknown };
    const review = examReviewSchema.safeParse({ marks: saved.marks, note: saved.note, keyCorrections: saved.keyCorrections });
    const responses = responsesSchema.safeParse(row.responses);
    const valid = review.success && responses.success && validateResponses(paper, responses.data).length === 0 && validateExamReview(paper, responses.data, review.data).length === 0;
    return { attemptId: row.id, studentId: row.studentId, assignmentId: row.assignmentId, status: row.status,
      reviewed: valid ? { marks: review.data.marks, responses: responses.data as Record<string, string> } : null };
  });
  return { record, curriculum, students, assignments: inputs, attempts };
}

type Scope = Awaited<ReturnType<typeof loadScope>>;
function itemOf(scope: Scope, key: string) {
  const parts = itemResponses(scope.assignments, scope.attempts).get(key);
  if (!parts) throw new ApiError("That question is not part of this curriculum's reviewed assessments.", 404);
  const responses: ItemResponse[] = parts.flatMap((p) => p.responses);
  return { question: parts[0].question, assignment: parts[0].assignment, responses, hash: fingerprint(responses) };
}
const decisionView = (row: Prisma.ItemEvidenceDecisionGetPayload<object>, currentHash: string | undefined) => ({ ...row, stale: row.status !== "DISMISSED" && row.status !== "RESOLVED" && currentHash !== undefined && row.evidenceHash !== currentHash });

export async function itemEvidence(user: AuthUser, recordId: string) {
  return schoolAiTransaction(user, async (tx) => {
    const scope = await loadScope(tx, user, recordId, "view");
    const items = summarizeItems(scope.assignments, scope.attempts);
    const decisions = await tx.itemEvidenceDecision.findMany({ where: { schoolId: user.schoolId, curriculumId: scope.record.id, curriculumVersion: scope.record.version }, orderBy: { createdAt: "desc" } });
    const outcomes = new Map(scope.curriculum.outcomes.map((o) => [o.id, o.title]));
    return {
      recordId: scope.record.id, recordVersion: scope.record.version, minSample: MIN_SAMPLE, rules: CALCULATION_RULES,
      items: items.map((item) => ({ ...item, outcomes: item.outcomeIds.map((id) => ({ id, title: outcomes.get(id) ?? id })),
        decisions: decisions.filter((d) => d.paperId === item.paperId && d.paperVersion === item.paperVersion && d.questionId === item.questionId).map((d) => decisionView(d, item.evidenceHash)) })),
    };
  });
}

/** Named responses for one item. Only staff who can view this class's learners reach this. */
export async function itemResponsesFor(user: AuthUser, recordId: string, key: string) {
  return schoolAiTransaction(user, async (tx) => {
    const scope = await loadScope(tx, user, recordId, "view");
    const { responses, hash } = itemOf(scope, key);
    const names = new Map(scope.students.map((s) => [s.id, s]));
    return { key, evidenceHash: hash, responses: responses.map((r) => ({ ...r, fullName: names.get(r.studentId)?.fullName ?? "", rollNo: names.get(r.studentId)?.rollNo ?? "" })) };
  });
}

export async function decideItem(user: AuthUser, recordId: string, raw: unknown) {
  const input = parse(DecideInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const scope = await loadScope(tx, user, recordId, "edit");
    const { question, assignment, responses, hash } = itemOf(scope, input.key);
    if (hash !== input.evidenceHash) throw new ApiError("The evidence for this question changed. Reload it before deciding.", 409);
    const where = { schoolId: user.schoolId, curriculumId: scope.record.id, curriculumVersion: scope.record.version, paperId: assignment.paperId, paperVersion: assignment.paperVersion, questionId: question.id };
    if (input.kind === "HYPOTHESIS") {
      if (!question.outcomeIds?.length) throw new ApiError("This question is not mapped to an objective, so there is not enough evidence for a hypothesis.", 422);
      if (await tx.itemEvidenceDecision.findFirst({ where: { ...where, kind: "FLAG", status: "OPEN" }, select: { id: true } })) throw new ApiError("This question is flagged. Resolve the flag before interpreting learners' answers.", 409);
      const citable = citableAttempts(responses);
      if (input.citedAttemptIds.some((id) => !citable.has(id))) throw new ApiError("Cite only reviewed answers that lost marks on this question.", 400);
    }
    const history = [{ at: new Date().toISOString(), by: user.userId, action: input.kind, reason: input.reason }];
    return tx.itemEvidenceDecision.create({ data: { ...where, campusId: scope.record.campusId!, kind: input.kind, flagCategory: input.kind === "FLAG" ? input.flagCategory : null,
      statement: input.statement, reason: input.reason, citedAttemptIds: input.kind === "HYPOTHESIS" ? [...new Set(input.citedAttemptIds)] : [],
      outcomeIds: question.outcomeIds ?? [], evidenceHash: hash, createdById: user.userId, history } });
  });
}

async function loadDecision(tx: TxClient, user: AuthUser, decisionId: string, version: number) {
  const decision = await tx.itemEvidenceDecision.findFirst({ where: { id: decisionId, schoolId: user.schoolId } });
  if (!decision) throw new ApiError("Decision not found", 404);
  if (decision.version !== version) throw new ApiError("This decision changed since you opened it. Reload and try again.", 409);
  return decision;
}
const pushHistory = (history: Prisma.JsonValue, entry: Record<string, unknown>) => [...(Array.isArray(history) ? history : []), { at: new Date().toISOString(), ...entry }] as Prisma.InputJsonValue;

/** Dismiss a hypothesis, resolve a flag, or re-confirm an interpretation on changed evidence. */
export async function reviewDecision(user: AuthUser, decisionId: string, raw: unknown) {
  const input = parse(ReviewInput, raw);
  return schoolAiTransaction(user, async (tx) => {
    const decision = await loadDecision(tx, user, decisionId, input.version);
    const scope = await loadScope(tx, user, decision.curriculumId, "edit");
    const { responses, hash } = itemOf(scope, `${decision.paperId}:${decision.paperVersion}:${decision.questionId}`);
    let data: Prisma.ItemEvidenceDecisionUpdateManyMutationInput;
    if (input.action === "DISMISS") {
      if (decision.kind !== "HYPOTHESIS" || decision.status !== "OPEN") throw new ApiError("Only an open hypothesis can be dismissed.", 409);
      data = { status: "DISMISSED" };
    } else if (input.action === "RESOLVE") {
      if (decision.kind !== "FLAG" || decision.status !== "OPEN") throw new ApiError("Only an open flag can be resolved.", 409);
      data = { status: "RESOLVED" };
    } else {
      if (decision.status !== "OPEN") throw new ApiError("Only an open decision can be re-confirmed.", 409);
      if (decision.kind === "HYPOTHESIS") {
        const citable = citableAttempts(responses);
        const still = (decision.citedAttemptIds as string[]).filter((id) => citable.has(id));
        if (!still.length) throw new ApiError("None of the cited answers still lost marks after the change. Dismiss this hypothesis instead.", 409);
        data = { evidenceHash: hash, citedAttemptIds: still };
      } else data = { evidenceHash: hash };
    }
    const done = await tx.itemEvidenceDecision.updateMany({ where: { id: decision.id, version: input.version }, data: { ...data, version: { increment: 1 }, history: pushHistory(decision.history, { by: user.userId, action: input.action, reason: input.reason, ...(input.action === "RECONFIRM" ? { previousHash: decision.evidenceHash, evidenceHash: hash } : {}) }) } });
    if (!done.count) throw new ApiError("This decision changed since you opened it. Reload and try again.", 409);
    return tx.itemEvidenceDecision.findUnique({ where: { id: decision.id } });
  });
}

/**
 * Approve a temporary practice group from a hypothesis. Each member gets a draft learning action
 * (still subject to a leader's activation) citing that learner's own attempt where one exists.
 */
export async function approveGroup(user: AuthUser, decisionId: string, raw: unknown) {
  const input = parse(GroupInput, raw);
  const claimed = await schoolAiTransaction(user, async (tx) => {
    const decision = await loadDecision(tx, user, decisionId, input.version);
    if (decision.kind !== "HYPOTHESIS" || decision.status !== "OPEN") throw new ApiError("Only an open hypothesis can become a practice group.", 409);
    const scope = await loadScope(tx, user, decision.curriculumId, "edit");
    const key = `${decision.paperId}:${decision.paperVersion}:${decision.questionId}`;
    const { responses, hash, assignment, question } = itemOf(scope, key);
    if (hash !== decision.evidenceHash) throw new ApiError("The evidence changed after this hypothesis was recorded. Re-confirm or dismiss it first.", 409);
    if (await tx.itemEvidenceDecision.findFirst({ where: { schoolId: user.schoolId, curriculumId: decision.curriculumId, curriculumVersion: decision.curriculumVersion, paperId: decision.paperId, paperVersion: decision.paperVersion, questionId: decision.questionId, kind: "FLAG", status: "OPEN" }, select: { id: true } })) throw new ApiError("This question is flagged. Resolve the flag before assigning practice.", 409);
    const roster = new Set(scope.students.map((s) => s.id));
    const members = [...new Set(input.studentIds)];
    if (members.some((id) => !roster.has(id))) throw new ApiError("Choose learners from this class only.", 400);
    const done = await tx.itemEvidenceDecision.updateMany({ where: { id: decision.id, version: input.version }, data: { status: "GROUP_APPROVED", groupStudentIds: members, groupReason: input.reason, version: { increment: 1 },
      history: pushHistory(decision.history, { by: user.userId, action: "GROUP_APPROVED", reason: input.reason, members: members.length }) } });
    if (!done.count) throw new ApiError("This decision changed since you opened it. Reload and try again.", 409);
    return { decision, members, responses, label: `${assignment.title} · Q${assignment.paper.questions.findIndex((q) => q.id === question.id) + 1} (v${assignment.paperVersion})`, subjectId: scope.curriculum.subjectId };
  });
  // Drafts are created outside the claim, each through the learning-action rules (teacher must teach
  // the learner, evidence must be the learner's own). The decision records every plan id it produced.
  const planIds: string[] = [], failed: { studentId: string; error: string }[] = [];
  for (const studentId of claimed.members) {
    const own = claimed.responses.find((r) => r.studentId === studentId && r.attemptId && (r.state === "INCORRECT" || r.state === "PARTIAL"));
    try {
      const plan = await saveLearningAction(user, {
        version: 0, studentId, subjectId: claimed.subjectId, title: `Practice: ${claimed.decision.statement.slice(0, 140)}`,
        concern: `${claimed.decision.statement}\n\n${claimed.label}`, evidenceState: own ? "CONFIRMED" : "NEEDS_OBSERVATION",
        evidenceRefs: own ? [{ kind: "EXAM_ATTEMPT", refId: own.attemptId!, label: claimed.label.slice(0, 200) }] : [],
      }) as { id: string };
      planIds.push(plan.id);
    } catch (error) {
      failed.push({ studentId, error: error instanceof Error ? error.message : "Draft could not be created" });
    }
  }
  await schoolAiTransaction(user, (tx) => tx.itemEvidenceDecision.updateMany({ where: { id: decisionId, schoolId: user.schoolId }, data: { actionPlanIds: planIds } }));
  return { decisionId, actionPlanIds: planIds, failed };
}
