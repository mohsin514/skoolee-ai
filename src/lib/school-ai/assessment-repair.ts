import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { refreshVersion, versionTransaction } from "@/lib/academic/report-versions";
import { gradeForMark } from "@/lib/academic/grade-calculator";
import { liveGuardianRelationshipWhere } from "@/lib/parent/guardian-query";
import { schoolAiTransaction } from "./transaction";
import { scopedAssignment, staffExamAccess } from "./exam-service";
import { isSchoolAiManager } from "./access";
import { applyResultRevision } from "./exam-results";
import { correctedExamPaper, examKeyCorrectionSchema, examReviewSchema, responsesSchema, scoreObjectiveResponses } from "./exam";
import { convertGradebookMark, gradebookPublicationSchema } from "./exam-gradebook";
import { paperDataSchema, type PaperData } from "./assessment";

/**
 * SKO-472: the Assessment Repair Map. When a released objective question turns out to be wrong, the
 * repair enumerates — from stored references and versions only — every record that depends on it, and
 * hands each change to the owner that already governs it: result revisions (exam results), gradebook
 * marks and report successors (report versions), learning actions (marked stale until reviewed) and a
 * family correction notice. Nothing is guessed by a model. A preview is pinned by a fingerprint of every
 * record it read; an independent reviewer approves; each step commits with its own receipt entry so an
 * interrupted repair resumes only the steps that did not finish.
 */

const id = z.string().trim().min(1).max(120);
export const repairPreviewSchema = z.object({ correction: examKeyCorrectionSchema }).strict();
export const repairProposeSchema = z.object({
  correction: examKeyCorrectionSchema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(2000), publicExplanation: z.string().trim().min(1).max(1000),
  idempotencyKey: z.string().uuid(),
}).strict();
export const repairDecisionSchema = z.object({ repairId: id, version: z.number().int().positive(), decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().min(1).max(2000) }).strict();
export const repairResumeSchema = z.object({ repairId: id, version: z.number().int().positive() }).strict();

export type RepairGroup = "CHANGED" | "NEEDS_REVIEW" | "UNCHANGED" | "ALREADY_DELIVERED" | "UNTRACKED";
export interface ImpactRow { group: RepairGroup; kind: string; recordId: string | null; studentId: string | null; label: string; before: string | null; after: string | null; note: string | null }
export type RepairStep =
  | { key: string; type: "RESULT"; attemptId: string; studentId: string; fromVersion: number; beforeTotal: number; afterTotal: number }
  | { key: string; type: "MARK"; markId: string; studentId: string; correctionVersion: number; before: number; after: number; grade: string }
  | { key: string; type: "REPORT"; reportCardId: string; studentId: string }
  | { key: string; type: "ACTION_STALE"; planId: string; studentId: string | null }
  | { key: string; type: "NOTICE"; studentId: string; recipientIds: string[] };
export interface ReceiptEntry { key: string; status: "APPLIED" | "FAILED"; at: string; detail: string }

const json = (value: unknown) => value as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const OBJECTIVE = new Set(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "NUMERIC"]);

function keyLabel(paper: PaperData, questionId: string, correction?: z.infer<typeof examKeyCorrectionSchema>) {
  const question = paper.questions.find(q => q.id === questionId) as (PaperData["questions"][number] & { correctOptionIds?: string[]; numericKey?: { value: number; tolerance: number } }) | undefined;
  if (!question) return "";
  const optionText = (optionId: string | null | undefined) => question.options.find(o => o.id === optionId)?.text ?? optionId ?? "—";
  if (correction?.numericKey ?? question.numericKey) { const key = correction?.numericKey ?? question.numericKey!; return `${key.value} ± ${key.tolerance}`; }
  if (correction?.correctOptionIds ?? question.correctOptionIds) return (correction?.correctOptionIds ?? question.correctOptionIds ?? []).map(optionText).join(", ");
  return optionText(correction?.correctOptionId ?? question.correctOptionId);
}

