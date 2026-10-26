/**
 * SKO-501 (plan F6): moderation beside the Seal.
 *
 * - The slot's moderator (never the author) reads the paper beside a deterministic conformance report and
 *   signs or returns it with comments; the decision is bound to the paper's content hash.
 * - The approver (principal or academic lead; the author's head of department when the school's chain
 *   policy says `sealedBy: HEAD_OF_DEPARTMENT`) seals it: only after a signature on the current content and
 *   a rehearsal with no blocking finding. Sealing approves the record if needed, fixes the sealed version
 *   and hash on the slot, and records the sitting date (a later date change reads STALE).
 * - The office prints only the sealed version and only while its hash still matches the seal.
 */
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canLeadAcademics } from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import { writeAuditEvent } from "@/lib/audit-events";
import { curriculumDataSchema, paperDataSchema, type PaperData } from "./assessment";
import { headsOfAuthor } from "./department-heads";
import { examChainPolicy } from "./exam-authority";
import { conformanceBlocking, conformanceReport, signatureHolds, MODERATION_DECISIONS } from "./moderation";
import { assertExamOffice, getSlot } from "./paper-slot-service";
import { buildCandidatePaperHtml } from "./paper-print";
import { contentHash, contentHashPrefix } from "./release";
import { resolveScopeDeliveryPolicy, updateWorkspaceRecordInTransaction } from "./repository";
import { overlayTeachingLine } from "./teaching-progress-service";
import { schoolAiTransaction } from "./transaction";
import { itemReviewTransition, itemStateFor } from "./item-review";
import { writePaperVersion } from "./exam-release-service";
import { assertWorkspacePermission, loadWorkspacePermissionSnapshot } from "./access";
import { assertSolverAllowsRelease, paperSolverFindings } from "./semantic-release";

const hashOf = (paper: PaperData) => { try { return contentHash(paper); } catch { return null; } };

async function slotPaper(user: AuthUser, slotId: string, tx: TxClient) {
  const { row, view, office } = await getSlot(user, slotId, tx);
  if (!row.paperRecordId) throw new ApiError("No paper has been written for this request yet.", 409);
  const record = await tx.schoolAiRecord.findFirst({ where: { id: row.paperRecordId, schoolId: user.schoolId, campusId: row.campusId, kind: "PAPER" } });
  if (!record) throw new ApiError("The requested paper is no longer available.", 404);
  const paper = paperDataSchema.parse(record.data);
  return { row, view, office, record, paper, hash: hashOf(paper) };
}

async function latestDecision(tx: TxClient, schoolId: string, slotId: string) {
  return tx.examPaperModeration.findFirst({ where: { schoolId, slotId }, orderBy: { createdAt: "desc" } });
}

