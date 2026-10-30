import { Prisma } from "@prisma/client";
import type { AiWorkflowJob, AiWorkflowStep } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveWorkspaceCampus } from "@/lib/school-ai/access";
import { WorkflowError, toWorkflowError } from "../errors";
import { normalizeText } from "../planner/normalize";
import { planJob, type Generate } from "../planner/plan";
import { observeHandoffs } from "../executor/handoff";
import { assertQuestionnaireCurrent } from "./questionnaire";
import { prepareStep } from "../executor/prepare";
import { settleSetupResponse } from "../questionnaire/settle";
import { sha256 } from "../executor/canonical";
import { deriveJobStatus, deriveOutcome, nextStepAction, type StepStatus } from "../executor/scheduler";
import { entryFor, runExecStep, runHandoffStep } from "../executor/step-runner";
import { capability } from "../registry";
import { checkCapabilityAccess } from "../registry/gates";
import { appendEvent } from "./events";
import { aiWorkflowsV2Enabled } from "../flag";
import { mentionsCare } from "../pii/care-detector";
import { authorizeActor, capabilityContext, inTenant } from "./actor";
import { withLease } from "./lease";
import { PROVIDER_RETRIES, providerBackoffMs } from "./provider-limit";

/** Requests are bounded; questionnaire jobs come from compiled sheets (Slice 2), not from this route. */
export const startJobSchema = z.strictObject({
  message: z.string().trim().min(1).max(8000),
  campusId: z.string().min(1).max(128).nullable().optional(),
  language: z.enum(["en", "ar", "ur"]),
  idempotencyKey: z.string().min(8).max(128).regex(/^[\w-]+$/),
  parentJobId: z.string().min(1).max(128).optional(),
});
const JOB_TTL_MS = 7 * 86_400_000;
const STEP_CAP = 25;
const QUESTIONNAIRE_STEP_CAP = 150;
export const DEFAULT_BUDGET = { maxSteps: STEP_CAP, maxModelCalls: 12, maxQuestions: 8, maxReplans: 2 };

const jobWhere = (user: AuthUser, id: string) => ({ id, schoolId: user.schoolId, actorId: user.userId });

export function startJob(user: AuthUser, raw: unknown): Promise<AiWorkflowJob> {
  return inTenant(user, async () => {
    await authorizeActor(user);
    // Drain mode (control P16): with the flag off nothing new starts; existing jobs still finish.
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { slug: true } });
    if (!aiWorkflowsV2Enabled(school?.slug)) throw new WorkflowError("NOT_CONNECTED");
    const input = startJobSchema.parse(raw);
    // Checked before anything is written: the words are never stored, planned or logged as a gap.
    if (mentionsCare(input.message)) throw new WorkflowError("CARE_REFERRAL");
    const campusId = user.role === "APP_OWNER" ? null : user.role === "STUDENT" || user.role === "PARENT" ? user.campusId : await resolveWorkspaceCampus(user, input.campusId);
    if (input.campusId && input.campusId !== campusId) throw new WorkflowError("SCOPE_DENIED");
    let knowledgeQuery: string | null = null;
    let parentJobId: string | null = null;
    if (input.parentJobId) {
      const parent = await prisma.aiWorkflowJob.findFirst({ where: { ...jobWhere(user, input.parentJobId), actorRole: user.role, status: "COMPLETED" }, include: { steps: true } });
      parentJobId = parent?.id ?? null;
      const steps = parent?.steps.filter(step => step.planVersion === parent.planVersion) ?? [];
      if (steps.length === 1 && steps[0].capabilityKey === "assistant.app_knowledge" && steps[0].status === "SUCCEEDED") {
        const previous = (steps[0].modelInput as { query?: unknown })?.query;
        if (typeof previous === "string") knowledgeQuery = (await import("@/lib/rag/core")).knowledgeFollowup(input.message, previous);
      }
    }
    const requestHash = sha256({ message: input.message, campusId, role: user.role, ...(input.parentJobId ? { parentJobId: input.parentJobId } : {}) });
    const existing = await prisma.aiWorkflowJob.findUnique({ where: { schoolId_actorId_idempotencyKey: { schoolId: user.schoolId, actorId: user.userId, idempotencyKey: input.idempotencyKey } } });
    if (existing) { if (existing.requestHash !== requestHash) throw new WorkflowError("KEY_CONFLICT"); return existing; }
    try {
      return await prisma.$transaction(async tx => {
        const job = await tx.aiWorkflowJob.create({ data: {
          schoolId: user.schoolId, campusId, actorId: user.userId, actorRole: user.role, accessVersion: user.accessVersion ?? 0, origin: "FREEFORM",
          language: input.language, parentJobId, requestHash, idempotencyKey: input.idempotencyKey, budget: { ...DEFAULT_BUDGET, ...(knowledgeQuery ? { knowledgeQuery } : {}) }, expiresAt: new Date(Date.now() + JOB_TTL_MS),
          ...(user.role === "APP_OWNER" ? { unscopedReason: "platform owner request" } : {}),
        } });
        // The user's own words are the only evidence base an action may quote.
        await tx.aiWorkflowSegment.create({ data: { schoolId: user.schoolId, jobId: job.id, ordinal: 0, kind: "REQUEST", text: input.message, normalized: normalizeText(input.message) } });
        await appendEvent(tx, job, "JOB_STARTED");
        return tx.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await prisma.aiWorkflowJob.findUnique({ where: { schoolId_actorId_idempotencyKey: { schoolId: user.schoolId, actorId: user.userId, idempotencyKey: input.idempotencyKey } } });
        if (replay?.requestHash === requestHash) return replay;
        throw new WorkflowError("KEY_CONFLICT");
      }
      throw error;
    }
  });
}

