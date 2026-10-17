import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { SchoolAiError, assertSchoolAiAccess, isSchoolAiManager, loadWorkspacePermissionSnapshot } from "./access";
import { candidatePaper, curriculumDataSchema, paperDataSchema, type PaperData, type Question } from "./assessment";
import { itemReviewStateSchema, type ItemReview } from "./assessment";
import { itemReviewTransition, itemStateCounts, itemStateFor, releaseBlockers, stalenessNotices } from "./item-review";
import { assertKeyFreeProjection, contentHash, contentHashPrefix, formLabelOf, releasePreconditions } from "./release";
import { getWorkspaceRecordInTransaction, resolveScopeDeliveryPolicy } from "./repository";
import { assertStudioAction, recordStudioAction } from "./studio-access";
import { schoolAiTransaction } from "./transaction";

// SKO-408: the callers the Exam Studio domain was missing — item review, rehearsal of an exact
// paper version, the sealed release gate used at assignment, and the explicit result release.

const json = (value: unknown) => value as Prisma.InputJsonValue;
const studioContext = (record: { schoolId: string; campusId: string | null; subjectId: string | null; classId: string | null }) => ({ schoolId: record.schoolId, campusId: record.campusId, subjectId: record.subjectId, classId: record.classId });

async function paperRecord(tx: TxClient, user: AuthUser, recordId: string) {
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  await getWorkspaceRecordInTransaction(user, recordId, tx, permissions); // scope and visibility
  const record = await tx.schoolAiRecord.findFirst({ where: { id: recordId, schoolId: user.schoolId, kind: "PAPER" } });
  if (!record) throw new SchoolAiError("Choose a saved paper.", 404);
  return { record, paper: paperDataSchema.parse(record.data), permissions };
}

/** Writes a new immutable record version holding server-owned review or rehearsal state. */
async function writePaperVersion(tx: TxClient, user: AuthUser, record: { id: string; version: number; status: string; campusId: string | null; title: string }, paper: PaperData) {
  const updated = await tx.schoolAiRecord.updateMany({ where: { id: record.id, schoolId: user.schoolId, version: record.version, status: record.status }, data: { data: json(paper), version: { increment: 1 }, updatedById: user.userId } });
  if (updated.count !== 1) throw new SchoolAiError("This paper changed meanwhile. Reload and review the current version.", 409);
  const next = await tx.schoolAiRecord.findFirstOrThrow({ where: { id: record.id, schoolId: user.schoolId } });
  await tx.schoolAiRevision.create({ data: { schoolId: user.schoolId, campusId: next.campusId, recordId: next.id, version: next.version, action: "REVIEW", title: next.title, status: next.status, data: json(next.data), actorId: user.userId } });
  return next;
}

// ─── Item review desk ─────────────────────────────────────────────
export const itemReviewInput = z.object({ version: z.number().int().positive(), questionId: z.string().min(1).max(120), target: itemReviewStateSchema, itemRevision: z.number().int().positive().optional(), note: z.string().trim().max(500).optional(),
  // After an edit, the author confirms each invalidated check (key, rubric, evidence, semantic review) was redone for this revision.
  confirmRechecked: z.array(z.enum(["KEY", "RUBRIC", "SEMANTIC_REVIEW", "FIGURE_CHECK", "ITEM_APPROVAL", "COVERAGE_CHECK"])).max(6).optional() }).strict();

/**
 * Authors move items to ready or back to correction; only an academic approver can approve, and an
 * approval states the exact item revision. A paper enters the workbench the first time any item is reviewed.
 */