/** The moderator's view: the paper (with its key: moderation needs it), the report and the decision history. */
export async function getModeration(user: AuthUser, slotId: string) {
  return schoolAiTransaction(user, async tx => {
    const { row, view, record, paper, hash } = await slotPaper(user, slotId, tx);
    const source = await tx.schoolAiRecord.findFirst({ where: { id: paper.curriculumId, schoolId: user.schoolId, kind: "CURRICULUM" }, select: { id: true, data: true } });
    const curriculum = source ? await overlayTeachingLine(tx, user.schoolId, source.id, curriculumDataSchema.parse(source.data)) : null;
    const report = conformanceReport({ paper, request: { totalMarks: row.totalMarks, durationMinutes: row.durationMinutes, languages: view.languages }, curriculum });
    const history = await tx.examPaperModeration.findMany({ where: { schoolId: user.schoolId, slotId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, decision: true, comments: true, paperVersion: true, contentHash: true, moderatorId: true, createdAt: true } });
    const titles = new Map((curriculum?.outcomes ?? []).map(outcome => [outcome.id, outcome.title]));
    let canSeal = false;
    if (!row.sealedAt && !row.cancelledAt && signatureHolds(history[0], hash)) {
      try { await assertSealAuthority(user, tx, row.campusId, row.authorUserId); canSeal = true; }
      catch (error) { if (!(error instanceof ApiError) || error.status !== 403) throw error; }
    }
    return {
      slot: view, paperVersion: record.version, paperStatus: record.status, contentHashPrefix: hash ? contentHashPrefix(hash) : null,
      canSeal, sealedAt: row.sealedAt?.toISOString() ?? null,
      canDecide: !row.sealedAt && !row.cancelledAt && view.status === "READY_FOR_REVIEW" && row.moderatorUserId === user.userId && row.authorUserId !== user.userId,
      report, blocking: conformanceBlocking(report).map(check => check.code),
      items: paper.questions.map((question, index) => ({ id: question.id, number: index + 1, type: question.type, marks: question.marks, prompt: question.prompt, options: question.options ?? [], correctOptionId: question.correctOptionId ?? null, correctOptionIds: question.correctOptionIds ?? null, modelAnswer: question.modelAnswer ?? null, state: itemStateFor(question), outcomes: question.outcomeIds.map(id => titles.get(id) ?? id) })),
      history: history.map(entry => ({ ...entry, createdAt: entry.createdAt.toISOString(), current: Boolean(hash && entry.contentHash === hash) })),
    };
  });
}

export const moderationDecisionInput = z.strictObject({
  paperVersion: z.number().int().positive(),
  decision: z.enum(MODERATION_DECISIONS),
  comments: z.array(z.strictObject({ questionId: z.string().min(1).max(120).optional(), text: z.string().trim().min(1).max(2000) })).max(100).default([]),
});

