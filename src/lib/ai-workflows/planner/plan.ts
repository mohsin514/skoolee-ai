import type { Prisma, AiWorkflowJob } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { generateAIDraft } from "@/lib/ai/openai";
import { Pseudonymizer, scanForPII } from "@/lib/ai/pseudonymize";
import { parseModelJson } from "@/lib/school-ai/intake";
import { capability } from "../registry";
import type { Locale } from "../registry/types";
import { WorkflowError } from "../errors";
import { registerVocabulary } from "../pii/vocabulary";
import { loadPeopleVocabulary } from "../pii/load-vocabulary";
import { dataChannel } from "../pii/data-channel";
import { capabilityContext } from "../jobs/actor";
import { assertCanSpend, recordAttempt } from "../jobs/credits";
import { appendEvent } from "../jobs/events";
import { savePlan, type PlannedStep } from "../jobs/job-service";
import { retrieve } from "./retrieve";
import { buildPlannerContext, bindHandles } from "./context";
import { checkEvidence } from "./evidence";
import { PLANNER_SYSTEM, REPAIR_SYSTEM, cardFor, planProposalSchema, type PlanProposal } from "./protocol";

export type Generate = typeof generateAIDraft;
const PLAN_TIMEOUT_MS = 15_000;

/**
 * One planning pass for a job (architecture §5): mask the user's words, retrieve a few gated
 * capabilities, ask for a whole plan in one JSON call (one repair allowed), then check it in code:
 * only retrieved capabilities, steps in dependency order, handles bound to this actor's records,
 * every required fact quoted from the user's own words. Missing facts become questions.
 */
export async function planJob(user: AuthUser, job: AiWorkflowJob, generate: Generate = generateAIDraft) {
  const language = job.language as Locale;
  const ctx = await capabilityContext(user, job.campusId, language);
  await assertCanSpend(user, job);
  const segments = await prisma.aiWorkflowSegment.findMany({ where: { jobId: job.id, schoolId: job.schoolId }, orderBy: { ordinal: "asc" } });

  const masker = new Pseudonymizer();
  masker.token(user.email, "EMAIL");
  if (user.fullName) masker.token(user.fullName, "PERSON");
  registerVocabulary(masker, await loadPeopleVocabulary(user, job.campusId), segments.map(segment => segment.text));
  const userText = segments.map(segment => ({ kind: segment.kind, text: masker.mask(segment.text) }));

  const retrieval = await retrieve(ctx, userText.map(item => item.text).join("\n"));
  const planner = await buildPlannerContext(ctx);
  const payload = {
    language, today: ctx.now.toISOString().slice(0, 10), userText,
    context: dataChannel(planner.visible),
    capabilities: retrieval.cards.map(entry => cardFor(entry, language)),
    unavailable: retrieval.unavailable.map(({ entry, reason }) => ({ capability: entry.key, whoCan: reason.whoCan ?? [] })),
  };
  let prompt = masker.mask(JSON.stringify(payload));
  for (const hit of scanForPII(prompt)) masker.token(hit, "ID");
  prompt = masker.mask(prompt);

  const call = async (system: string, body: string) => {
    await appendEventTx(job, "MODEL_ATTEMPT_STARTED");
    const result = await generate({ system, prompt: body, temperature: 0, maxTokens: 1500, json: true, signal: AbortSignal.timeout(PLAN_TIMEOUT_MS) }).catch(error => {
      throw new WorkflowError(error instanceof Error && error.name === "AbortError" ? "DEADLINE" : "PROVIDER_UNAVAILABLE");
    });
    return result;
  };
  const first = await call(PLANNER_SYSTEM, prompt);
  await recordAttempt(user, job, { model: first.model, tokensUsed: first.tokensUsed, action: "PLAN", stepKey: null });
  let proposal = parse(first.text);
  if (!proposal) {
    // One repair for a syntax or shape error; it is logged but does not take a second credit.
    const repair = await call(REPAIR_SYSTEM, JSON.stringify({ invalid: first.text.slice(0, 6000), required: "{kind, steps, question, answer, unsupportedNearest}" }));
    await recordAttempt(user, job, { model: repair.model, tokensUsed: 0, action: "PLAN_REPAIR", stepKey: null });
    proposal = parse(repair.text);
  }
  if (!proposal) throw new WorkflowError("INVALID_INPUT");
  proposal = masker.unmaskObject(proposal);

  const allowed = new Map(retrieval.cards.map(entry => [entry.key, entry]));
  if (proposal.kind === "answer" && proposal.answer) return persistPlan(user, job, [{ stepKey: "s1", capabilityKey: "assistant.answer", input: { text: proposal.answer } }]);
  if (proposal.kind === "ask" && proposal.question) return askQuestion(job, proposal.question);
  if (proposal.kind === "unsupported" || !proposal.steps.length) return notSupported(user, job, proposal.unsupportedNearest, userText.map(item => item.text).join(" "));

  const steps: PlannedStep[] = [];
  const seen = new Set<string>();
  for (const step of proposal.steps) {
    const entry = allowed.get(step.capability);
    // A capability that was not retrieved for this actor, or a dependency on a later step, is never accepted.
    if (!entry || seen.has(step.key) || step.dependsOn.some(key => !seen.has(key))) return notSupported(user, job, step.capability, userText.map(item => item.text).join(" "));
    seen.add(step.key);
    const bound = bindHandles(step.input, planner.ids);
    const evidence = checkEvidence(bound.value, entry.evidence, step.evidence, segments);
    const parsed = entry.input.safeParse(bound.value);
    const schemaMissing = parsed.success ? [] : parsed.error.issues.map(issue => `/${issue.path.join("/")}`);
    steps.push({ stepKey: step.key, capabilityKey: entry.key, dependsOn: step.dependsOn, input: bound.value, missingFields: [...new Set([...bound.missing, ...evidence.missing, ...schemaMissing])] });
  }
  return persistPlan(user, job, steps);
}