/** Reads every dependent record within the assignment's campus and builds the impact, plan and fingerprint. */
async function analyse(tx: TxClient, user: AuthUser, assignmentId: string, correction: z.infer<typeof examKeyCorrectionSchema>) {
  const { assignment, paper } = await scopedAssignment(user, assignmentId, tx);
  await staffExamAccess(user, assignment, "view", tx);
  if (!assignment.resultsReleasedAt) throw new ApiError("Results are not released yet. Correct the key in review before release instead.", 409);
  const question = paper.questions.find(q => q.id === correction.questionId);
  if (!question) throw new ApiError("Choose a question from this paper.", 400);
  if (!OBJECTIVE.has(question.type)) throw new ApiError("Only an objective question's key can be repaired here. Use a result correction for written answers.", 400);
  let corrected: PaperData;
  try { corrected = correctedExamPaper(paper, [correction]); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Invalid corrected key.", 422); }
  const campusId = assignment.campusId, schoolId = user.schoolId;

  const attempts = await tx.schoolAiExamAttempt.findMany({ where: { assignmentId, schoolId, campusId }, select: { id: true, studentId: true, status: true, reviewVersion: true, review: true, responses: true }, orderBy: { id: "asc" } });
  const students = new Map((await tx.student.findMany({ where: { schoolId, campusId, id: { in: attempts.map(a => a.studentId) } }, select: { id: true, fullName: true, rollNo: true, studentUserId: true } })).map(s => [s.id, s]));
  const name = (studentId: string | null) => studentId ? students.get(studentId)?.fullName ?? "" : "";
  const impact: ImpactRow[] = [];
  const steps: RepairStep[] = [];
  const changed = new Map<string, { attemptId: string; studentId: string; before: number; after: number }>();
  const newReviews = new Map<string, z.infer<typeof examReviewSchema>>();

  for (const attempt of attempts) {
    if (attempt.status !== "REVIEWED" || !attempt.review) {
      impact.push({ group: "UNCHANGED", kind: "RESULT", recordId: attempt.id, studentId: attempt.studentId, label: name(attempt.studentId), before: null, after: null, note: "Not reviewed yet; it is scored against the corrected key when reviewed." });
      continue;
    }
    const stored = attempt.review as { marks: unknown; note: unknown; keyCorrections?: unknown };
    const review = examReviewSchema.parse({ marks: stored.marks, note: stored.note, keyCorrections: stored.keyCorrections });
    const before = review.marks.reduce((sum, row) => sum + row.marks, 0);
    const scored = scoreObjectiveResponses(corrected, responsesSchema.parse(attempt.responses)).questions.find(row => row.questionId === correction.questionId)?.marks ?? 0;
    const marks = review.marks.map(row => row.questionId === correction.questionId ? { ...row, marks: scored } : row);
    const after = marks.reduce((sum, row) => sum + row.marks, 0);
    if (after === before) { impact.push({ group: "UNCHANGED", kind: "RESULT", recordId: attempt.id, studentId: attempt.studentId, label: name(attempt.studentId), before: String(before), after: String(after), note: null }); continue; }
    const keys = new Map((review.keyCorrections ?? []).map(row => [row.questionId, row])); keys.set(correction.questionId, correction);
    newReviews.set(attempt.id, { ...review, keyCorrections: [...keys.values()], marks });
    changed.set(attempt.studentId, { attemptId: attempt.id, studentId: attempt.studentId, before, after });
    impact.push({ group: "CHANGED", kind: "RESULT", recordId: attempt.id, studentId: attempt.studentId, label: name(attempt.studentId), before: String(before), after: String(after), note: `Result version ${attempt.reviewVersion} → ${attempt.reviewVersion + 1}` });
    impact.push({ group: "ALREADY_DELIVERED", kind: "RELEASED_RESULT", recordId: attempt.id, studentId: attempt.studentId, label: name(attempt.studentId), before: String(before), after: null, note: "The released result was already visible to the learner. It stays in the history; the corrected version follows." });
    steps.push({ key: `RESULT:${attempt.id}`, type: "RESULT", attemptId: attempt.id, studentId: attempt.studentId, fromVersion: attempt.reviewVersion, beforeTotal: before, afterTotal: after });
  }

  // Gradebook marks and report cards exist only when the reviewed results were published to an exam.
  const publication = assignment.gradebookPublication ? gradebookPublicationSchema.safeParse(assignment.gradebookPublication) : null;
  const marksRead: { id: string; marksObtained: number; correctionVersion: number }[] = [];
  const reportsRead: { id: string; currentVersionId: string | null; publishedVersionId: string | null }[] = [];
  if (publication?.success) {
    const pub = publication.data;
    const rows = pub.rows.filter(row => changed.has(row.studentId));
    const marks = await tx.mark.findMany({ where: { schoolId, campusId, id: { in: rows.map(r => r.markId) } }, select: { id: true, studentId: true, marksObtained: true, correctionVersion: true, isAbsent: true } });
    marksRead.push(...marks.map(m => ({ id: m.id, marksObtained: m.marksObtained ?? 0, correctionVersion: m.correctionVersion })));
    for (const row of rows) {
      const mark = marks.find(m => m.id === row.markId), result = changed.get(row.studentId)!;
      if (!mark) { impact.push({ group: "NEEDS_REVIEW", kind: "MARK", recordId: row.markId, studentId: row.studentId, label: name(row.studentId), before: null, after: null, note: "The published gradebook mark is no longer available; enter it through marks entry." }); continue; }
      const target = convertGradebookMark(result.after, pub.sourceMaximum, pub.targetMaximum, pub.conversion);
      if (target === null) { impact.push({ group: "NEEDS_REVIEW", kind: "MARK", recordId: mark.id, studentId: row.studentId, label: name(row.studentId), before: String(mark.marksObtained), after: null, note: "The corrected total cannot be converted exactly; correct the mark through Record corrections." }); continue; }
      if (target === mark.marksObtained) { impact.push({ group: "UNCHANGED", kind: "MARK", recordId: mark.id, studentId: row.studentId, label: name(row.studentId), before: String(mark.marksObtained), after: String(target), note: `${pub.examTitle} · ${pub.subjectName}` }); continue; }
      impact.push({ group: "CHANGED", kind: "MARK", recordId: mark.id, studentId: row.studentId, label: name(row.studentId), before: String(mark.marksObtained), after: String(target), note: `${pub.examTitle} · ${pub.subjectName}` });
      steps.push({ key: `MARK:${mark.id}`, type: "MARK", markId: mark.id, studentId: row.studentId, correctionVersion: mark.correctionVersion, before: mark.marksObtained ?? 0, after: target, grade: gradeForMark(target, pub.targetMaximum, pub.thresholds) });
    }
    const reports = await tx.reportCard.findMany({ where: { schoolId, campusId, examId: pub.examId, studentId: { in: [...changed.keys()] } }, select: { id: true, studentId: true, currentVersionId: true, publishedVersionId: true, status: true } });
    reportsRead.push(...reports.map(r => ({ id: r.id, currentVersionId: r.currentVersionId, publishedVersionId: r.publishedVersionId })));
    for (const report of reports) {
      if (report.publishedVersionId) impact.push({ group: "ALREADY_DELIVERED", kind: "REPORT", recordId: report.id, studentId: report.studentId, label: name(report.studentId), before: null, after: null, note: "The published report stays as issued. A successor version is prepared for report approval." });
      impact.push({ group: "NEEDS_REVIEW", kind: "REPORT", recordId: report.id, studentId: report.studentId, label: name(report.studentId), before: null, after: null, note: "A successor version is prepared; it is published only through report approval." });
      steps.push({ key: `REPORT:${report.id}`, type: "REPORT", reportCardId: report.id, studentId: report.studentId });
    }
  } else {
    impact.push({ group: "UNTRACKED", kind: "GRADEBOOK", recordId: null, studentId: null, label: "Gradebook", before: null, after: null, note: "These results were not published to the gradebook, so no marks or reports depend on them." });
  }

  // Learning actions that cite a changed attempt, or that came from evidence on this question.
  const decisions = await tx.itemEvidenceDecision.findMany({ where: { schoolId, campusId, paperId: assignment.paperId, paperVersion: assignment.paperVersion, questionId: correction.questionId }, select: { id: true, statement: true, actionPlanIds: true, status: true } });
  for (const decision of decisions) impact.push({ group: "NEEDS_REVIEW", kind: "ITEM_EVIDENCE", recordId: decision.id, studentId: null, label: decision.statement.slice(0, 160), before: null, after: null, note: "This evidence decision was made with the original key." });
  const decisionPlanIds = new Set(decisions.flatMap(d => Array.isArray(d.actionPlanIds) ? (d.actionPlanIds as unknown[]).map(String) : []));
  const changedAttemptIds = new Set([...changed.values()].map(c => c.attemptId));
  const plans = await tx.interventionPlan.findMany({ where: { schoolId, campusId, status: { in: ["DRAFT", "ACTIVE"] }, OR: [{ id: { in: [...decisionPlanIds] } }, { studentId: { in: [...changed.keys()] } }] }, select: { id: true, studentId: true, title: true, version: true, status: true, evidenceRefs: true } });
  const plansRead: { id: string; version: number }[] = [];
  for (const plan of plans) {
    const refs = Array.isArray(plan.evidenceRefs) ? plan.evidenceRefs as { kind?: string; refId?: string }[] : [];
    const cites = decisionPlanIds.has(plan.id) || refs.some(ref => ref.kind === "EXAM_ATTEMPT" && changedAttemptIds.has(String(ref.refId)));
    if (!cites) continue; // unrelated actions for the same learner stay untouched
    plansRead.push({ id: plan.id, version: plan.version });
    impact.push({ group: "NEEDS_REVIEW", kind: "LEARNING_ACTION", recordId: plan.id, studentId: plan.studentId, label: `${plan.title}${plan.studentId ? ` · ${name(plan.studentId)}` : ""}`, before: null, after: null, note: "It cites evidence that this repair changes. It is marked for review, not edited." });
    steps.push({ key: `ACTION_STALE:${plan.id}`, type: "ACTION_STALE", planId: plan.id, studentId: plan.studentId });
  }

  // Practice built from this released item, and formative checks scheduled from that practice.
  const practice = await tx.schoolAiRecord.findMany({ where: { schoolId, campusId, kind: "PRACTICE", status: { not: "ARCHIVED" } }, select: { id: true, title: true, data: true } });
  const practiceIds: string[] = [];
  for (const record of practice) {
    const items = (record.data as { items?: { sourceAssignmentId?: string; questionId?: string }[] }).items ?? [];
    if (!items.some(item => item.sourceAssignmentId === assignmentId && item.questionId === correction.questionId)) continue;
    practiceIds.push(record.id);
    impact.push({ group: "NEEDS_REVIEW", kind: "PRACTICE", recordId: record.id, studentId: null, label: record.title, before: null, after: null, note: "This practice set reuses the question. Check its key before learners use it again." });
  }
  if (practiceIds.length) {
    const checks = await tx.schoolAiRecord.findMany({ where: { schoolId, campusId, kind: "PAPER" }, select: { id: true, title: true, data: true } });
    for (const check of checks) if (practiceIds.includes(String((check.data as { formativeOf?: { practiceRecordId?: string } }).formativeOf?.practiceRecordId))) impact.push({ group: "NEEDS_REVIEW", kind: "FORMATIVE_CHECK", recordId: check.id, studentId: null, label: check.title, before: null, after: null, note: "A formative check copied from that practice." });
  }

  // The family correction notice: the learner and guardians with a current learning-records grant.
  for (const result of changed.values()) {
    const guardians = await tx.guardianRelationship.findMany({ where: { ...liveGuardianRelationshipWhere(null, "learningRecords", new Date(), schoolId), studentId: result.studentId }, select: { guardianUserId: true, guardian: { select: { fullName: true } } } });
    const learner = students.get(result.studentId)?.studentUserId;
    const recipientIds = [...new Set([...(learner ? [learner] : []), ...guardians.map(g => g.guardianUserId).filter((x): x is string => !!x)])].sort();
    if (!recipientIds.length) { impact.push({ group: "UNTRACKED", kind: "NOTICE", recordId: null, studentId: result.studentId, label: name(result.studentId), before: null, after: null, note: "No learner account or guardian with a current grant; tell the family another way." }); continue; }
    impact.push({ group: "CHANGED", kind: "NOTICE", recordId: null, studentId: result.studentId, label: name(result.studentId), before: null, after: `${recipientIds.length}`, note: guardians.map(g => g.guardian?.fullName ?? "").filter(Boolean).join(", ") || null });
    steps.push({ key: `NOTICE:${result.studentId}`, type: "NOTICE", studentId: result.studentId, recipientIds });
  }
  impact.push({ group: "UNTRACKED", kind: "EXTERNAL", recordId: null, studentId: null, label: "Printed or downloaded copies", before: null, after: null, note: "Copies outside Skoolee are not tracked and cannot be recalled." });

  // Steps run in this order: results first, then marks, reports, actions and finally the notice.
  const order = ["RESULT", "MARK", "REPORT", "ACTION_STALE", "NOTICE"];
  steps.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const fingerprint = hash({ assignmentId, paperVersion: assignment.paperVersion, released: assignment.resultsReleasedAt?.toISOString(), correction, attempts: attempts.map(a => [a.id, a.status, a.reviewVersion]), marks: marksRead, reports: reportsRead, plans: plansRead, publication: publication?.success ? publication.data.id : null });
  const counts = Object.fromEntries((["CHANGED", "NEEDS_REVIEW", "UNCHANGED", "ALREADY_DELIVERED", "UNTRACKED"] as RepairGroup[]).map(group => [group, impact.filter(row => row.group === group).length])) as Record<RepairGroup, number>;
  const evidence = { questionId: question.id, number: paper.questions.indexOf(question) + 1, prompt: question.prompt, options: question.options, approvedKey: keyLabel(paper, question.id), proposedKey: keyLabel(paper, question.id, correction) };
  return { assignment, paper, impact, steps, fingerprint, counts, evidence, newReviews };
}

export async function previewAssessmentRepair(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = repairPreviewSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const result = await analyse(tx, user, assignmentId, input.correction);
    return { fingerprint: result.fingerprint, counts: result.counts, impact: result.impact, steps: result.steps, evidence: result.evidence };
  });
}

