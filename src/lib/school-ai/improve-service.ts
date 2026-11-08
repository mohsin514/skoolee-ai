import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { curriculumDataSchema, type PaperData } from "./assessment";
import { examReviewSchema, responsesSchema } from "./exam";
import { scopedAssignment } from "./exam-service";
import { analyseItems, deriveFeedback } from "./recovery";
import { buildMistakeMap } from "./mistake-map";
import { schoolAiTransaction } from "./transaction";

// SKO-408 Results and improvement: staff read item analysis and per-learner feedback for one exam;
// a learner reads only their own feedback, and only after the result release (R18.12).

export async function outcomeTitles(tx: TxClient, user: AuthUser, paper: PaperData) {
  const row = await tx.schoolAiRevision.findFirst({ where: { schoolId: user.schoolId, recordId: paper.curriculumId, version: paper.curriculumVersion }, select: { data: true } });
  const parsed = row ? curriculumDataSchema.safeParse(row.data) : null;
  return new Map(parsed?.success ? parsed.data.outcomes.map(outcome => [outcome.id, outcome.title]) : []);
}

const reviewOf = (value: unknown) => examReviewSchema.parse({ marks: (value as { marks?: unknown })?.marks, note: (value as { note?: unknown })?.note });

export async function examImprovement(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper, student } = await scopedAssignment(user, assignmentId, tx);
    const titles = await outcomeTitles(tx, user, paper);
    if (student) {
      const released = !!assignment.resultsReleasedAt && new Date() >= assignment.endsAt;
      const attempt = released ? await tx.schoolAiExamAttempt.findFirst({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, studentId: student.id, userId: user.userId, status: "REVIEWED" } }) : null;
      return { role: "LEARNER" as const, released, feedback: attempt?.review ? deriveFeedback(paper, reviewOf(attempt.review), responsesSchema.parse(attempt.responses), titles) : null, note: attempt?.review ? reviewOf(attempt.review).note : null };
    }
    const attempts = await tx.schoolAiExamAttempt.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId }, select: { id: true, studentId: true, status: true, responses: true, review: true, reviewVersion: true } });
    const reviewed = attempts.filter(attempt => attempt.status === "REVIEWED" && attempt.review);
    const assigned = Array.isArray(assignment.studentIds) ? assignment.studentIds.length : 0;
    const names = new Map((await tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: reviewed.map(attempt => attempt.studentId) } }, select: { id: true, fullName: true } })).map(row => [row.id, row.fullName]));
    const rows = reviewed.map(attempt => ({ attempt, review: reviewOf(attempt.review), responses: responsesSchema.parse(attempt.responses) }));
    const items = analyseItems(paper, rows);
    return {
      role: "STAFF" as const,
      exam: { id: assignment.id, title: assignment.title, endsAt: assignment.endsAt, resultsReleasedAt: assignment.resultsReleasedAt, paperVersion: assignment.paperVersion },
      // The evidence base, stated before any reading of it: absence and unmarked work are not learning evidence.
      counts: { assigned, absent: Math.max(0, assigned - attempts.length), inProgress: attempts.filter(attempt => attempt.status === "IN_PROGRESS").length, unmarked: attempts.filter(attempt => attempt.status === "SUBMITTED").length, reviewed: reviewed.length },
      items,
      // SKO-504: the Mistake Map reads the same moderated rows, with items under question left out.
      map: buildMistakeMap(paper, rows.map(row => ({ attemptId: row.attempt.id, name: names.get(row.attempt.studentId) ?? null, review: row.review, responses: row.responses })), items, titles),
      learners: rows.map(row => ({ attemptId: row.attempt.id, name: names.get(row.attempt.studentId) ?? null, resultVersion: row.attempt.reviewVersion, feedback: deriveFeedback(paper, row.review, row.responses, titles) })),
    };
  });
}
