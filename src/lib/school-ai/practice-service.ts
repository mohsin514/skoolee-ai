import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { curriculumDataSchema, paperDataSchema, type PaperData } from "./assessment";
import { examReviewSchema, responsesSchema } from "./exam";
import { scopedAssignment } from "./exam-service";
import { practiceSetSchema } from "./practice";
import { createWorkspaceRecord } from "./repository";
import { schoolAiTransaction } from "./transaction";

// SKO-408 R18.4-R18.10: practice drawn from released items for the outcomes a class found hardest,
// learner access only after teacher approval, and an earlier/later comparison that states its sample
// sizes and makes no causal claim.

const reviewOf = (value: unknown) => examReviewSchema.parse({ marks: (value as { marks?: unknown })?.marks, note: (value as { note?: unknown })?.note });

/** Per outcome: awarded over possible marks across moderated scripts, with item and candidate counts. */
function outcomeRates(paper: PaperData, attempts: Array<{ review: unknown; responses: unknown }>) {
  const totals = new Map<string, { awarded: number; possible: number; items: Set<string>; candidates: number }>();
  for (const question of paper.questions) for (const outcomeId of question.outcomeIds) {
    const entry = totals.get(outcomeId) ?? { awarded: 0, possible: 0, items: new Set<string>(), candidates: attempts.length };
    entry.items.add(question.id);
    for (const attempt of attempts) {
      entry.possible += question.marks;
      entry.awarded += reviewOf(attempt.review).marks.find(mark => mark.questionId === question.id)?.marks ?? 0;
    }
    totals.set(outcomeId, entry);
  }
  return totals;
}

async function releasedExam(user: AuthUser, assignmentId: string) {
  const { assignment, paper, student } = await scopedAssignment(user, assignmentId);
  if (student) throw new ApiError("Exam unavailable.", 404);
  if (!assignment.resultsReleasedAt || assignment.endsAt > new Date()) throw new ApiError("Practice and comparisons use exams whose results are released.", 409);
  const attempts = await prisma.schoolAiExamAttempt.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, status: "REVIEWED" }, select: { review: true, responses: true } });
  return { assignment, paper, attempts };
}

export const draftPracticeSchema = z.strictObject({ outcomeIds: z.array(z.string().min(1).max(120)).max(50).optional() });

/** R18.4: a draft practice set from a released exam's items for the chosen outcomes (default: those below 70%). */
export async function draftPractice(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = draftPracticeSchema.parse(raw ?? {});
  const { assignment, paper, attempts } = await releasedExam(user, assignmentId);
  const rates = outcomeRates(paper, attempts);
  const chosen = input.outcomeIds?.length ? input.outcomeIds : [...rates.entries()].filter(([, entry]) => entry.possible && entry.awarded / entry.possible < 0.7).map(([outcomeId]) => outcomeId);
  if (!chosen.length) throw new ApiError("Every outcome in this exam was at or above 70%. Choose the outcomes to practise.", 409);
  const items = paper.questions.filter(question => question.outcomeIds.some(outcomeId => chosen.includes(outcomeId))).map(question => ({ sourceAssignmentId: assignment.id, questionId: question.id, prompt: question.prompt, type: question.type, options: question.options, marks: question.marks, outcomeIds: question.outcomeIds }));
  if (!items.length) throw new ApiError("No released item addresses those outcomes.", 409);
  const data = practiceSetSchema.parse({ subjectId: paper.subjectId, classId: paper.classId, outcomeIds: chosen, sourceAssignmentIds: [assignment.id], items });
  return createWorkspaceRecord(user, { kind: "PRACTICE", campusId: assignment.campusId, title: `Practice · ${assignment.title}`, data, idempotencyKey: randomUUID() });
}