/** The proposer submits the exact previewed plan; a different reviewer decides. */
export async function proposeAssessmentRepair(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = repairProposeSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const existing = await tx.schoolAiAssessmentRepair.findUnique({ where: { schoolId_idempotencyKey: { schoolId: user.schoolId, idempotencyKey: input.idempotencyKey } } });
    if (existing) {
      if (existing.assignmentId !== assignmentId || existing.proposedById !== user.userId || existing.fingerprint !== input.fingerprint) throw new ApiError("This request key was used for a different repair.", 409);
      return view(existing);
    }
    const { assignment } = await scopedAssignment(user, assignmentId, tx);
    // Submitting is adding a proposal (teachers may); changing anything needs a leader's approval.
    await staffExamAccess(user, assignment, "add", tx);
    const result = await analyse(tx, user, assignmentId, input.correction);
    if (result.fingerprint !== input.fingerprint) throw new ApiError("The results changed after your preview. Preview the impact again before submitting.", 409);
    if (!result.steps.some(step => step.type === "RESULT")) throw new ApiError("No released result changes with this key, so there is nothing to repair.", 409);
    const open = await tx.schoolAiAssessmentRepair.findFirst({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, status: { in: ["PENDING_REVIEW", "APPLYING", "PARTIAL"] } } });
    if (open) throw new ApiError("Another repair for this exam is still open. Finish or reject it first.", 409);
    const created = await tx.schoolAiAssessmentRepair.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, paperVersion: assignment.paperVersion, questionId: input.correction.questionId, correction: json(input.correction), reason: input.reason, publicExplanation: input.publicExplanation, fingerprint: result.fingerprint, impact: json({ counts: result.counts, rows: result.impact, evidence: result.evidence }), plan: json(result.steps), idempotencyKey: input.idempotencyKey, proposedById: user.userId } });
    await writeAuditEvent(tx, user, { table: "school_ai_assessment_repairs", recordId: created.id, action: "CREATE", campusId: assignment.campusId, after: { assignmentId, questionId: input.correction.questionId, fingerprint: result.fingerprint, steps: result.steps.length, status: created.status } });
    return view(created);
  });
}

