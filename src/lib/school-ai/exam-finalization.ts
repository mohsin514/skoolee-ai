import type { Prisma, SchoolAiExamAttempt } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import type { PaperData } from "./assessment";
import { responsesSchema, scoreObjectiveResponses } from "./exam";

/** A stale read must not finalize an attempt extended, paused or saved in the meantime. */
export async function finalizeExpiredAttempt(db: Pick<TxClient, "schoolAiExamAttempt">, attempt: Pick<SchoolAiExamAttempt, "id" | "schoolId" | "sequence" | "responses" | "deadlineAt">, paper: PaperData, now: Date) {
  // The attempt closed at its deadline, so that is the submission time, not the moment someone next read it.
  if (attempt.deadlineAt > now) return { count: 0 };
  return db.schoolAiExamAttempt.updateMany({
    where: { id: attempt.id, schoolId: attempt.schoolId, status: "IN_PROGRESS", pausedAt: null, deadlineAt: attempt.deadlineAt, sequence: attempt.sequence },
    data: { status: "SUBMITTED", submittedAt: attempt.deadlineAt, scoreProposal: scoreObjectiveResponses(paper, responsesSchema.parse(attempt.responses)) as unknown as Prisma.InputJsonValue },
  });
}
