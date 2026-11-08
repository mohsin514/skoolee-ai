import type { Prisma } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import { scanForPII } from "@/lib/ai/pseudonymize";

/**
 * The job's event log feeds live progress (SSE or polling). Payloads carry ids, counts and template
 * keys only; a payload that looks like it holds a phone, email or ID is refused rather than stored.
 */
export type WorkflowEventType =
  | "JOB_STARTED" | "PLAN_READY" | "QUESTION_ASKED" | "QUESTION_ANSWERED" | "STEP_READY" | "STEP_WAITING_CONFIRM"
  | "STEP_RUNNING" | "STEP_SUCCEEDED" | "STEP_UNCERTAIN" | "STEP_FAILED" | "STEP_HANDED_OFF" | "HANDOFF_COMPLETED"
  | "MODEL_ATTEMPT_STARTED" | "JOB_PAUSED" | "JOB_RESUMED" | "JOB_BLOCKED" | "JOB_COMPLETED" | "JOB_CANCELLED";

export async function appendEvent(tx: TxClient, job: { id: string; schoolId: string }, type: WorkflowEventType, stepId: string | null = null, payload: Record<string, string | number | boolean | null> = {}) {
  if (scanForPII(JSON.stringify(payload)).length) throw new Error("Workflow event payloads hold ids and template keys only.");
  const { eventSeq } = await tx.aiWorkflowJob.update({ where: { id_schoolId: { id: job.id, schoolId: job.schoolId } }, data: { eventSeq: { increment: 1 } }, select: { eventSeq: true } });
  await tx.aiWorkflowEvent.create({ data: { schoolId: job.schoolId, jobId: job.id, seq: eventSeq, type, stepId, payload: payload as Prisma.InputJsonValue } });
  return eventSeq;
}