export interface PlannedStep { stepKey: string; capabilityKey: string; dependsOn?: string[]; input: unknown; missingFields?: string[]; invalidFields?: string[] }

/** Persists a plan. The planner (Slice 1e) is the normal caller; class floors come from the registry, never the plan. */
export async function savePlan(user: AuthUser, jobId: string, steps: PlannedStep[]) {
  return inTenant(user, async () => {
    const job = await prisma.aiWorkflowJob.findFirst({ where: jobWhere(user, jobId) });
    if (!job) throw new WorkflowError("NOT_FOUND");
    // A questionnaire Build is compiled, not model-planned, so it may carry a whole campus (red team: chunked, capped).
    const cap = job.origin === "QUESTIONNAIRE" ? QUESTIONNAIRE_STEP_CAP : STEP_CAP;
    if (steps.length > cap) throw new WorkflowError("BUDGET_EXHAUSTED", { cap });
    const planVersion = job.planVersion + 1;
    await prisma.$transaction(async tx => {
      for (const planned of steps) {
        const entry = capability(planned.capabilityKey);
        if (!entry) throw new WorkflowError("NOT_CONNECTED");
        await tx.aiWorkflowStep.create({ data: {
          schoolId: job.schoolId, campusId: job.campusId, jobId: job.id, planVersion, stepKey: planned.stepKey, capabilityKey: entry.key, capabilityVersion: entry.version,
          staticClass: entry.class, effectiveClass: entry.class, dependsOn: planned.dependsOn ?? [], modelInput: planned.input as Prisma.InputJsonValue,
          missingFields: planned.missingFields ?? [], idempotencyKey: `wf-${job.id}-${planVersion}-${planned.stepKey}`,
          status: planned.missingFields?.length ? "NEEDS_INPUT" : "PENDING",
        } });
      }
      // A plan that lands clears any earlier provider pause, so a finished job never shows a stale error.
      await tx.aiWorkflowJob.update({ where: { id: job.id }, data: { planVersion, status: "RUNNING", errorCode: null, errorParams: Prisma.DbNull, nextWakeAt: null, version: { increment: 1 } } });
      await appendEvent(tx, job, "PLAN_READY", null, { steps: steps.length });
    });
  });
}

/** A hand-off the deciding screen has executed is a write (its receipt names who decided); an open one is not. */
const kindOf = (step: AiWorkflowStep): "write" | "read" | "draft" | "handoff" | null =>
  step.status === "HANDED_OFF_DONE" ? "write" : step.handoffId ? "handoff" : ((step.receipt as { kind?: string } | null)?.kind as "write" | "read" | "draft" | undefined) ?? null;

