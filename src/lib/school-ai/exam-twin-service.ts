import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { paperDataSchema, type PaperData } from "./assessment";
import type { TxClient } from "@/lib/db/prisma";
import { examReviewSchema, responsesSchema } from "./exam";
import { scopedAssignment } from "./exam-service";
import { itemWatch, twinForecast, twinVersusClass } from "./exam-twin";
import { analyseItems } from "./recovery";
import { schoolAiTransaction } from "./transaction";

const reviewOf = (value: unknown) => examReviewSchema.parse({ marks: (value as { marks?: unknown })?.marks, note: (value as { note?: unknown })?.note });

/**
 * SKO-507: the Twin for one sitting reads only this class's released sittings of the same subject that
 * ended before this one started, so the estimate never sees the results it is compared with.
 */
export async function examTwin(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper, student } = await scopedAssignment(user, assignmentId, tx);
    if (student) throw new ApiError("Exam unavailable.", 404);
    return twinFor(tx, user.schoolId, assignment, paper);
  });
}

/** The Twin for one sitting, without an actor: also read by the Pilot Ledger. */
export async function twinFor(tx: TxClient, schoolId: string, assignment: { id: string; campusId: string; classId: string; startsAt: Date; resultsReleasedAt: Date | null }, paper: PaperData) {
  const earlier = await tx.schoolAiExamAssignment.findMany({ where: { schoolId, campusId: assignment.campusId, classId: assignment.classId, id: { not: assignment.id }, resultsReleasedAt: { not: null }, endsAt: { lte: assignment.startsAt } }, orderBy: { endsAt: "desc" }, take: 20, select: { id: true, paperSnapshot: true } });
  const evidence = [];
  for (const sitting of earlier) {
    const parsed = paperDataSchema.safeParse(sitting.paperSnapshot);
    if (!parsed.success || parsed.data.subjectId !== paper.subjectId) continue;
    const attempts = await tx.schoolAiExamAttempt.findMany({ where: { schoolId, assignmentId: sitting.id, status: "REVIEWED" }, select: { review: true, responses: true } });
    evidence.push({ paper: parsed.data, rows: attempts.filter(row => row.review).map(row => ({ review: reviewOf(row.review), responses: responsesSchema.parse(row.responses) })) });
  }
  const forecast = twinForecast(paper, evidence);
  const released = Boolean(assignment.resultsReleasedAt);
  const rows = released ? (await tx.schoolAiExamAttempt.findMany({ where: { schoolId, assignmentId: assignment.id, status: "REVIEWED" }, select: { review: true, responses: true } })).filter(row => row.review).map(row => ({ review: reviewOf(row.review), responses: responsesSchema.parse(row.responses) })) : [];
  return {
    released, sittings: evidence.length,
    forecast,
    comparison: released ? twinVersusClass(forecast, analyseItems(paper, rows)) : null,
    watch: released ? itemWatch(paper, rows) : null,
  };
}