export async function decideModeration(user: AuthUser, slotId: string, raw: unknown) {
  const input = moderationDecisionInput.parse(raw);
  if (input.decision === "RETURNED" && !input.comments.length) throw new ApiError("Say what needs to change before returning the paper.", 422);
  const result = await schoolAiTransaction(user, async tx => {
    const { row, view, record, paper, hash } = await slotPaper(user, slotId, tx);
    await assertWorkspacePermission(user, "exams", "edit", await loadWorkspacePermissionSnapshot(user, tx));
    if (row.moderatorUserId !== user.userId) throw new ApiError("Only this paper's moderator records the moderation decision.", 403);
    if (row.authorUserId === user.userId) throw new ApiError("Authors cannot moderate their own paper.", 403);
    if (row.cancelledAt || row.sealedAt) throw new ApiError("This paper request is closed for moderation.", 409);
    if (record.version !== input.paperVersion) throw new ApiError("The paper changed meanwhile. Reload and review the current version.", 409);
    if (view.status !== "READY_FOR_REVIEW") throw new ApiError("The author must submit the current paper for moderation.", 409);
    if (!hash) throw new ApiError("The paper carries a protected value in its candidate view. Return it to the author.", 409);
    if (!["IN_REVIEW", "APPROVED"].includes(record.status)) throw new ApiError("The author has not sent this paper for review yet.", 409);
    const source = await tx.schoolAiRecord.findFirst({ where: { id: paper.curriculumId, schoolId: user.schoolId, kind: "CURRICULUM" }, select: { id: true, data: true } });
    const curriculum = source ? await overlayTeachingLine(tx, user.schoolId, source.id, curriculumDataSchema.parse(source.data)) : null;
    const report = conformanceReport({ paper, request: { totalMarks: row.totalMarks, durationMinutes: row.durationMinutes, languages: view.languages }, curriculum });
    if (input.decision === "SIGNED" && conformanceBlocking(report).length) throw new ApiError("This paper fails a blocking check. Return it with comments instead.", 422);
    if (input.decision === "SIGNED") assertSolverAllowsRelease(await paperSolverFindings(tx, user, record, paper));
    // The moderator's signature is the item approval in the exam chain: every ready item is approved at its
    // revision by the moderator. Review records sit outside the content hash, so the signature still binds.
    let signedVersion = record.version;
    if (input.decision === "SIGNED") {
      const at = new Date().toISOString();
      const questions = paper.questions.map(question => {
        if (itemStateFor(question) !== "READY_FOR_REVIEW" || !question.review) return question;
        const step = itemReviewTransition(question, { target: "APPROVED", actorId: user.userId, at, itemRevision: question.review.itemRevision, note: "Approved in moderation" });
        if (!step.allowed) throw new ApiError(`Question ${question.id} cannot be approved: ${step.detail}`, 422);
        return { ...question, review: step.review };
      });
      if (questions.some((question, index) => question !== paper.questions[index])) {
        const next = await writePaperVersion(tx, user, { id: record.id, version: record.version, status: record.status, campusId: record.campusId, title: record.title }, { ...paper, questions });
        if (hashOf(paperDataSchema.parse(next.data)) !== hash) throw new ApiError("Approving the items changed the paper's content. Nothing was signed.", 409);
        signedVersion = next.version;
        await tx.examPaperSlot.updateMany({ where: { id: row.id, schoolId: user.schoolId, sealedAt: null }, data: { paperVersion: signedVersion } });
      }
    }
    const decision = await tx.examPaperModeration.create({ data: { schoolId: user.schoolId, campusId: row.campusId, slotId: row.id, paperRecordId: record.id, paperVersion: signedVersion, contentHash: hash, decision: input.decision, comments: input.comments, conformance: report as unknown as object, moderatorId: user.userId } });
    await writeAuditEvent(tx, user, { table: "exam_paper_moderations", recordId: decision.id, action: "CREATE", campusId: row.campusId, after: { slotId: row.id, decision: input.decision, paperVersion: record.version, hashPrefix: contentHashPrefix(hash), comments: input.comments.length } });
    const moderator = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { fullName: true } });
    return { authorUserId: row.authorUserId, campusId: row.campusId, view, moderatorName: moderator?.fullName ?? "", decision: input.decision };
  });
  if (result.authorUserId) notify("EXAM_PAPER_MODERATED", { schoolId: user.schoolId, campusId: result.campusId, actorId: user.userId, recipientIds: [result.authorUserId], slotId, subjectName: result.view.subjectName, gradeName: result.view.gradeName, sessionTitle: result.view.sessionTitle, moderatorName: result.moderatorName, decision: result.decision });
  return { decision: result.decision };
}

export const sealInput = z.strictObject({ paperVersion: z.number().int().positive(), reason: z.string().trim().max(500).optional() });

/** May this person seal? The academic lead (managers), or the author's head when the school delegates sealing. */
async function assertSealAuthority(user: AuthUser, tx: TxClient, campusId: string, authorUserId: string | null) {
  // SKO-501 (authority narrowing, plan 4.8): the academic lead seals — the principal, or a campus admin only
  // while the campus has no principal; a non-academic manager no longer does.
  if (await canLeadAcademics(user, campusId)) return "MANAGER" as const;
  const policy = examChainPolicy((await resolveScopeDeliveryPolicy(user, campusId, tx)).policy);
  if (policy.sealedBy === "HEAD_OF_DEPARTMENT" && authorUserId && (await headsOfAuthor(tx, user.schoolId, authorUserId)).includes(user.userId)) return "HEAD_OF_DEPARTMENT" as const;
  throw new ApiError("The principal or academic lead seals term papers.", 403);
}