/** R18.6, R18.12, R18.13: a learner sees only approved practice for their class built from exams they were assigned. */
export async function learnerPractice(user: AuthUser) {
  if (user.role !== "STUDENT") throw new ApiError("Only learners read their practice here.", 403);
  return schoolAiTransaction(user, async tx => {
    const student = await tx.student.findFirst({ where: { schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null }, select: { id: true, classId: true, campusId: true } });
    if (!student) return { sets: [] };
    // The approved revision is what learners receive, never a later draft saved on top of it.
    const approved = await tx.schoolAiRevision.findMany({ where: { schoolId: user.schoolId, campusId: student.campusId, status: "APPROVED", record: { kind: "PRACTICE", classId: student.classId, status: "APPROVED" } }, orderBy: { createdAt: "desc" }, take: 20, select: { recordId: true, title: true, data: true, createdAt: true } });
    const latest = approved.filter((row, index) => approved.findIndex(other => other.recordId === row.recordId) === index);
    const assigned = new Set((await tx.schoolAiExamAssignment.findMany({ where: { schoolId: user.schoolId, campusId: student.campusId, studentIds: { array_contains: [student.id] }, resultsReleasedAt: { not: null } }, select: { id: true } })).map(row => row.id));
    return { sets: latest.map(row => ({ id: row.recordId, title: row.title, approvedAt: row.createdAt, practice: practiceSetSchema.parse(row.data) })).filter(row => row.practice.sourceAssignmentIds.some(id => assigned.has(id))).map(row => ({ id: row.id, title: row.title, approvedAt: row.approvedAt, items: row.practice.items.map(item => ({ prompt: item.prompt, type: item.type, options: item.options.map(option => option.text), marks: item.marks })) })) };
  });
}

/**
 * R18.9, R18.10: the same outcomes in an earlier and a later released exam of one class, side by
 * side with the number of items and candidates behind each figure. It is a description of two
 * samples, never a measure of learning gain or of teaching.
 */
export async function outcomeComparison(user: AuthUser, earlierId: string, laterId: string) {
  const earlier = await releasedExam(user, earlierId), later = await releasedExam(user, laterId);
  if (earlier.assignment.classId !== later.assignment.classId) throw new ApiError("Compare two exams of the same class.", 409);
  if (earlier.assignment.startsAt >= later.assignment.startsAt) throw new ApiError("Choose a later exam to compare with.", 409);
  const a = outcomeRates(earlier.paper, earlier.attempts), b = outcomeRates(later.paper, later.attempts);
  const curriculum = await prisma.schoolAiRevision.findFirst({ where: { schoolId: user.schoolId, recordId: later.paper.curriculumId, version: later.paper.curriculumVersion }, select: { data: true } });
  const parsed = curriculum ? curriculumDataSchema.safeParse(curriculum.data) : null;
  const titles = new Map(parsed?.success ? parsed.data.outcomes.map(outcome => [outcome.id, outcome.title]) : []);
  const rate = (entry?: { awarded: number; possible: number; items: Set<string>; candidates: number }) => entry && entry.possible ? { percentage: Math.round(entry.awarded / entry.possible * 1000) / 10, items: entry.items.size, candidates: entry.candidates } : null;
  return {
    earlier: { id: earlier.assignment.id, title: earlier.assignment.title, startsAt: earlier.assignment.startsAt },
    later: { id: later.assignment.id, title: later.assignment.title, startsAt: later.assignment.startsAt },
    outcomes: [...new Set([...a.keys(), ...b.keys()])].map(outcomeId => ({ outcomeId, title: titles.get(outcomeId) ?? null, earlier: rate(a.get(outcomeId)), later: rate(b.get(outcomeId)) })),
  };
}

export const scheduleFormativeCheckSchema = z.strictObject({ durationMinutes: z.number().int().min(5).max(180).optional() });

/**
 * R18.8: a formative check for the outcomes an approved practice set addresses. It is created as a
 * draft PAPER from the released items' approved revisions (keys and rubrics included, review state
 * reset), so it goes through the same item review, approval, rehearsal, sealing and assignment path
 * as any other form; nothing about it is delivered until that path is complete.
 */
