import type { AiWorkflowJob, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { WorkflowError } from "../errors";
import { appendEvent } from "../jobs/events";
import type { Receipt } from "../registry/types";

/**
 * Hand-offs finish on the screen that already decides the work. The engine never takes anyone's word
 * that it happened: it observes the domain (control P7). A RECORD_APPROVAL hand-off is done when the
 * saved record has an execution receipt; it is declined when the record is archived unapproved.
 */
export async function observeHandoffs(job: AiWorkflowJob) {
  const open = await prisma.aiWorkflowHandoff.findMany({ where: { jobId: job.id, schoolId: job.schoolId, status: { in: ["OPEN", "CLAIMED"] }, kind: "RECORD_APPROVAL", recordId: { not: null } } });
  let changed = 0;
  for (const handoff of open) {
    const execution = await prisma.schoolAiExecution.findFirst({ where: { schoolId: job.schoolId, recordId: handoff.recordId!, createdAt: { gte: handoff.createdAt } }, orderBy: { createdAt: "asc" }, select: { id: true, operation: true, requestedById: true } });
    const record = execution ? null : await prisma.schoolAiRecord.findFirst({ where: { id: handoff.recordId!, schoolId: job.schoolId }, select: { status: true } });
    if (!execution && record?.status !== "ARCHIVED") continue;
    const receipt: Receipt = execution
      ? { kind: "handoff", capability: execution.operation, entities: [{ model: "schoolAiExecution", id: execution.id }], counts: {}, link: handoff.targetRoute, replayed: false, detail: { decidedBy: execution.requestedById === job.actorId ? "requester" : "approver" } }
      : { kind: "handoff", capability: "declined", entities: [], counts: {}, link: handoff.targetRoute, replayed: false };
    await prisma.$transaction(async tx => {
      const updated = await tx.aiWorkflowHandoff.updateMany({ where: { id: handoff.id, status: handoff.status }, data: execution
        ? { status: "COMPLETED", completedModel: "schoolAiExecution", completedId: execution.id, completedById: execution.requestedById, completedReceipt: receipt as unknown as Prisma.InputJsonValue }
        : { status: "DECLINED" } });
      if (!updated.count) return;
      await tx.aiWorkflowStep.updateMany({ where: { id: handoff.stepId, schoolId: job.schoolId, status: "WAITING_HANDOFF" }, data: execution
        ? { status: "HANDED_OFF_DONE", receipt: receipt as unknown as Prisma.InputJsonValue, finishedAt: new Date(), version: { increment: 1 } }
        : { status: "FAILED", errorCode: "DOMAIN_REFUSED", finishedAt: new Date(), version: { increment: 1 } } });
      await appendEvent(tx, job, "HANDOFF_COMPLETED", handoff.stepId, { completed: Boolean(execution) });
      changed++;
    });
  }
  return changed;
}

/** Open hand-offs this person may decide: their role is targeted, same school (and campus when scoped), not their own request. */
export function handoffsFor(user: AuthUser) {
  return prisma.aiWorkflowHandoff.findMany({
    where: { schoolId: user.schoolId, status: { in: ["OPEN", "CLAIMED"] }, targetRoles: { has: user.role }, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId }), expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, kind: true, targetRoute: true, originRole: true, recordId: true, status: true, claimedById: true, createdAt: true, expiresAt: true },
  });
}

/** Claiming is a compare-and-set so two approvers cannot both act on one hand-off. */
export async function claimHandoff(user: AuthUser, id: string) {
  const handoff = await prisma.aiWorkflowHandoff.findFirst({ where: { id, schoolId: user.schoolId, targetRoles: { has: user.role } } });
  if (!handoff || (user.role !== "SUPER_ADMIN" && handoff.campusId !== user.campusId)) throw new WorkflowError("NOT_FOUND");
  const now = new Date();
  const claimed = await prisma.aiWorkflowHandoff.updateMany({
    where: { id, status: { in: ["OPEN", "CLAIMED"] }, OR: [{ claimedById: null }, { claimedById: user.userId }, { claimExpiresAt: { lte: now } }] },
    data: { status: "CLAIMED", claimedById: user.userId, claimedAt: now, claimExpiresAt: new Date(now.getTime() + 30 * 60_000) },
  });
  if (!claimed.count) throw new WorkflowError("LEASED");
  return prisma.aiWorkflowHandoff.findUniqueOrThrow({ where: { id }, select: { id: true, kind: true, targetRoute: true, recordId: true, prefill: true, status: true } });
}