/**
 * Advances class-A and class-C steps and surfaces class-B steps for confirmation. Class-B steps never
 * run here (control P5): only the confirming request executes them (Slice 1f).
 */
export async function advanceJob(user: AuthUser, jobId: string, owner = "request", generate?: Generate) {
  return inTenant(user, async () => {
    await authorizeActor(user);
    const result = await withLease(jobId, user.schoolId, owner, async () => {
      const job = await prisma.aiWorkflowJob.findFirst({ where: jobWhere(user, jobId) });
      if (!job) throw new WorkflowError("NOT_FOUND");
      if (["PAUSED", "CANCELLED", "COMPLETED", "EXPIRED", "FAILED", "BLOCKED", "NEEDS_INPUT"].includes(job.status)) return job;
      try { await assertQuestionnaireCurrent(user, job); }
      catch { return prisma.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "BLOCKED", errorCode: "STALE_VERSION", version: { increment: 1 } } }); }
      if (job.status === "PLANNING") {
        // Planning calls the model; a failure is recorded on the job, never thrown past the lease.
        try {
          await planJob(user, job, generate);
          // Planning reached the model and finished (a plan, a question, an answer or "not supported"):
          // any earlier provider pause is over, so a finished job never shows a stale error.
          if (job.errorCode === "PROVIDER_UNAVAILABLE") await prisma.aiWorkflowJob.updateMany({ where: { id: job.id, schoolId: job.schoolId, errorCode: "PROVIDER_UNAVAILABLE" }, data: { errorCode: null, errorParams: Prisma.DbNull, nextWakeAt: null } });
        }
        catch (error) {
          const failure = toWorkflowError(error);
          // A provider outage, timeout or rate limit pauses with backoff (no credit was charged); the
          // worker wakes the job and plans again. After PROVIDER_RETRIES attempts it fails honestly.
          if (failure.code === "PROVIDER_UNAVAILABLE" || failure.code === "DEADLINE") {
            const attempt = (((job.errorParams ?? {}) as { attempt?: number }).attempt ?? 0) + 1;
            if (attempt <= PROVIDER_RETRIES) return prisma.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "PAUSED", errorCode: "PROVIDER_UNAVAILABLE", errorParams: { attempt, ...(failure.params.reason ? { reason: failure.params.reason } : {}) }, nextWakeAt: new Date(Date.now() + providerBackoffMs(attempt)), version: { increment: 1 } } });
          }
          return prisma.aiWorkflowJob.update({ where: { id: job.id }, data: { status: failure.code === "BUDGET_EXHAUSTED" || failure.code === "CREDITS_EXHAUSTED" ? "PAUSED" : "FAILED", errorCode: failure.code, version: { increment: 1 } } });
        }
        const planned = await prisma.aiWorkflowJob.findFirstOrThrow({ where: { id: job.id } });
        if (planned.status !== "RUNNING") return planned;
        job.planVersion = planned.planVersion; job.status = planned.status;
      }
      const ctx = await capabilityContext(user, job.campusId, job.language as "en" | "ar" | "ur");
      await observeHandoffs(job);
      for (let pass = 0; pass < QUESTIONNAIRE_STEP_CAP; pass++) {
        const steps = await prisma.aiWorkflowStep.findMany({ where: { jobId: job.id, schoolId: job.schoolId, planVersion: job.planVersion }, orderBy: { createdAt: "asc" } });
        const statuses = new Map(steps.map(step => [step.stepKey, step.status as StepStatus]));
        let progressed = false;
        for (const step of steps) {
          const action = nextStepAction({ status: step.status as StepStatus, effectiveClass: step.effectiveClass as "A" | "B" | "C", dependsOn: step.dependsOn, missingFields: step.missingFields, confirmed: false }, statuses);
          if (action === "none" || action === "wait") continue;
          const entry = entryFor(step);
          const access = await checkCapabilityAccess(ctx, entry);
          if (!access.ok) {
            await prisma.aiWorkflowStep.update({ where: { id: step.id }, data: { status: "BLOCKED", errorCode: "ROLE_NOT_ALLOWED", finishedAt: new Date(), version: { increment: 1 } } });
            progressed = true; continue;
          }
          if (action === "ask") {
            const open = await prisma.aiWorkflowQuestion.count({ where: { jobId: job.id, schoolId: job.schoolId, stepId: step.id, status: "OPEN" } });
            if (!open) await prisma.$transaction(async tx => {
              const pointers = step.missingFields.length ? step.missingFields : ["/"];
              for (const pointer of pointers.slice(0, entry.dialogueFields ? 1 : 8)) await tx.aiWorkflowQuestion.create({ data: {
                schoolId: job.schoolId, jobId: job.id, stepId: step.id, pointer, kind: "TEXT", promptKey: "FIELD", promptParams: { capability: entry.key, pointer },
              } });
              await appendEvent(tx, job, "QUESTION_ASKED", step.id, { count: Math.min(pointers.length, entry.dialogueFields ? 1 : 8) });
            });
            continue;
          }
          if (action === "skip") { await prisma.aiWorkflowStep.update({ where: { id: step.id }, data: { status: "SKIPPED", finishedAt: new Date(), version: { increment: 1 } } }); progressed = true; continue; }
          const parsed = entry.input.safeParse(step.modelInput);
          if (!parsed.success) { await prisma.aiWorkflowStep.update({ where: { id: step.id }, data: { status: "NEEDS_INPUT", missingFields: parsed.error.issues.map(issue => `/${issue.path.join("/")}`), version: { increment: 1 } } }); progressed = true; continue; }
          if (action === "await-confirm") {
            if (step.status !== "WAITING_CONFIRM") {
              await prepareStep(job, step, entry, ctx, parsed.data, async input => {
                const preview = entry.class !== "C" && entry.preview ? await entry.preview(ctx, input) : null;
                await prisma.$transaction(async tx => {
                  await tx.aiWorkflowStep.update({ where: { id: step.id }, data: { status: "WAITING_CONFIRM", boundInput: input as Prisma.InputJsonValue, inputHash: sha256({ capability: entry.key, version: entry.version, input }), preview: preview as unknown as Prisma.InputJsonValue, previewHash: preview ? sha256(preview) : null, previewVersion: { increment: 1 }, version: { increment: 1 } } });
                  await appendEvent(tx, job, "STEP_WAITING_CONFIRM", step.id);
                });
              });
              progressed = true;
            }
            continue;
          }
          if (action === "handoff" && entry.class === "C") await prepareStep(job, step, entry, ctx, parsed.data, input => runHandoffStep(ctx, job, step, entry, input));
          else if (action === "run" && entry.class === "A") await prepareStep(job, step, entry, ctx, parsed.data, input => runExecStep(ctx, job, step, entry, input));
          progressed = true;
        }
        if (!progressed) break;
      }
      const steps = await prisma.aiWorkflowStep.findMany({ where: { jobId: job.id, schoolId: job.schoolId, planVersion: job.planVersion } });
      const summaries = steps.map(step => ({ status: step.status as StepStatus, kind: kindOf(step) }));
      const status = job.planVersion === 0 ? "PLANNING" : deriveJobStatus(summaries);
      const completed = status === "COMPLETED";
      return prisma.$transaction(async tx => {
        const updated = await tx.aiWorkflowJob.update({ where: { id: job.id }, data: { status, version: { increment: 1 }, ...(completed ? { outcome: deriveOutcome(summaries), completedAt: new Date() } : {}) } });
        if (completed && job.status !== "COMPLETED") await appendEvent(tx, job, "JOB_COMPLETED", null, { outcome: updated.outcome });
        if (completed) await settleSetupResponse(tx, job, status, updated.outcome);
        return updated;
      });
    });
    if (result === null) throw new WorkflowError("LEASED");
    return result;
  });
}