function view(row: { id: string; assignmentId: string; questionId: string; status: string; version: number; reason: string; publicExplanation: string; impact: unknown; plan: unknown; receipt: unknown; proposedById: string; decidedById: string | null; decidedAt: Date | null; decisionNote: string | null; createdAt: Date; correction: unknown; fingerprint: string }) {
  const plan = row.plan as RepairStep[], receipt = row.receipt as ReceiptEntry[];
  return { id: row.id, assignmentId: row.assignmentId, questionId: row.questionId, status: row.status, version: row.version, reason: row.reason, publicExplanation: row.publicExplanation, correction: row.correction, fingerprint: row.fingerprint,
    impact: row.impact as { counts: Record<RepairGroup, number>; rows: ImpactRow[]; evidence: unknown }, plan, receipt,
    remaining: plan.filter(step => !receipt.some(entry => entry.key === step.key && entry.status === "APPLIED")).map(step => step.key),
    proposedById: row.proposedById, decidedById: row.decidedById, decidedAt: row.decidedAt, decisionNote: row.decisionNote, createdAt: row.createdAt };
}

export async function listAssessmentRepairs(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper } = await scopedAssignment(user, assignmentId, tx);
    const rows = await tx.schoolAiAssessmentRepair.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId }, orderBy: { createdAt: "desc" }, take: 20 });
    const questions = paper.questions.map((question, index) => ({ id: question.id, number: index + 1, type: question.type, prompt: question.prompt, options: question.options })).filter(question => OBJECTIVE.has(question.type));
    return { released: !!assignment.resultsReleasedAt, me: user.userId, canApprove: isSchoolAiManager(user), questions, repairs: rows.map(view) };
  });
}