export async function reviewItem(user: AuthUser, recordId: string, raw: unknown) {
  const input = itemReviewInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { record, paper, permissions } = await paperRecord(tx, user, recordId);
    if (record.version !== input.version) throw new SchoolAiError("This paper changed meanwhile. Reload and review the current version.", 409);
    if (record.status === "APPROVED" || record.status === "ARCHIVED") throw new SchoolAiError("Items of an approved or archived version cannot change. Edit the paper to create a new draft.", 409);
    const action = input.target === "APPROVED" ? "APPROVE_VERSION" : "AUTHOR_ITEM";
    const role = await assertStudioAction(user, action, studioContext(record), permissions, tx);
    const found = paper.questions.find(item => item.id === input.questionId);
    if (!found) throw new SchoolAiError("That question is not in this paper version.", 404);
    let question = found;
    if (input.confirmRechecked?.length) {
      const pending = [...new Set(found.review?.invalidated.map(entry => entry.artifact) ?? [])].sort();
      if (input.target !== "READY_FOR_REVIEW" || JSON.stringify([...new Set(input.confirmRechecked)].sort()) !== JSON.stringify(pending)) throw new SchoolAiError("Confirm exactly the checks that were invalidated, while marking the item ready.", 422, "ITEM_RECHECK_MISMATCH");
      question = { ...found, review: { ...found.review!, invalidated: [], history: [...found.review!.history, { state: found.review!.state, actorId: user.userId, at: new Date().toISOString(), note: `Rechecked after edit: ${pending.join(", ")}` }].slice(-60) } };
    }
    const decision = itemReviewTransition(question, { target: input.target, actorId: user.userId, at: new Date().toISOString(), itemRevision: input.itemRevision, note: input.note });
    if (!decision.allowed) throw new SchoolAiError(decision.detail, decision.refusal === "ITEM_REVISION_MISMATCH" ? 409 : 422, `ITEM_${decision.refusal}`);
    // Entering the workbench: every other item gets an explicit recorded state so none is approvable by absence.
    const questions = paper.questions.map(item => item.id === question.id ? { ...item, review: decision.review } : item.review ? item : { ...item, review: { state: itemStateFor(item), itemRevision: 1, invalidated: [], history: [] } as ItemReview });
    const next = await writePaperVersion(tx, user, record, { ...paper, questions });
    await recordStudioAction(tx, user, { action, role, targetId: record.id, targetVersion: next.version, campusId: record.campusId });
    return { version: next.version, state: decision.state, counts: itemStateCounts({ ...paper, questions }) };
  });
}

// ─── Rehearsal ────────────────────────────────────────────────────
export const REHEARSAL_CHECKS = ["KEY_MISSING", "OPTIONS_TOO_FEW", "PROJECTION_LEAK", "SECTION_COUNT", "REPORTED_DEFECT"] as const;
export type RehearsalResult = { check: typeof REHEARSAL_CHECKS[number]; severity: "BLOCKING" | "ADVISORY"; questionIds: string[]; detail: string };
const choice = (question: Question) => question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE";

/** The automated half of a rehearsal: what the candidate will receive, run against the key, before any learner sees it. */
export function automatedRehearsal(paper: PaperData): RehearsalResult[] {
  const results: RehearsalResult[] = [];
  const missingKey = paper.questions.filter(question => choice(question) && (question.type === "SINGLE_CHOICE" ? !question.options.some(option => option.id === question.correctOptionId) : !(question.correctOptionIds ?? []).length));
  if (missingKey.length) results.push({ check: "KEY_MISSING", severity: "BLOCKING", questionIds: missingKey.map(question => question.id), detail: "A choice question has no valid key option." });
  const thin = paper.questions.filter(question => choice(question) && question.options.length < 2);
  if (thin.length) results.push({ check: "OPTIONS_TOO_FEW", severity: "BLOCKING", questionIds: thin.map(question => question.id), detail: "A choice question offers fewer than two options." });
  try { assertKeyFreeProjection(candidatePaper(paper)); } catch (error) { results.push({ check: "PROJECTION_LEAK", severity: "BLOCKING", questionIds: [], detail: error instanceof Error ? error.message.slice(0, 200) : "The candidate projection carries a protected field." }); }
  for (const section of paper.blueprint.sections) {
    const count = paper.questions.filter(question => question.sectionId === section.id).length;
    if (count !== section.questionCount) results.push({ check: "SECTION_COUNT", severity: "BLOCKING", questionIds: [], detail: `Section ${section.title} has ${count} of ${section.questionCount} questions.` });
  }
  return results;
}