export async function sealSlot(user: AuthUser, slotId: string, raw: unknown) {
  const input = sealInput.parse(raw ?? {});
  return schoolAiTransaction(user, async tx => {
    const { row, record, paper, hash } = await slotPaper(user, slotId, tx);
    await assertWorkspacePermission(user, "exams", "edit", await loadWorkspacePermissionSnapshot(user, tx));
    const authority = await assertSealAuthority(user, tx, row.campusId, row.authorUserId);
    if (row.cancelledAt) throw new ApiError("This paper request is withdrawn.", 409);
    if (row.sealedAt) throw new ApiError("This paper is already sealed.", 409);
    if (record.version !== input.paperVersion) throw new ApiError("The paper changed meanwhile. Reload and seal the current version.", 409);
    assertSolverAllowsRelease(await paperSolverFindings(tx, user, record, paper));
    const latest = await latestDecision(tx, user.schoolId, row.id);
    if (!signatureHolds(latest, hash)) throw new ApiError(latest?.decision === "SIGNED" ? "The paper changed after it was moderated. It needs moderating again before the Seal." : "The paper needs its moderator's signature before the Seal.", 409);
    const rehearsal = await tx.schoolAiRehearsal.findFirst({ where: { schoolId: user.schoolId, recordId: record.id, paperVersion: { gte: latest!.paperVersion, lte: record.version } }, orderBy: [{ paperVersion: "desc" }, { createdAt: "desc" }], select: { id: true, results: true } });
    // Current solver evidence was checked above. Its historical severity may differ after an approved policy change.
    const rehearsalResults = (rehearsal?.results ?? []) as Array<{ check: string; severity: string }>;
    if (!rehearsal || rehearsalResults.some(result => result.check !== "SOLVER_DISAGREEMENT" && result.severity === "BLOCKING")) throw new ApiError("Rehearse the moderated paper (with no blocking finding) before the Seal.", 409);
    // Sealing approves the record when it is still in review; the content (and its hash) do not change.
    let version = record.version;
    if (record.status !== "APPROVED") version = (await updateWorkspaceRecordInTransaction(user, record.id, { version: record.version, action: "approve" }, tx, undefined, { asDelegatedSealer: authority === "HEAD_OF_DEPARTMENT" })).version;
    const sitting = row.schedules?.[0]?.date ?? (await tx.examSchedule.findFirst({ where: { schoolId: user.schoolId, paperSlotId: row.id }, orderBy: { date: "asc" }, select: { date: true } }))?.date ?? null;
    const moderator = await tx.user.findFirst({ where: { id: latest!.moderatorId, schoolId: user.schoolId }, select: { fullName: true } });
    const reason = input.reason || `Moderated by ${moderator?.fullName ?? "the moderator"}`;
    const updated = await tx.examPaperSlot.updateMany({ where: { id: row.id, schoolId: user.schoolId, sealedAt: null }, data: { sealedAt: new Date(), sealHash: hash, sealedById: user.userId, sealReason: reason, paperVersion: version, sealedSittingDate: sitting, version: { increment: 1 } } });
    if (updated.count !== 1) throw new ApiError("This paper was sealed meanwhile.", 409);
    await writeAuditEvent(tx, user, { table: "exam_paper_slots", recordId: row.id, action: "APPROVE", campusId: row.campusId, after: { sealed: true, authority, paperVersion: version, hashPrefix: contentHashPrefix(hash!), rehearsalId: rehearsal.id } });
    return { sealedAt: new Date().toISOString(), paperVersion: version, hashPrefix: contentHashPrefix(hash!), rehearsalId: rehearsal.id };
  });
}

/** The office's print of the sealed version; refused once the record moved on or the hash differs. */
export async function printSealedSlot(user: AuthUser, slotId: string): Promise<string> {
  return schoolAiTransaction(user, async tx => {
    const { row, record, paper, hash } = await slotPaper(user, slotId, tx);
    await assertExamOffice(user, row.campusId, tx);
    if (row.cancelledAt) throw new ApiError("This paper request is withdrawn.", 409);
    if (!row.sealedAt || !row.sealHash) throw new ApiError("Seal the paper before printing it.", 409);
    if (row.compromisedAt) throw new ApiError("This paper was reported compromised. Do not print it.", 409);
    if (record.status !== "APPROVED" || record.version !== row.paperVersion || hash !== row.sealHash) throw new ApiError("The paper changed after it was sealed. It cannot be printed under this seal.", 409);
    return buildCandidatePaperHtml(paper, record.version, contentHashPrefix(row.sealHash));
  });
}

