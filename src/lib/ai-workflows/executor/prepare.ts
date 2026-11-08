import type { AiWorkflowJob, AiWorkflowStep, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CapabilityContext, CapabilityEntry } from "../registry/types";
import { InputRequired, WorkflowError, toWorkflowError } from "../errors";
import { checkCapabilityAccess } from "../registry/gates";
import { appendEvent } from "../jobs/events";

/**
 * Runs an entry's resolver (and, through `then`, its preview) before a step is shown or run. A field
 * the resolver cannot bind becomes a question on the step; a domain refusal fails only that step.
 * Either way nothing has been written yet.
 */
export async function prepareStep<T>(job: AiWorkflowJob, step: AiWorkflowStep, entry: CapabilityEntry, ctx: CapabilityContext, input: unknown, then: (resolved: unknown) => Promise<T>): Promise<T | null> {
  try {
    const gate = await checkCapabilityAccess(ctx, entry);
    if (!gate.ok) throw new WorkflowError(gate.code === "SEAT" ? "SEAT_HELD" : gate.code === "SCOPE" ? "SCOPE_DENIED" : "ROLE_NOT_ALLOWED");
    const resolved = entry.resolve ? await entry.resolve(ctx, input) : input;
    return await then(resolved);
  } catch (thrown) {
    if (thrown instanceof InputRequired) {
      await prisma.$transaction(async tx => {
        for (const field of thrown.fields.slice(0, 8)) await tx.aiWorkflowQuestion.create({ data: {
          schoolId: job.schoolId, jobId: job.id, stepId: step.id, pointer: field.pointer, kind: field.options?.length ? "CHOICE" : "TEXT",
          promptKey: field.promptKey, promptParams: { capability: entry.key, ...(field.params ?? {}) } as Prisma.InputJsonValue, options: (field.options ?? []) as Prisma.InputJsonValue,
        } });
        await tx.aiWorkflowStep.update({ where: { id: step.id }, data: { status: "NEEDS_INPUT", missingFields: thrown.fields.map(field => field.pointer), version: { increment: 1 } } });
        await appendEvent(tx, job, "QUESTION_ASKED", step.id, { count: Math.min(thrown.fields.length, 8) });
      });
      return null;
    }
    const error = toWorkflowError(thrown);
    await prisma.$transaction(async tx => {
      await tx.aiWorkflowStep.update({ where: { id: step.id }, data: { status: "FAILED", errorCode: error.code, errorParams: error.params as Prisma.InputJsonValue, finishedAt: new Date(), version: { increment: 1 } } });
      await appendEvent(tx, job, "STEP_FAILED", step.id, { code: error.code });
    });
    return null;
  }
}