async function assertApprover(tx: TxClient, user: AuthUser, assignmentId: string, repair: { proposedById: string }) {
  const { assignment, paper } = await scopedAssignment(user, assignmentId, tx);
  await staffExamAccess(user, assignment, "edit", tx);
  if (!isSchoolAiManager(user)) throw new ApiError("An academic leader approves assessment repairs.", 403);
  if (repair.proposedById === user.userId) throw new ApiError("An independent reviewer must approve this repair.", 403);
  return { assignment, paper };
}

/** Approve (then run the plan) or reject. A changed source marks the repair STALE without any change. */
export async function decideAssessmentRepair(user: AuthUser, assignmentId: string, raw: unknown, options: { stopAfter?: number } = {}) {
  const input = repairDecisionSchema.parse(raw);
  const decided = await schoolAiTransaction(user, async tx => {
    const repair = await tx.schoolAiAssessmentRepair.findFirst({ where: { id: input.repairId, schoolId: user.schoolId, assignmentId } });
    if (!repair) throw new ApiError("Repair not found.", 404);
    await assertApprover(tx, user, assignmentId, repair);
    if (repair.version !== input.version || repair.status !== "PENDING_REVIEW") throw new ApiError("This repair changed since you opened it. Reload it.", 409);
    if (input.decision === "REJECT") {
      await tx.schoolAiAssessmentRepair.update({ where: { id: repair.id }, data: { status: "REJECTED", decidedById: user.userId, decidedAt: new Date(), decisionNote: input.note, version: { increment: 1 } } });
      await writeAuditEvent(tx, user, { table: "school_ai_assessment_repairs", recordId: repair.id, action: "REJECT", campusId: repair.campusId, before: { status: repair.status }, after: { status: "REJECTED" } });
      return { stale: false, run: false };
    }
    const fresh = await analyse(tx, user, assignmentId, examKeyCorrectionSchema.parse(repair.correction));
    if (fresh.fingerprint !== repair.fingerprint) {
      await tx.schoolAiAssessmentRepair.update({ where: { id: repair.id }, data: { status: "STALE", decidedById: user.userId, decidedAt: new Date(), decisionNote: "Results, marks, reports or learning actions changed after the preview.", version: { increment: 1 } } });
      return { stale: true, run: false };
    }
    await tx.schoolAiAssessmentRepair.update({ where: { id: repair.id }, data: { status: "APPLYING", decidedById: user.userId, decidedAt: new Date(), decisionNote: input.note, version: { increment: 1 } } });
    await writeAuditEvent(tx, user, { table: "school_ai_assessment_repairs", recordId: repair.id, action: "APPROVE", campusId: repair.campusId, before: { status: repair.status }, after: { status: "APPLYING", steps: (repair.plan as RepairStep[]).length } });
    return { stale: false, run: true };
  });
  if (decided.stale) throw new ApiError("The results changed after this repair was previewed. It is marked stale; nothing was changed. Preview it again.", 409);
  if (decided.run) await runRepairSteps(user, assignmentId, input.repairId, options);
  return getRepair(user, assignmentId, input.repairId);
}

