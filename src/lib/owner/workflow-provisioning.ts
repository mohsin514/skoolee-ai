import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { appendEvent } from "@/lib/ai-workflows/jobs/events";
import { deriveJobStatus, deriveOutcome, type StepSummary } from "@/lib/ai-workflows/executor/scheduler";

/** Lock the owner's prepared request in the same transaction that provisions the school. */
export async function bindProvisionHandoff(tx: TxClient, actor: AuthUser, raw: unknown) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || !raw || raw.length > 128) throw new ApiError("Invalid prepared school request", 400);
  const row = await tx.aiWorkflowHandoff.findFirst({ where: {
    id: raw, schoolId: actor.schoolId, originUserId: actor.userId, targetRoles: { has: "APP_OWNER" },
    kind: "DOMAIN_SCREEN",
  } });
  const step = row ? await tx.aiWorkflowStep.findFirst({ where: { id: row.stepId, schoolId: actor.schoolId, jobId: row.jobId, capabilityKey: "platform.provision_school", status: "WAITING_HANDOFF" } }) : null;
  if (!row || !step || actor.role !== "APP_OWNER") throw new ApiError("Prepared school request not found", 404);
  const claimed = await tx.aiWorkflowHandoff.updateMany({ where: {
    id: row.id, schoolId: actor.schoolId, status: { in: ["OPEN", "CLAIMED"] }, expiresAt: { gt: new Date() },
    OR: [{ claimedById: null }, { claimedById: actor.userId }, { claimExpiresAt: { lte: new Date() } }],
  }, data: { status: "CLAIMED", claimedById: actor.userId, claimedAt: new Date(), claimExpiresAt: new Date(Date.now() + 30 * 60_000) } });
  if (claimed.count !== 1) throw new ApiError("This prepared school request expired or was already used. Start a new request.", 409);
  return row;
}

export async function completeProvisionHandoff(tx: TxClient, actor: AuthUser, handoff: NonNullable<Awaited<ReturnType<typeof bindProvisionHandoff>>>, schoolId: string) {
  const receipt = { kind: "handoff", capability: "platform.provision_school", entities: [{ model: "school", id: schoolId }], counts: { schools: 1 }, link: "/owner?view=schools", replayed: false, detail: { decidedBy: "requester" } };
  await tx.aiWorkflowHandoff.update({ where: { id: handoff.id }, data: { status: "COMPLETED", completedModel: "school", completedId: schoolId, completedById: actor.userId, completedReceipt: receipt } });
  await tx.aiWorkflowStep.update({ where: { id: handoff.stepId }, data: { status: "HANDED_OFF_DONE", receipt, finishedAt: new Date(), version: { increment: 1 } } });
  const job = await tx.aiWorkflowJob.findUniqueOrThrow({ where: { id: handoff.jobId } });
  const steps = await tx.aiWorkflowStep.findMany({ where: { jobId: job.id, schoolId: actor.schoolId, planVersion: job.planVersion } });
  const summaries: StepSummary[] = steps.map(step => ({ status: step.status as StepSummary["status"], kind: step.status === "HANDED_OFF_DONE" ? "write" : step.handoffId ? "handoff" : (step.receipt as { kind?: StepSummary["kind"] } | null)?.kind ?? null }));
  const status = deriveJobStatus(summaries);
  await tx.aiWorkflowJob.update({ where: { id: job.id }, data: { status, outcome: deriveOutcome(summaries), ...(status === "COMPLETED" ? { completedAt: new Date() } : {}), version: { increment: 1 } } });
  await appendEvent(tx, job, "HANDOFF_COMPLETED", handoff.stepId, { completed: true });
}
