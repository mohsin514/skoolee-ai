import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { WorkflowError } from "../errors";
import { sha256 } from "../executor/canonical";
import { entryFor, runExecStep } from "../executor/step-runner";
import { normalizeText } from "../planner/normalize";
import { authorizeActor, capabilityContext, inTenant } from "./actor";
import { appendEvent } from "./events";
import { advanceJob, cancelJob } from "./job-service";
import { withLease } from "./lease";
import { assertQuestionnaireCurrent } from "./questionnaire";
import type { Generate } from "../planner/plan";

/**
 * Commands a user sends to their own job. A confirmation is bound to the step's exact input hash,
 * preview hash and preview version, the job version, the signed-in session and a client command id,
 * and expires after ten minutes. A bare "yes" typed or spoken anywhere is not a command (control P4).
 */
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const commandId = z.string().min(8).max(128).regex(/^[\w-]+$/);
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("confirm"), jobVersion: z.number().int().positive(), clientCommandId: commandId,
    steps: z.array(z.strictObject({ stepId: z.string().min(1).max(128), previewVersion: z.number().int().positive(), previewHash: hex, inputHash: hex })).min(1).max(10) }),
  z.strictObject({ type: z.literal("answer"), jobVersion: z.number().int().positive(), clientCommandId: commandId, text: z.string().trim().min(1).max(4000) }),
  z.strictObject({ type: z.literal("amend"), jobVersion: z.number().int().positive(), stepId: z.string().min(1).max(128), previewVersion: z.number().int().positive(), actionId: z.string().min(1).max(64), expect: z.number().int().min(0) }),
  z.strictObject({ type: z.literal("pause"), jobVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("resume"), jobVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("cancel"), jobVersion: z.number().int().positive() }),
]);
export const CONFIRMATION_TTL_MS = 10 * 60_000;

