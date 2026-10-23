import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { paperDataSchema } from "./assessment";
import { examReviewSchema, responsesSchema } from "./exam";
import { scopedAssignment } from "./exam-service";
import { outcomeTitles } from "./improve-service";
import { NEXT_TEN_MINUTES, practiceProposals } from "./mistake-map";
import { practiceSetSchema } from "./practice";
import { analyseItems } from "./recovery";
import { createWorkspaceRecord } from "./repository";
import { schoolAiTransaction } from "./transaction";

/**
 * SKO-504 Next Ten Minutes: for one ticked outcome of a released sitting, a ten-minute remediation —
 * reteach, three practice items, one check item — drawn from released items of this class and subject
 * (this sitting first, then up to four earlier released sittings). The teacher confirms it as a
 * PRACTICE draft, which they may approve under the classroom tier.
 */
const reviewOf = (value: unknown) => examReviewSchema.parse({ marks: (value as { marks?: unknown })?.marks, note: (value as { note?: unknown })?.note });
const input = z.strictObject({ outcomeId: z.string().trim().min(1).max(120) });
const confirmInput = input.extend({ items: z.array(z.strictObject({ sourceAssignmentId: z.string().min(1).max(120), questionId: z.string().min(1).max(120) })).min(1).max(4) });

async function candidates(user: AuthUser, assignmentId: string, outcomeId: string) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper, student } = await scopedAssignment(user, assignmentId, tx);
    if (student) throw new ApiError("Exam unavailable.", 404);
    if (!assignment.resultsReleasedAt || assignment.endsAt > new Date()) throw new ApiError("Plan the next lesson once results are released.", 409);
    if (!paper.questions.some(question => question.outcomeIds.includes(outcomeId))) throw new ApiError("Choose an outcome this paper measured.", 400);
    const earlier = await tx.schoolAiExamAssignment.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, classId: assignment.classId, id: { not: assignment.id }, resultsReleasedAt: { not: null }, endsAt: { lte: new Date() } }, orderBy: { endsAt: "desc" }, take: 12, select: { id: true, title: true, paperSnapshot: true } });
    const sittings = [{ id: assignment.id, title: assignment.title, paper }, ...earlier.flatMap(row => { const parsed = paperDataSchema.safeParse(row.paperSnapshot); return parsed.success && parsed.data.subjectId === paper.subjectId ? [{ id: row.id, title: row.title, paper: parsed.data }] : []; }).slice(0, 4)];
    const pool = [];
    for (const sitting of sittings) {
      const attempts = await tx.schoolAiExamAttempt.findMany({ where: { schoolId: user.schoolId, assignmentId: sitting.id, status: "REVIEWED" }, select: { review: true, responses: true } });
      const items = analyseItems(sitting.paper, attempts.filter(row => row.review).map(row => ({ review: reviewOf(row.review), responses: responsesSchema.parse(row.responses) })));
      for (const question of sitting.paper.questions) {
        const item = items.find(entry => entry.questionId === question.id)!;
        pool.push({ sourceAssignmentId: sitting.id, sittingTitle: sitting.title, questionId: question.id, number: item.number, prompt: question.prompt, outcomeIds: question.outcomeIds, percentage: item.percentage, reading: item.reading, question });
      }
    }
    const titles = await outcomeTitles(tx, user, paper);
    return { assignment, paper, pool, title: titles.get(outcomeId) ?? null };
  });
}

export async function proposeNextLesson(user: AuthUser, assignmentId: string, raw: unknown) {
  const { outcomeId } = input.parse(raw);
  const { pool, title } = await candidates(user, assignmentId, outcomeId);
  const { practice, check } = practiceProposals(pool, outcomeId);
  const show = (item: (typeof pool)[number]) => ({ sourceAssignmentId: item.sourceAssignmentId, questionId: item.questionId, number: item.number, sittingTitle: item.sittingTitle, prompt: item.prompt, percentage: item.percentage });
  return { outcomeId, title, plan: NEXT_TEN_MINUTES, proposals: practice.map(item => show(pool.find(entry => entry === item)!)), check: check ? show(pool.find(entry => entry === check)!) : null };
}

/** The teacher's confirmation: the chosen released items become a PRACTICE draft for this class. */
export async function confirmNextLesson(user: AuthUser, assignmentId: string, raw: unknown) {
  const parsed = confirmInput.parse(raw);
  const { assignment, paper, pool, title } = await candidates(user, assignmentId, parsed.outcomeId);
  const chosen = parsed.items.map(pick => pool.find(item => item.sourceAssignmentId === pick.sourceAssignmentId && item.questionId === pick.questionId && item.outcomeIds.includes(parsed.outcomeId) && item.reading !== "CHECK_ITEM"));
  if (chosen.some(item => !item)) throw new ApiError("Choose released items proposed for this outcome.", 400);
  const items = chosen.map(item => ({ sourceAssignmentId: item!.sourceAssignmentId, questionId: item!.question.id, prompt: item!.question.prompt, type: item!.question.type, options: item!.question.options, marks: item!.question.marks, outcomeIds: item!.question.outcomeIds }));
  const data = practiceSetSchema.parse({ subjectId: paper.subjectId, classId: paper.classId, outcomeIds: [parsed.outcomeId], sourceAssignmentIds: [...new Set(items.map(item => item.sourceAssignmentId))], items, note: `Next ten minutes: ${title ?? parsed.outcomeId}` });
  return createWorkspaceRecord(user, { kind: "PRACTICE", campusId: assignment.campusId, title: `Next ten minutes · ${title ?? assignment.title}`, data, idempotencyKey: randomUUID() });
}