export function getJob(user: AuthUser, jobId: string) {
  return inTenant(user, async () => {
    const job = await prisma.aiWorkflowJob.findFirst({ where: jobWhere(user, jobId), include: { steps: { orderBy: { createdAt: "asc" } }, handoffs: true, questions: { where: { status: "OPEN" } } } });
    if (!job) throw new WorkflowError("NOT_FOUND");
    // Historical chat receipts must not bypass a source withdrawal or an audience change.
    const { readableWhere, assertKnowledgeAccess } = await import("@/lib/rag/service");
    for (const step of job.steps) {
      const receipt = step.receipt as { detail?: { citations?: Array<{ documentId: string; version: number }>; text?: string } } | null;
      const citations = receipt?.detail?.citations;
      if (!citations?.length) continue;
      await assertKnowledgeAccess(user);
      const current = await prisma.ragDocument.findMany({ where: { ...readableWhere(user), OR: citations.map(source => ({ id: source.documentId, version: source.version })) }, select: { id: true, version: true } });
      if (citations.some(source => !current.some(doc => doc.id === source.documentId && doc.version === source.version))) {
        step.receipt = { ...(step.receipt as Prisma.JsonObject), detail: { text: "This answer used a source that changed or is no longer available to you. Ask again for current information.", citations: [] } };
      }
    }
    const conversation: Array<{ id: string; question: string; text: string }> = [];
    let parentId = job.parentJobId;
    for (let depth = 0; parentId && depth < 10; depth++) {
      const parent = await prisma.aiWorkflowJob.findFirst({ where: { ...jobWhere(user, parentId), actorRole: user.role, status: "COMPLETED" }, include: { steps: true, segments: { orderBy: { ordinal: "asc" }, take: 1 } } });
      const step = parent?.steps.find(item => item.planVersion === parent.planVersion && item.capabilityKey === "assistant.conversation" && item.status === "SUCCEEDED");
      const text = (step?.receipt as { detail?: { text?: unknown } } | null)?.detail?.text;
      if (!parent || typeof text !== "string") break;
      conversation.unshift({ id: parent.id, question: parent.segments[0]?.text ?? "", text });
      parentId = parent.parentJobId;
    }
    const request = await prisma.aiWorkflowSegment.findFirst({ where: { schoolId: user.schoolId, jobId: job.id, kind: "REQUEST" }, orderBy: { ordinal: "asc" }, select: { text: true } });
    return { ...job, conversation, requestText: request?.text };
  });
}

