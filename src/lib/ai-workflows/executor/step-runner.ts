import { Prisma } from "@prisma/client";
import type { AiWorkflowJob, AiWorkflowStep } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { capability } from "../registry";
import { runGates } from "../registry/gates";
import type { CapabilityContext, ExecEntry, HandoffEntry, HandoffPrepared, Receipt } from "../registry/types";
import { EscalationRequired, WorkflowError, toWorkflowError } from "../errors";
import { appendEvent } from "../jobs/events";
import { sha256 } from "./canonical";
import { isPracticeSchool } from "../practice";

/**
 * Runs one step. Every write goes through the intent ledger:
 *   INTENT row (unique per school, actor, key) → domain write with the same key → COMMITTED + receipt.
 * A replay that finds COMMITTED returns the stored receipt without touching the domain. A replay that
 * finds a bare INTENT (crash between write and commit) retries only when the adapter's own write is
 * idempotent; otherwise the step becomes UNCERTAIN and a person checks the domain screen.
 * Class C steps never execute: they prepare a hand-off.
 */
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const isUnique = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function settle(step: AiWorkflowStep, job: AiWorkflowJob, data: Prisma.AiWorkflowStepUpdateManyMutationInput, event: Parameters<typeof appendEvent>[2], payload: Record<string, string | number | boolean | null> = {}) {
  await prisma.$transaction(async tx => {
    const updated = await tx.aiWorkflowStep.updateMany({ where: { id: step.id, schoolId: step.schoolId, version: step.version }, data: { ...data, version: { increment: 1 } } });
    if (updated.count !== 1) throw new WorkflowError("STALE_VERSION");
    await appendEvent(tx, job, event, step.id, payload);
  });
}

/**
 * The domain idempotency key comes from the step's content, not its plan position: a re-plan after a
 * follow-up answer that repeats an already committed step replays its receipt instead of writing again.
 */
export function effectKey(jobId: string, capabilityKey: string, capabilityVersion: number, input: unknown) {
  return `wf-${jobId}-${sha256({ capability: capabilityKey, version: capabilityVersion, input }).slice(0, 40)}`;
}

export async function runExecStep(ctx: CapabilityContext, job: AiWorkflowJob, step: AiWorkflowStep, entry: ExecEntry, input: unknown, opts: { confirmed?: boolean } = {}): Promise<Receipt | null> {
  // Class B runs only inside the user's confirming request (control P5); the worker and advance never pass this.
  if (step.effectiveClass !== "A" && !opts.confirmed) throw new WorkflowError("CONFIRM_REQUIRED");
  if (entry.risk !== "READ" && await isPracticeSchool(job.schoolId)) {
    await settle(step, job, { status: "FAILED", errorCode: "PRACTICE_MODE", boundInput: json(input), finishedAt: new Date() }, "STEP_FAILED", { code: "PRACTICE_MODE" });
    return null;
  }
  const inputHash = sha256({ capability: entry.key, version: entry.version, input });
  const key = effectKey(job.id, entry.key, entry.version, input);
  let intent = await prisma.aiWorkflowIntent.findUnique({ where: { schoolId_actorId_idempotencyKey: { schoolId: job.schoolId, actorId: job.actorId, idempotencyKey: key } } });
  if (intent && intent.inputHash !== inputHash) throw new WorkflowError("KEY_CONFLICT");
  if (intent?.state === "COMMITTED" || intent?.state === "RECONCILED") {
    const receipt = { ...(intent.receipt as unknown as Receipt), replayed: true };
    await settle(step, job, { status: "SUCCEEDED", receipt: json(receipt), inputHash, finishedAt: new Date() }, "STEP_SUCCEEDED", { replayed: true });
    return receipt;
  }
  if (intent && entry.idempotency.mode === "natural") {
    await prisma.aiWorkflowIntent.update({ where: { id: intent.id }, data: { state: "UNCERTAIN" } });
    await settle(step, job, { status: "UNCERTAIN", errorCode: "UNCERTAIN", finishedAt: new Date() }, "STEP_UNCERTAIN");
    return null;
  }
  if (!intent) {
    try {
      intent = await prisma.aiWorkflowIntent.create({ data: { schoolId: job.schoolId, campusId: job.campusId, jobId: job.id, actorId: job.actorId, stepId: step.id, idempotencyKey: key, capabilityKey: entry.key, capabilityVersion: entry.version, inputHash } });
    } catch (error) {
      if (isUnique(error)) throw new WorkflowError("LEASED");
      throw error;
    }
  }
  await settle(step, job, { status: "RUNNING", inputHash, boundInput: json(input), startedAt: new Date() }, "STEP_RUNNING");
  const running = { ...step, version: step.version + 1 };
  try {
    const gate = await runGates(ctx, entry.gates);
    if (!gate.ok) throw new WorkflowError(gate.code === "SEAT" ? "SEAT_HELD" : gate.code === "SCOPE" ? "SCOPE_DENIED" : "ROLE_NOT_ALLOWED");
    const receipt = await entry.execute(ctx, input, { idempotencyKey: key });
    await prisma.$transaction(async tx => {
      await tx.aiWorkflowIntent.update({ where: { id: intent!.id }, data: { state: "COMMITTED", receipt: json(receipt), committedAt: new Date() } });
      const updated = await tx.aiWorkflowStep.updateMany({ where: { id: step.id, schoolId: step.schoolId, version: running.version }, data: { status: "SUCCEEDED", receipt: json(receipt), finishedAt: new Date(), version: { increment: 1 } } });
      if (updated.count !== 1) throw new WorkflowError("STALE_VERSION");
      await appendEvent(tx, job, "STEP_SUCCEEDED", step.id, { kind: receipt.kind, entities: receipt.entities.length });
    });
    return receipt;
  } catch (thrown) {
    if (thrown instanceof EscalationRequired) {
      // Policy needs a second person: nothing was applied, and the saved proposal goes to an eligible approver.
      await prisma.aiWorkflowIntent.update({ where: { id: intent.id }, data: { state: "FAILED" } });
      await prisma.aiWorkflowStep.updateMany({ where: { id: step.id, schoolId: step.schoolId, version: running.version }, data: { effectiveClass: "C", status: "PENDING", version: { increment: 1 } } });
      await openHandoff(job, { ...running, version: running.version + 1 }, thrown.prepared, key, input);
      return null;
    }
    const error = toWorkflowError(thrown);
    // A domain refusal or a gate means nothing was written; a deadline or internal error might have been.
    const maybeWritten = error.code === "DEADLINE" || error.code === "INTERNAL";
    const status = maybeWritten ? (entry.idempotency.mode === "natural" ? "UNCERTAIN" : "FAILED_UNVERIFIED") : "FAILED";
    await prisma.aiWorkflowIntent.update({ where: { id: intent.id }, data: { state: maybeWritten ? "UNCERTAIN" : "FAILED" } });
    await settle(running, job, { status, errorCode: error.code, errorParams: json(error.params), finishedAt: new Date() }, status === "FAILED" ? "STEP_FAILED" : "STEP_UNCERTAIN", { code: error.code });
    return null;
  }
}