export const rehearsalInput = z.object({
  version: z.number().int().positive(),
  findings: z.array(z.object({ questionId: z.string().min(1).max(120), severity: z.enum(["BLOCKING", "ADVISORY"]), detail: z.string().trim().min(5).max(300) }).strict()).max(50),
}).strict();

/** Records one rehearsal of the exact current version: automated checks plus the rehearser's own findings. */
export async function recordRehearsal(user: AuthUser, recordId: string, raw: unknown) {
  const input = rehearsalInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { record, paper, permissions } = await paperRecord(tx, user, recordId);
    if (record.version !== input.version) throw new SchoolAiError("Rehearse the current version. Reload first.", 409);
    const role = await assertStudioAction(user, "RUN_REHEARSAL", studioContext(record), permissions, tx);
    if (input.findings.some(finding => !paper.questions.some(question => question.id === finding.questionId))) throw new SchoolAiError("A finding names a question that is not in this version.", 400);
    const results: RehearsalResult[] = [...automatedRehearsal(paper), ...input.findings.map(finding => ({ check: "REPORTED_DEFECT" as const, severity: finding.severity, questionIds: [finding.questionId], detail: finding.detail }))];
    const row = await tx.schoolAiRehearsal.create({ data: { schoolId: user.schoolId, campusId: record.campusId!, recordId: record.id, paperVersion: record.version, results: json(results), blocking: results.filter(result => result.severity === "BLOCKING").length, actorId: user.userId } });
    await recordStudioAction(tx, user, { action: "RUN_REHEARSAL", role, targetId: record.id, targetVersion: record.version, campusId: record.campusId });
    return { id: row.id, paperVersion: row.paperVersion, results, blocking: row.blocking };
  });
}

/**
 * The evidence drawer (R4.7, R4.8, R6.8): for each item the cited source with its title, the outcome
 * mapping in words, the reuse origin, approvals and the full review history with reviewer names,
 * and every invalidated check with its trigger, actor and time. Keys and rubrics are included only
 * for a reader who holds READ_PROTECTED_KEY (R4.11).
 */
async function itemEvidence(tx: TxClient, user: AuthUser, record: { schoolId: string; campusId: string | null; subjectId: string | null; classId: string | null }, paper: PaperData, permissions: Awaited<ReturnType<typeof loadWorkspacePermissionSnapshot>>) {
  const canReadKey = await assertStudioAction(user, "READ_PROTECTED_KEY", studioContext(record), permissions, tx).then(() => true, () => false);
  const curriculumRow = await tx.schoolAiRevision.findFirst({ where: { schoolId: user.schoolId, recordId: paper.curriculumId, version: paper.curriculumVersion }, select: { data: true } });
  const curriculum = curriculumRow ? curriculumDataSchema.safeParse(curriculumRow.data) : null;
  const outcomes = new Map((curriculum?.success ? curriculum.data.outcomes : []).map(outcome => [outcome.id, outcome.title]));
  const sources = new Map((curriculum?.success ? curriculum.data.sources : []).map(source => [source.id, source.title]));
  const notices = stalenessNotices(paper);
  const actorIds = new Set<string>(notices.map(notice => notice.actorId));
  for (const question of paper.questions) for (const entry of question.review?.history ?? []) actorIds.add(entry.actorId);
  const people = new Map((await tx.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...actorIds] } }, select: { id: true, fullName: true } })).map(person => [person.id, person.fullName]));
  const name = (id: string) => people.get(id) ?? null;
  const byItem = new Map(paper.questions.map(question => [question.id, {
    prompt: question.prompt, type: question.type, marks: question.marks,
    sources: question.sourceRefs.map(ref => ({ title: sources.get(ref.sourceId) ?? null, page: ref.page, excerpt: ref.excerpt })),
    outcomes: question.outcomeIds.map(id => ({ id, title: outcomes.get(id) ?? null })),
    reusedFrom: question.reusedFrom ?? null,
    approvedBy: question.review?.approvedBy ? { ...question.review.approvedBy, name: name(question.review.approvedBy.actorId) } : null,
    reviewHistory: (question.review?.history ?? []).map(entry => ({ state: entry.state, at: entry.at, note: entry.note ?? null, name: name(entry.actorId) })),
    key: canReadKey ? {
      correct: question.options.filter(option => option.id === question.correctOptionId || question.correctOptionIds?.includes(option.id)).map(option => option.text),
      numeric: question.numericKey ?? null, modelAnswer: question.modelAnswer, rubric: question.rubric.map(row => ({ criterion: row.criterion, marks: row.marks })),
    } : null,
  }]));
  return { canReadKey, byItem, notices: notices.map(notice => ({ scope: notice.scope, questionId: notice.questionId, artifact: notice.artifact, change: notice.change, at: notice.at, name: name(notice.actorId) })) };
}