/** Continue a PARTIAL or interrupted repair: only steps without an APPLIED receipt entry run again. */
export async function resumeAssessmentRepair(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = repairResumeSchema.parse(raw);
  await schoolAiTransaction(user, async tx => {
    const repair = await tx.schoolAiAssessmentRepair.findFirst({ where: { id: input.repairId, schoolId: user.schoolId, assignmentId } });
    if (!repair) throw new ApiError("Repair not found.", 404);
    const { assignment } = await scopedAssignment(user, assignmentId, tx);
    await staffExamAccess(user, assignment, "edit", tx);
    if (!isSchoolAiManager(user)) throw new ApiError("An academic leader continues assessment repairs.", 403);
    if (repair.version !== input.version || !["APPLYING", "PARTIAL"].includes(repair.status)) throw new ApiError("Only an approved repair with unfinished steps can continue.", 409);
  });
  await runRepairSteps(user, assignmentId, input.repairId);
  return getRepair(user, assignmentId, input.repairId);
}

async function getRepair(user: AuthUser, assignmentId: string, repairId: string) {
  return schoolAiTransaction(user, async tx => view(await tx.schoolAiAssessmentRepair.findFirstOrThrow({ where: { id: repairId, schoolId: user.schoolId, assignmentId } })));
}

/**
 * Each step commits in its own transaction together with its receipt entry, under a row lock on the
 * repair, so a step is applied at most once even if two people press Continue. `stopAfter` exists only
 * for the interruption test.
 */
