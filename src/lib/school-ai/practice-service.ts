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