function parse(text: string): PlanProposal | null {
  try { const result = planProposalSchema.safeParse(parseModelJson(text)); return result.success ? result.data : null; }
  catch { return null; }
}

async function appendEventTx(job: AiWorkflowJob, type: Parameters<typeof appendEvent>[2]) {
  await prisma.$transaction(tx => appendEvent(tx, job, type));
}

async function persistPlan(user: AuthUser, job: AiWorkflowJob, steps: PlannedStep[]) {
  await savePlan(user, job.id, steps);
  const missing = steps.flatMap(step => (step.missingFields ?? []).map(pointer => ({ step, pointer })));
  if (missing.length) await prisma.$transaction(async tx => {
    const rows = await tx.aiWorkflowStep.findMany({ where: { jobId: job.id, schoolId: job.schoolId, stepKey: { in: missing.map(item => item.step.stepKey) } }, orderBy: { planVersion: "desc" } });
    for (const { step, pointer } of missing.slice(0, 8)) {
      const row = rows.find(item => item.stepKey === step.stepKey);
      await tx.aiWorkflowQuestion.create({ data: { schoolId: job.schoolId, jobId: job.id, stepId: row?.id ?? null, pointer, kind: "TEXT", promptKey: "FIELD", promptParams: { capability: step.capabilityKey, pointer } } });
    }
    await tx.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "NEEDS_INPUT", version: { increment: 1 } } });
    await appendEvent(tx, job, "QUESTION_ASKED", null, { count: Math.min(missing.length, 8) });
  });
}

async function askQuestion(job: AiWorkflowJob, question: string) {
  await prisma.$transaction(async tx => {
    await tx.aiWorkflowQuestion.create({ data: { schoolId: job.schoolId, jobId: job.id, kind: "TEXT", promptKey: "MODEL", promptParams: { text: question } as Prisma.InputJsonValue } });
    await tx.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "NEEDS_INPUT", version: { increment: 1 } } });
    await appendEvent(tx, job, "QUESTION_ASKED", null, { count: 1 });
  });
}

/** Records what people asked for that is not connected, masked, so the next adapters follow demand. */
async function notSupported(user: AuthUser, job: AiWorkflowJob, nearest: string | null, maskedText: string) {
  const nearestKey = nearest && capability(nearest) ? nearest : "";
  const reason = nearestKey ? "NOT_IN_ROLE" : "NOT_CONNECTED";
  const summary = maskedText.slice(0, 200);
  await prisma.$transaction(async tx => {
    await tx.aiCapabilityGap.upsert({
      where: { schoolId_actorRole_nearestKey_reason: { schoolId: job.schoolId, actorRole: user.role, nearestKey, reason } },
      create: { schoolId: job.schoolId, actorRole: user.role, language: job.language, reason, nearestKey, maskedSummary: scanForPII(summary).length ? "" : summary },
      update: { count: { increment: 1 }, lastSeenAt: new Date() },
    });
    await tx.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "COMPLETED", outcome: "NOT_SUPPORTED", completedAt: new Date(), errorParams: nearestKey ? { nearest: nearestKey } : undefined, version: { increment: 1 } } });
    await appendEvent(tx, job, "JOB_COMPLETED", null, { outcome: "NOT_SUPPORTED" });
  });
}