/** What the studio shows: the key-free candidate preview, item states, rehearsals of this version and release blockers. */
export async function releaseReadiness(user: AuthUser, recordId: string) {
  return schoolAiTransaction(user, async tx => {
    const { record, paper, permissions } = await paperRecord(tx, user, recordId);
    const rehearsals = await tx.schoolAiRehearsal.findMany({ where: { schoolId: user.schoolId, recordId: record.id }, orderBy: { createdAt: "desc" }, take: 20 });
    const current = rehearsals.find(row => row.paperVersion === record.version) ?? null;
    const results = (current?.results ?? []) as RehearsalResult[];
    const workbench = paper.questions.some(question => question.review);
    const evidence = await itemEvidence(tx, user, record, paper, permissions);
    return {
      version: record.version, status: record.status, workbench,
      generation: paper.generation, notices: evidence.notices, canReadKey: evidence.canReadKey,
      counts: itemStateCounts(paper), items: paper.questions.map(question => ({ id: question.id, state: itemStateFor(question), itemRevision: question.review?.itemRevision ?? 1, invalidated: [...new Set(question.review?.invalidated.map(entry => entry.artifact) ?? [])], sourceRefs: question.sourceRefs.map(ref => ({ page: ref.page, excerpt: ref.excerpt })), ...evidence.byItem.get(question.id)! })),
      preview: candidatePaper(paper),
      contentHashPrefix: (() => { try { return contentHashPrefix(contentHash(paper)); } catch { return null; } })(),
      rehearsal: current ? { id: current.id, paperVersion: current.paperVersion, results, createdAt: current.createdAt } : null,
      history: rehearsals.map(row => ({ id: row.id, paperVersion: row.paperVersion, blocking: row.blocking, createdAt: row.createdAt })),
      // Codes, not prose: the studio localizes each blocker. A rehearsal blocker carries its check.
      blockers: workbench ? [
        ...releaseBlockers(current ? { ...paper, staleness: { rehearsalValid: true, rehearsalId: current.id } } : paper, []).map(blocker => ({ code: blocker.code, questionIds: blocker.questionIds })),
        ...results.filter(result => result.severity === "BLOCKING").map(result => ({ code: "REHEARSAL_BLOCKER", check: result.check, questionIds: result.questionIds })),
        ...(current ? [] : [{ code: "NOT_REHEARSED", questionIds: [] }]),
      ] as Array<{ code: string; check?: RehearsalResult["check"]; questionIds: string[] }> : [],
    };
  });
}

/**
 * The sealed release decided at assignment. A paper in the item workbench must pass every
 * precondition of `release.ts` (all items approved at their revision, a clean rehearsal of this exact
 * version, separation of duties). A legacy paper that never entered the workbench is still sealed by
 * its content hash and records that no rehearsal was relied on.
 */