export async function runRepairSteps(user: AuthUser, assignmentId: string, repairId: string, options: { stopAfter?: number } = {}) {
  const plan = (await getRepair(user, assignmentId, repairId)).plan;
  let ran = 0;
  for (const step of plan) {
    if (options.stopAfter !== undefined && ran >= options.stopAfter) return;
    await versionTransaction(async tx => {
      await tx.$queryRaw`SELECT id FROM school_ai_assessment_repairs WHERE id = ${repairId} AND school_id = ${user.schoolId} FOR UPDATE`;
      const repair = await tx.schoolAiAssessmentRepair.findFirstOrThrow({ where: { id: repairId, schoolId: user.schoolId } });
      const receipt = repair.receipt as unknown as ReceiptEntry[];
      if (receipt.some(entry => entry.key === step.key && entry.status === "APPLIED")) return;
      let entry: ReceiptEntry;
      try {
        entry = { key: step.key, status: "APPLIED", at: new Date().toISOString(), detail: await applyStep(tx, user, repair, step) };
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        entry = { key: step.key, status: "FAILED", at: new Date().toISOString(), detail: error.message };
      }
      await tx.schoolAiAssessmentRepair.update({ where: { id: repairId }, data: { receipt: json([...receipt.filter(row => row.key !== step.key), entry]), version: { increment: 1 } } });
    });
    ran++;
  }
  await versionTransaction(async tx => {
    const repair = await tx.schoolAiAssessmentRepair.findFirstOrThrow({ where: { id: repairId, schoolId: user.schoolId } });
    const receipt = repair.receipt as unknown as ReceiptEntry[];
    const done = (repair.plan as RepairStep[]).every(step => receipt.some(entry => entry.key === step.key && entry.status === "APPLIED"));
    await tx.schoolAiAssessmentRepair.update({ where: { id: repairId }, data: { status: done ? "APPLIED" : "PARTIAL", version: { increment: 1 } } });
    await writeAuditEvent(tx, user, { table: "school_ai_assessment_repairs", recordId: repairId, action: "UPDATE", campusId: repair.campusId, after: { status: done ? "APPLIED" : "PARTIAL", applied: receipt.filter(e => e.status === "APPLIED").length, failed: receipt.filter(e => e.status === "FAILED").length } });
  });
}