export async function scheduleFormativeCheck(user: AuthUser, practiceRecordId: string, raw: unknown) {
  const input = scheduleFormativeCheckSchema.parse(raw ?? {});
  const practice = await prisma.schoolAiRecord.findFirst({ where: { id: practiceRecordId, schoolId: user.schoolId, kind: "PRACTICE", ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) } });
  if (!practice) throw new ApiError("Practice set unavailable.", 404);
  if (practice.status !== "APPROVED") throw new ApiError("Approve the practice set before scheduling its formative check.", 409);
  const set = practiceSetSchema.parse(practice.data);
  const questions: PaperData["questions"] = [];
  let base: PaperData | null = null;
  const usedIds = new Set<string>();
  for (const sourceId of set.sourceAssignmentIds) {
    const { assignment } = await releasedExam(user, sourceId);
    const revision = await prisma.schoolAiRevision.findFirst({ where: { schoolId: user.schoolId, recordId: assignment.paperId, version: assignment.paperVersion }, select: { data: true } });
    if (!revision) throw new ApiError("The released paper behind this practice is no longer available.", 409);
    const source = paperDataSchema.parse(revision.data);
    base ??= source;
    for (const item of set.items.filter(entry => entry.sourceAssignmentId === sourceId)) {
      const original = source.questions.find(question => question.id === item.questionId);
      if (!original) continue;
      const { review: _review, reusedFrom: _origin, ...copy } = original;
      // Item ids are local to a paper; two source papers can both have "q1".
      let questionId = copy.id;
      for (let n = 2; usedIds.has(questionId); n++) questionId = `${copy.id}-${n}`;
      usedIds.add(questionId);
      questions.push({ ...copy, id: questionId, locked: false });
    }
  }
  if (!base || !questions.length) throw new ApiError("None of this practice set's items are still available in their released papers.", 409);
  // One blueprint section per (type, marks), every item required: the check is short and complete.
  const groups = new Map<string, PaperData["questions"]>();
  for (const question of questions) groups.set(`${question.type}:${question.marks}`, [...(groups.get(`${question.type}:${question.marks}`) ?? []), question]);
  const sections = [...groups.values()].map((group, index) => ({
    id: `formative-${index + 1}`, title: `Part ${index + 1}`, questionCount: group.length, answerCount: group.length, marksPerQuestion: group[0].marks, type: group[0].type,
    outcomeIds: [...new Set(group.flatMap(question => question.outcomeIds))].filter(outcomeId => set.outcomeIds.includes(outcomeId)).slice(0, 50),
  }));
  for (const [index, group] of [...groups.values()].entries()) for (const question of group) question.sectionId = sections[index].id;
  for (const section of sections) if (!section.outcomeIds.length) section.outcomeIds = [...new Set(groups.get(`${section.type}:${section.marksPerQuestion}`)!.flatMap(question => question.outcomeIds))].slice(0, 50);
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  const paper: PaperData = paperDataSchema.parse({
    curriculumId: base.curriculumId, curriculumVersion: base.curriculumVersion, subjectId: set.subjectId, classId: set.classId, language: base.language,
    blueprint: { title: `Formative check · ${practice.title}`.slice(0, 240), durationMinutes: input.durationMinutes ?? Math.max(10, Math.min(60, questions.length * 3)), totalMarks, instructions: base.blueprint.instructions, sections },
    ...(base.coverageSection ? { coverageSection: base.coverageSection } : {}),
    questions,
    generation: { kind: "MANUAL", model: null, generatedAt: null },
    formativeOf: { practiceRecordId: practice.id, sourceAssignmentIds: set.sourceAssignmentIds, outcomeIds: set.outcomeIds },
  });
  return createWorkspaceRecord(user, { kind: "PAPER", campusId: practice.campusId, title: paper.blueprint.title, data: paper as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
}

/**
 * R18.8-R18.10: once a formative check's results are released, it sits beside the exam it followed
 * up, through the same sample-sized, non-causal comparison as any earlier/later pair.
 */
export async function formativeComparison(user: AuthUser, assignmentId: string) {
  const { assignment } = await scopedAssignment(user, assignmentId);
  const revision = await prisma.schoolAiRevision.findFirst({ where: { schoolId: user.schoolId, recordId: assignment.paperId, version: assignment.paperVersion }, select: { data: true } });
  const parsed = revision ? paperDataSchema.safeParse(revision.data) : null;
  const link = parsed?.success ? parsed.data.formativeOf : undefined;
  if (!link) throw new ApiError("This exam is not a formative check.", 409);
  const sources = await prisma.schoolAiExamAssignment.findMany({ where: { id: { in: link.sourceAssignmentIds }, schoolId: user.schoolId, campusId: assignment.campusId, classId: assignment.classId, startsAt: { lt: assignment.startsAt }, resultsReleasedAt: { not: null } }, orderBy: { startsAt: "desc" }, select: { id: true } });
  if (!sources.length) throw new ApiError("The exam this check follows up is not released for this class.", 409);
  return outcomeComparison(user, sources[0].id, assignment.id);
}