export const compromiseInput = z.strictObject({ reason: z.string().trim().min(5).max(1000) });
/** Report a sealed paper compromised: it can no longer be printed; the office cancels the sitting or uses a reserve. */
export async function reportCompromise(user: AuthUser, slotId: string, raw: unknown) {
  const input = compromiseInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { row } = await getSlot(user, slotId, tx);
    await assertExamOffice(user, row.campusId, tx);
    if (!row.sealedAt) throw new ApiError("Only a sealed paper can be reported compromised.", 409);
    if (row.compromisedAt) throw new ApiError("This paper is already reported compromised.", 409);
    await tx.examPaperSlot.update({ where: { id: row.id }, data: { compromisedAt: new Date(), compromiseReason: input.reason, version: { increment: 1 } } });
    await writeAuditEvent(tx, user, { table: "exam_paper_slots", recordId: row.id, action: "UPDATE", campusId: row.campusId, after: { compromised: true, hashPrefix: row.sealHash ? row.sealHash.slice(0, 16) : null } });
    return { compromisedAt: new Date().toISOString() };
  });
}

export const corrigendumInput = z.strictObject({ text: z.string().trim().min(5).max(1000), questionId: z.string().min(1).max(120).optional() });
/**
 * A corrigendum: a correction to a sealed paper, never a reprint. It is recorded against the seal (read out
 * in every room from the Papers step) and, for any linked online sitting with candidates writing now, issued
 * as a sitting-wide notice.
 */
export async function recordCorrigendum(user: AuthUser, slotId: string, raw: unknown) {
  const input = corrigendumInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { row } = await getSlot(user, slotId, tx);
    await assertExamOffice(user, row.campusId, tx);
    if (!row.sealedAt || !row.sealHash) throw new ApiError("A corrigendum applies to a sealed paper.", 409);
    const current = await tx.examPaperSlot.findFirstOrThrow({ where: { id: row.id, schoolId: user.schoolId }, select: { corrigenda: true } });
    const list = Array.isArray(current.corrigenda) ? current.corrigenda as Array<Record<string, unknown>> : [];
    if (list.length >= 20) throw new ApiError("This paper already has 20 corrigenda.", 409);
    const entry = { id: crypto.randomUUID(), text: input.text, ...(input.questionId ? { questionId: input.questionId } : {}), at: new Date().toISOString(), byId: user.userId, hashPrefix: row.sealHash.slice(0, 16) };
    await tx.examPaperSlot.update({ where: { id: row.id }, data: { corrigenda: [...list, entry] as unknown as object, version: { increment: 1 } } });
    let pushed = 0;
    const sittings = await tx.schoolAiExamAssignment.findMany({ where: { schoolId: user.schoolId, campusId: row.campusId, paperSlotId: row.id, status: "ACTIVE" }, select: { id: true } });
    for (const sitting of sittings) {
      const live = await tx.schoolAiExamAttempt.count({ where: { schoolId: user.schoolId, assignmentId: sitting.id, status: "IN_PROGRESS" } });
      if (!live) continue;
      const last = await tx.schoolAiExamClarification.findFirst({ where: { assignmentId: sitting.id, schoolId: user.schoolId }, orderBy: { version: "desc" }, select: { version: true } });
      await tx.schoolAiExamClarification.create({ data: { schoolId: user.schoolId, campusId: row.campusId, assignmentId: sitting.id, version: (last?.version ?? 0) + 1, questionId: input.questionId ?? null, text: input.text, audience: { kind: "SITTING" }, issuedById: user.userId } });
      pushed += 1;
    }
    await writeAuditEvent(tx, user, { table: "exam_paper_slots", recordId: row.id, action: "UPDATE", campusId: row.campusId, after: { corrigendum: entry.id, hashPrefix: entry.hashPrefix, pushedToSittings: pushed } });
    return { corrigendum: entry, pushedToSittings: pushed };
  });
}