export function runCommand(user: AuthUser, jobId: string, raw: unknown, sessionTokenHash: string | null, generate?: Generate) {
  return inTenant(user, async () => {
    await authorizeActor(user);
    const command = commandSchema.parse(raw);
    if (command.type === "cancel") return cancelJob(user, jobId, command.jobVersion);
    const job = await prisma.aiWorkflowJob.findFirst({ where: { id: jobId, schoolId: user.schoolId, actorId: user.userId } });
    if (!job) throw new WorkflowError("NOT_FOUND");

    if (command.type === "confirm") {
      const previous = await prisma.aiWorkflowConfirmation.findFirst({ where: { schoolId: user.schoolId, confirmedById: user.userId, clientCommandId: `${command.clientCommandId}:0` } });
      if (previous) return advanceJob(user, jobId, "request", generate); // a repeated click replays, it never runs twice
      if (job.version !== command.jobVersion) throw new WorkflowError("STALE_VERSION");
      await assertQuestionnaireCurrent(user, job);
      const ran = await withLease(jobId, user.schoolId, "confirm", async () => {
        const ctx = await capabilityContext(user, job.campusId, job.language as "en" | "ar" | "ur");
        const setHash = sha256(command.steps);
        for (const [index, item] of command.steps.entries()) {
          const step = await prisma.aiWorkflowStep.findFirst({ where: { id: item.stepId, jobId, schoolId: user.schoolId } });
          if (!step || step.status !== "WAITING_CONFIRM") throw new WorkflowError("SUPERSEDED");
          if (step.previewVersion !== item.previewVersion || step.previewHash !== item.previewHash || step.inputHash !== item.inputHash) throw new WorkflowError("STALE_VERSION");
          const entry = entryFor(step);
          if (entry.class === "C") throw new WorkflowError("CONFIRM_REQUIRED");
          // Re-read what the user saw: if the records behind the preview changed, they confirm again.
          const input = entry.input.parse(step.boundInput);
          const fresh = entry.preview ? await entry.preview(ctx, input) : null;
          if (fresh && sha256(fresh) !== step.previewHash) {
            await prisma.aiWorkflowStep.update({ where: { id: step.id }, data: { preview: fresh as unknown as Prisma.InputJsonValue, previewHash: sha256(fresh), previewVersion: { increment: 1 }, version: { increment: 1 } } });
            throw new WorkflowError("STALE_VERSION");
          }
          await prisma.aiWorkflowConfirmation.create({ data: { schoolId: user.schoolId, jobId, stepId: step.id, previewVersion: step.previewVersion, previewHash: step.previewHash!, inputHash: step.inputHash!, jobVersion: job.version, batchId: command.steps.length > 1 ? command.clientCommandId : null, setHash, confirmedById: user.userId, sessionTokenHash, clientCommandId: `${command.clientCommandId}:${index}`, expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS) } });
          await runExecStep(ctx, job, step, entry, input, { confirmed: true });
        }
        return true;
      });
      if (ran === null) throw new WorkflowError("LEASED");
      return advanceJob(user, jobId, "request", generate);
    }

    if (command.type === "answer") {
      if (job.status !== "NEEDS_INPUT") throw new WorkflowError("SUPERSEDED");
      if (job.version !== command.jobVersion) throw new WorkflowError("STALE_VERSION");
      await prisma.$transaction(async tx => {
        const last = await tx.aiWorkflowSegment.findFirst({ where: { jobId, schoolId: user.schoolId }, orderBy: { ordinal: "desc" }, select: { ordinal: true } });
        if ((last?.ordinal ?? 0) >= 30) throw new WorkflowError("BUDGET_EXHAUSTED", { cap: 30 });
        // The answer joins the user's own words; the next plan replays anything already committed.
        await tx.aiWorkflowSegment.create({ data: { schoolId: user.schoolId, jobId, ordinal: (last?.ordinal ?? 0) + 1, kind: "ANSWER", text: command.text, normalized: normalizeText(command.text) } });
        await tx.aiWorkflowQuestion.updateMany({ where: { jobId, schoolId: user.schoolId, status: "OPEN" }, data: { status: "ANSWERED", answer: { segment: (last?.ordinal ?? 0) + 1 }, answeredById: user.userId, answeredAt: new Date() } });
        await tx.aiWorkflowStep.updateMany({ where: { jobId, schoolId: user.schoolId, planVersion: job.planVersion, status: { in: ["PENDING", "NEEDS_INPUT", "READY", "WAITING_CONFIRM"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
        await tx.aiWorkflowJob.update({ where: { id: jobId }, data: { status: "PLANNING", version: { increment: 1 } } });
        await appendEvent(tx, job, "QUESTION_ANSWERED");
      });
      return advanceJob(user, jobId, "request", generate);
    }

    if (job.version !== command.jobVersion) throw new WorkflowError("STALE_VERSION");
    if (command.type === "amend") {
      // A person's own change to a waiting step ("Mark the other 31 present"). Only fields the entry
      // reserves for people can change, only to a value the preview offered, and only while the count
      // they saw is still true. The step then waits for a fresh confirmation of the new preview.
      const ran = await withLease(jobId, user.schoolId, "amend", async () => {
        const step = await prisma.aiWorkflowStep.findFirst({ where: { id: command.stepId, jobId, schoolId: user.schoolId } });
        if (!step || step.status !== "WAITING_CONFIRM") throw new WorkflowError("SUPERSEDED");
        if (step.previewVersion !== command.previewVersion) throw new WorkflowError("STALE_VERSION");
        const entry = entryFor(step);
        const offered = (step.preview as { actions?: Array<{ id: string; patch: Record<string, unknown>; expect: number }> } | null)?.actions?.find(action => action.id === command.actionId);
        if (!offered || offered.expect !== command.expect || Object.keys(offered.patch).some(key => !entry.humanFields?.includes(key))) throw new WorkflowError("INVALID_INPUT");
        if (entry.class === "C" || !entry.preview) throw new WorkflowError("INVALID_INPUT");
        const ctx = await capabilityContext(user, job.campusId, job.language as "en" | "ar" | "ur");
        // The count the person saw must still hold against today's records (a pupil joined, a mark arrived).
        const current = await entry.preview(ctx, entry.input.parse(step.boundInput));
        if (current.actions?.find(action => action.id === command.actionId)?.expect !== command.expect) throw new WorkflowError("STALE_VERSION");
        const input = entry.input.parse({ ...(step.boundInput as Record<string, unknown>), ...offered.patch });
        const resolved = entry.resolve ? await entry.resolve(ctx, input) : input;
        const preview = await entry.preview(ctx, resolved);
        await prisma.$transaction(async tx => {
          await tx.aiWorkflowStep.update({ where: { id: step.id }, data: { boundInput: resolved as Prisma.InputJsonValue, inputHash: sha256({ capability: entry.key, version: entry.version, input: resolved }), preview: preview as unknown as Prisma.InputJsonValue, previewHash: sha256(preview), previewVersion: { increment: 1 }, version: { increment: 1 } } });
          await tx.aiWorkflowJob.update({ where: { id: jobId }, data: { version: { increment: 1 } } });
          await appendEvent(tx, job, "STEP_WAITING_CONFIRM", step.id, { amended: command.actionId });
        });
        return true;
      });
      if (ran === null) throw new WorkflowError("LEASED");
      return prisma.aiWorkflowJob.findFirstOrThrow({ where: { id: jobId } });
    }
    if (command.type === "pause") {
      if (["COMPLETED", "CANCELLED", "EXPIRED", "FAILED"].includes(job.status)) return job;
      return prisma.$transaction(async tx => { const updated = await tx.aiWorkflowJob.update({ where: { id: jobId }, data: { status: "PAUSED", version: { increment: 1 } } }); await appendEvent(tx, job, "JOB_PAUSED"); return updated; });
    }
    if (job.status !== "PAUSED" && job.status !== "FAILED") return job;
    await prisma.$transaction(async tx => { await tx.aiWorkflowJob.update({ where: { id: jobId }, data: { status: job.planVersion ? "RUNNING" : "PLANNING", errorCode: null, version: { increment: 1 } } }); await appendEvent(tx, job, "JOB_RESUMED"); });
    return advanceJob(user, jobId, "request", generate);
  });
}
