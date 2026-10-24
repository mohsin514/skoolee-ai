import type { TxClient } from "@/lib/db/prisma";

/**
 * Marks a role questionnaire response once its build job ends: READY only when every step saved or
 * drafted, PARTIAL when something failed, waits elsewhere, or was cancelled. Runs inside the job's
 * final transaction so the two never disagree.
 */
export async function settleSetupResponse(tx: TxClient, job: { id: string; schoolId: string; origin: string; setupResponseId: string | null }, status: string, outcome: string | null) {
  if (job.origin !== "QUESTIONNAIRE" || !job.setupResponseId || !["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(status)) return;
  await tx.aiSetupResponse.updateMany({ where: { id: job.setupResponseId, schoolId: job.schoolId, jobId: job.id, status: "APPLYING" }, data: { status: status === "COMPLETED" && (outcome === "EXECUTED" || outcome === "PLAN_SAVED") ? "READY" : "PARTIAL" } });
}