export async function runHandoffStep(ctx: CapabilityContext, job: AiWorkflowJob, step: AiWorkflowStep, entry: HandoffEntry, input: unknown) {
  if (await isPracticeSchool(job.schoolId)) {
    await settle(step, job, { status: "FAILED", errorCode: "PRACTICE_MODE", boundInput: json(input), finishedAt: new Date() }, "STEP_FAILED", { code: "PRACTICE_MODE" });
    return null;
  }
  const gate = await runGates(ctx, entry.gates);
  if (!gate.ok) {
    await settle(step, job, { status: "BLOCKED", errorCode: gate.code === "SEAT" ? "SEAT_HELD" : "ROLE_NOT_ALLOWED", finishedAt: new Date() }, "STEP_FAILED", { code: gate.code });
    return null;
  }
  const key = effectKey(job.id, entry.key, entry.version, input);
  const existing = await prisma.aiWorkflowHandoff.findUnique({ where: { schoolId_idempotencyKey: { schoolId: job.schoolId, idempotencyKey: key } } });
  if (existing) {
    await settle(step, job, { status: "WAITING_HANDOFF", handoffId: existing.id, boundInput: json(input) }, "STEP_HANDED_OFF", { kind: existing.kind });
    return existing;
  }
  return openHandoff(job, step, await entry.handoff.prepare(ctx, input, { idempotencyKey: key }), key, input);
}

async function openHandoff(job: AiWorkflowJob, step: AiWorkflowStep, prepared: HandoffPrepared, key: string, input: unknown) {
  const handoff = await prisma.aiWorkflowHandoff.create({ data: {
    schoolId: job.schoolId, campusId: job.campusId, jobId: job.id, stepId: step.id, kind: prepared.kind, targetRoute: prepared.link, targetRoles: [...prepared.targetRoles],
    originRole: job.actorRole, originUserId: job.actorId, recordId: typeof prepared.prefill.recordId === "string" ? prepared.prefill.recordId : null,
    recordVersion: typeof prepared.prefill.version === "number" ? prepared.prefill.version : null, prefill: json(prepared.prefill), prefillHash: sha256(prepared.prefill),
    idempotencyKey: key, expiresAt: new Date(Date.now() + 14 * 86_400_000),
  } });
  await settle(step, job, { status: "WAITING_HANDOFF", handoffId: handoff.id, boundInput: json(input) }, "STEP_HANDED_OFF", { kind: handoff.kind });
  return handoff;
}

/** Validates the step's input against its entry; the planner (Slice 1e) binds EntityRefs before this. */
export function entryFor(step: Pick<AiWorkflowStep, "capabilityKey" | "capabilityVersion">) {
  const entry = capability(step.capabilityKey);
  if (!entry || entry.version !== step.capabilityVersion) throw new WorkflowError("NOT_CONNECTED");
  return entry;
}