export async function sealRelease(tx: TxClient, user: AuthUser, record: { id: string; version: number; createdById: string; campusId: string | null }, paper: PaperData): Promise<{ contentHash: string | null; rehearsalId: string | null }> {
  if (!paper.questions.some(question => question.review)) {
    try { return { contentHash: contentHash(paper), rehearsalId: null }; } catch { throw new SchoolAiError("The candidate paper carries a protected field. Review the paper before assigning it.", 409, "RELEASE_PROTECTED_VALUE_IN_PROJECTION"); }
  }
  const rehearsal = await tx.schoolAiRehearsal.findFirst({ where: { schoolId: user.schoolId, recordId: record.id, paperVersion: record.version }, orderBy: { createdAt: "desc" } });
  const results = (rehearsal?.results ?? []) as RehearsalResult[];
  // The rehearsal row is the authority for this exact version; the paper's own staleness record can only invalidate it.
  // Any content change creates a new version, so a rehearsal of this exact version post-dates every invalidation in it.
  const withRehearsal: PaperData = { ...paper, staleness: rehearsal ? { rehearsalValid: true, rehearsalId: rehearsal.id } : paper.staleness };
  const decision = releasePreconditions({
    rehearsalId: rehearsal?.id ?? null, releasedBy: user.userId, now: new Date(), policy: await resolveScopeDeliveryPolicy(user, record.campusId, tx),
    forms: [{ label: formLabelOf(paper), namedVersion: record.version, reviewedVersion: record.version, paper: withRehearsal, authoredBy: record.createdById, rehearsal: rehearsal ? { rehearsalId: rehearsal.id, revision: rehearsal.paperVersion, blockingChecks: results.filter(result => result.severity === "BLOCKING").map(result => result.check) } : null, unresolvedObservations: [], parityFailures: [] }],
  });
  if (!decision.canRelease) {
    // "No rehearsal named" always accompanies a missing rehearsal; report the more actionable reason.
    const primary = decision.refusals.find(refusal => refusal.code !== "REHEARSAL_NOT_NAMED") ?? decision.refusals[0];
    throw new SchoolAiError(`This paper cannot be released yet. ${decision.refusals.filter(refusal => refusal.code !== "REHEARSAL_NOT_NAMED").slice(0, 5).map(refusal => refusal.detail).join(" ")}`, 409, `RELEASE_${primary.code}`);
  }
  return { contentHash: decision.sealed[0].contentHash, rehearsalId: decision.sealed[0].rehearsalId };
}

// ─── Result release ───────────────────────────────────────────────
/** Learners see moderated results only after an academic approver releases them. */
export async function releaseResults(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async tx => {
    const assignment = await tx.schoolAiExamAssignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
    if (!assignment) throw new SchoolAiError("Exam not found.", 404);
    if (!isSchoolAiManager(user)) throw new SchoolAiError("Only an academic approver can release results.", 403, "STUDIO_ACTION_REFUSED");
    const role = await assertStudioAction(user, "RELEASE_RESULT", { schoolId: user.schoolId, campusId: assignment.campusId, classId: assignment.classId, assignmentId }, undefined, tx);
    if (assignment.resultsReleasedAt) return { resultsReleasedAt: assignment.resultsReleasedAt };
    if (assignment.endsAt > new Date()) throw new SchoolAiError("Results can be released after the exam window closes.", 409);
    const pending = await tx.schoolAiExamAttempt.count({ where: { schoolId: user.schoolId, assignmentId, status: "SUBMITTED" } });
    if (pending) throw new SchoolAiError(`${pending} submitted attempt${pending === 1 ? " is" : "s are"} still awaiting moderation.`, 409, "RESULTS_AWAITING_MODERATION");
    const now = new Date();
    await tx.schoolAiExamAssignment.update({ where: { id: assignmentId }, data: { resultsReleasedAt: now, resultsReleasedById: user.userId } });
    await recordStudioAction(tx, user, { action: "RELEASE_RESULT", role, targetId: assignmentId, targetVersion: assignment.version, campusId: assignment.campusId });
    return { resultsReleasedAt: now };
  });
}