type RepairRow = { id: string; campusId: string; assignmentId: string; correction: unknown; reason: string; publicExplanation: string; proposedById: string };
async function applyStep(tx: TxClient, user: AuthUser, repair: RepairRow, step: RepairStep): Promise<string> {
  const reason = `Assessment repair ${repair.id}: ${repair.reason}`;
  if (step.type === "RESULT") {
    const assignment = await tx.schoolAiExamAssignment.findFirstOrThrow({ where: { id: repair.assignmentId, schoolId: user.schoolId } });
    const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: step.attemptId, schoolId: user.schoolId, campusId: repair.campusId, status: "REVIEWED" } });
    if (!attempt) throw new ApiError("The attempt is no longer reviewed.", 409);
    if (attempt.reviewVersion !== step.fromVersion) throw new ApiError(`The result moved to version ${attempt.reviewVersion}; it was not changed. Correct it through moderation.`, 409);
    const paper = paperDataSchema.parse(assignment.paperSnapshot);
    const corrected = correctedExamPaper(paper, [examKeyCorrectionSchema.parse(repair.correction)]);
    const correction = examKeyCorrectionSchema.parse(repair.correction);
    const stored = attempt.review as { marks: unknown; note: unknown; keyCorrections?: unknown };
    const review = examReviewSchema.parse({ marks: stored.marks, note: stored.note, keyCorrections: stored.keyCorrections });
    const scored = scoreObjectiveResponses(corrected, responsesSchema.parse(attempt.responses)).questions.find(row => row.questionId === correction.questionId)?.marks ?? 0;
    const keys = new Map((review.keyCorrections ?? []).map(row => [row.questionId, row])); keys.set(correction.questionId, correction);
    const next = { ...review, keyCorrections: [...keys.values()], marks: review.marks.map(row => row.questionId === correction.questionId ? { ...row, marks: scored } : row) };
    const revision = await applyResultRevision(tx, user, { assignmentId: repair.assignmentId, campusId: repair.campusId, paper, attempt, fromVersion: step.fromVersion, review: next, reason, createdById: repair.proposedById });
    return `Result version ${revision.version}: ${step.beforeTotal} → ${revision.review.total}`;
  }
  if (step.type === "MARK") {
    const updated = await tx.mark.updateMany({ where: { id: step.markId, schoolId: user.schoolId, campusId: repair.campusId, correctionVersion: step.correctionVersion, marksObtained: step.before }, data: { marksObtained: step.after, grade: step.grade, enteredBy: user.userId } });
    if (updated.count !== 1) throw new ApiError("The gradebook mark changed after the preview; it was not overwritten. Correct it through Record corrections.", 409);
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "marks", recordId: step.markId, userId: user.userId, oldValue: { marksObtained: step.before }, newValue: { marksObtained: step.after, grade: step.grade, source: "assessment_repair", repairId: repair.id } } });
    return `Mark ${step.before} → ${step.after}`;
  }
  if (step.type === "REPORT") {
    const version = await refreshVersion(tx, step.reportCardId);
    await tx.reportVersion.update({ where: { id: version.id }, data: { correctionReason: repair.publicExplanation } });
    return `Report version ${version.number} prepared for approval`;
  }
  if (step.type === "ACTION_STALE") {
    const updated = await tx.interventionPlan.updateMany({ where: { id: step.planId, schoolId: user.schoolId, campusId: repair.campusId }, data: { staleRepairId: repair.id, staleReason: repair.publicExplanation, staleSince: new Date() } });
    if (updated.count !== 1) throw new ApiError("The learning action is no longer available.", 409);
    return "Marked for review";
  }
  // NOTICE: one row per recipient and repair; a replay finds the same dedupe key and adds nothing.
  const assignment = await tx.schoolAiExamAssignment.findFirstOrThrow({ where: { id: repair.assignmentId, schoolId: user.schoolId }, select: { title: true } });
  let sent = 0;
  for (const userId of step.recipientIds) {
    const dedupeKey = `ASSESSMENT_REPAIR:${repair.id}:${step.studentId}`;
    if (await tx.notification.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } } })) continue;
    await tx.notification.create({ data: { schoolId: user.schoolId, campusId: repair.campusId, userId, type: "ASSESSMENT_RESULT_CORRECTED", category: "UPDATE", title: `Corrected result: ${assignment.title}`, message: repair.publicExplanation, icon: "ClipboardCheck", link: `/ai/exams/${repair.assignmentId}`, sourceType: "SCHOOL_AI_ASSESSMENT_REPAIR", sourceId: repair.id, dedupeKey } });
    sent++;
  }
  return `${sent} of ${step.recipientIds.length} notices created`;
}

/** Reviewing a learning action after a repair clears its stale marker; nothing else about it changes. */
export async function acknowledgeRepairedLearningAction(user: AuthUser, planId: string) {
  if (!isSchoolAiManager(user) && user.role !== "TEACHER") throw new ApiError("Staff only.", 403);
  return schoolAiTransaction(user, async tx => {
    const updated = await tx.interventionPlan.updateMany({ where: { id: planId, schoolId: user.schoolId, campusId: user.campusId ?? "", staleRepairId: { not: null }, ...(isSchoolAiManager(user) ? {} : { OR: [{ ownerId: user.userId }, { createdBy: user.userId }] }) }, data: { staleRepairId: null, staleReason: null, staleSince: null } });
    if (updated.count !== 1) throw new ApiError("This learning action has nothing to review.", 409);
    await writeAuditEvent(tx, user, { table: "intervention_plans", recordId: planId, action: "UPDATE", campusId: user.campusId ?? "", after: { staleCleared: true } });
    return { id: planId, stale: false };
  });
}