export function listJobs(user: AuthUser) {
  return inTenant(user, () => prisma.aiWorkflowJob.findMany({ where: { schoolId: user.schoolId, actorId: user.userId }, orderBy: { updatedAt: "desc" }, take: 20, include: { segments: { where: { kind: "REQUEST" }, orderBy: { ordinal: "asc" }, take: 1, select: { text: true } } } }));
}

/** Events after `seq` for live progress; only the job's own actor may read them (control P14). */
export function eventsAfter(user: AuthUser, jobId: string, seq: number) {
  return inTenant(user, async () => {
    const job = await prisma.aiWorkflowJob.findFirst({ where: jobWhere(user, jobId), select: { id: true, status: true, version: true, eventSeq: true } });
    if (!job) throw new WorkflowError("NOT_FOUND");
    const events = await prisma.aiWorkflowEvent.findMany({ where: { jobId, schoolId: user.schoolId, seq: { gt: seq } }, orderBy: { seq: "asc" }, take: 200, select: { seq: true, type: true, stepId: true, payload: true, createdAt: true } });
    return { job, events };
  });
}

export function cancelJob(user: AuthUser, jobId: string, version: number) {
  return inTenant(user, async () => {
    const job = await prisma.aiWorkflowJob.findFirst({ where: jobWhere(user, jobId) });
    if (!job) throw new WorkflowError("NOT_FOUND");
    if (job.version !== version) throw new WorkflowError("STALE_VERSION");
    if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(job.status)) return job;
    return prisma.$transaction(async tx => {
      // Cancelling stops what has not run. Completed steps and open hand-offs are reported, not undone.
      await tx.aiWorkflowStep.updateMany({ where: { jobId, schoolId: user.schoolId, status: { in: ["PENDING", "NEEDS_INPUT", "READY", "WAITING_CONFIRM"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
      const updated = await tx.aiWorkflowJob.update({ where: { id: jobId }, data: { status: "CANCELLED", version: { increment: 1 } } });
      await appendEvent(tx, job, "JOB_CANCELLED");
      return updated;
    });
  });
}
