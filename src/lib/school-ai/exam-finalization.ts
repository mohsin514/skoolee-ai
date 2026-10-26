import type { Prisma, SchoolAiExamAttempt } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import type { PaperData } from "./assessment";
import { responsesSchema, scoreObjectiveResponses } from "./exam";

/** A stale read must not finalize an attempt extended, paused or saved in the meantime. */
export async function finalizeExpiredAttempt(db: Pick<TxClient, "schoolAiExamAttempt">, attempt: Pick<SchoolAiExamAttempt, "id" | "schoolId" | "sequence" | "responses">, paper: PaperData, now: Date) {
  return db.schoolAiExamAttempt.updateMany({
    where: { id: attempt.id, schoolId: attempt.schoolId, status: "IN_PROGRESS", pausedAt: null, deadlineAt: { lte: now }, sequence: attempt.sequence },
    data: { status: "SUBMITTED", submittedAt: now, scoreProposal: scoreObjectiveResponses(paper, responsesSchema.parse(attempt.responses)) as unknown as Prisma.InputJsonValue },
  });
}
