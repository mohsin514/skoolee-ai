import { isCampusClassCount, quotedAnnouncement } from "./campus-intent";
import { checkCapabilityAccess } from "../registry/gates";
import { PLANS } from "@/config/plans";
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
import { acquireProviderSlot } from "../jobs/provider-limit";
import { appendEvent } from "../jobs/events";
import { savePlan, type PlannedStep } from "../jobs/job-service";
import { retrieve } from "./retrieve";
import { buildPlannerContext, bindHandles } from "./context";
import { buildRolePlan } from "./role-plan";
import { planPricingDialogue } from "./pricing-dialogue";
import { planFormDialogue } from "./form-dialogue";
import { checkEvidence, retainLiteralFields } from "./evidence";
import { PLANNER_SYSTEM, REPAIR_SYSTEM, SECOND_LOOK, cardFor, planProposalSchema, type PlanProposal } from "./protocol";
import { aiOutputSchema } from "@/lib/ai/output-schema";
import { hasMultipleActions, isAppGuidanceRequest, isGuidanceQuestion, plannerInput } from "./conversation";
import { isSocialTurn, SOCIAL_SYSTEM } from "./social";
import { sensitiveKnowledgeRequest } from "@/lib/rag/core";

export type Generate = typeof generateAIDraft;
const PLAN_TIMEOUT_MS = 15_000;
/**
 * The planner's OpenAI model. gpt-4o-mini refused plainly connected requests (e.g. "log a call" with
 * front_desk.call_log offered first); on the 27-request all-role check gpt-4o planned all of them and
 * still refused off-topic ones. Set AI_WORKFLOWS_PLANNER_MODEL to override; the rest of the app keeps OPENAI_MODEL.
 */
export const PLANNER_MODEL = process.env.AI_WORKFLOWS_PLANNER_MODEL || "gpt-4o";

/**
 * One planning pass for a job (architecture §5): mask the user's words, retrieve a few gated
 * capabilities, ask for a whole plan in one JSON call (one repair allowed), then check it in code:
 * only retrieved capabilities, steps in dependency order, handles bound to this actor's records,
 * every required fact quoted from the user's own words. Missing facts become questions.
 */
export async function planJob(user: AuthUser, job: AiWorkflowJob, generate: Generate = generateAIDraft) {
  const language = job.language as Locale;
  const ctx = await capabilityContext(user, job.campusId, language);
  const segments = await prisma.aiWorkflowSegment.findMany({ where: { jobId: job.id, schoolId: job.schoolId }, orderBy: { ordinal: "asc" } });
  const conversationHistory: Array<{ user: string; assistant: string }> = [];
  let parentId = job.parentJobId;
  for (let depth = 0; parentId && depth < 4; depth++) {
    const parent = await prisma.aiWorkflowJob.findFirst({ where: { id: parentId, schoolId: user.schoolId, actorId: user.userId, actorRole: user.role, status: "COMPLETED" }, include: { segments: { orderBy: { ordinal: "asc" } }, steps: true } });
    const replies = parent?.steps.filter(step => step.planVersion === parent.planVersion && step.capabilityKey === "assistant.conversation" && step.status === "SUCCEEDED") ?? [];
    if (!parent || replies.length !== 1) break;
    const text = (replies[0].receipt as { detail?: { text?: unknown } } | null)?.detail?.text;
    if (typeof text !== "string") break;
    conversationHistory.unshift({ user: parent.segments[0]?.text.slice(0, 1000) ?? "", assistant: text.slice(0, 1200) });
    parentId = parent.parentJobId;
  }
  const converse = async () => {
    await assertCanSpend(user, job);
    const masker = new Pseudonymizer();
    masker.token(user.email, "EMAIL");
    if (user.fullName) masker.token(user.fullName, "PERSON");
    const payload = JSON.stringify({ language, role: user.role, roleGuidance: await buildRolePlan(ctx), history: dataChannel(conversationHistory), message: segments.map(segment => segment.text).join("\n").slice(-8000) });
    registerVocabulary(masker, await loadPeopleVocabulary(user, job.campusId), [payload]);
    for (const hit of scanForPII(payload)) masker.token(hit, "ID");
    await acquireProviderSlot();
    await appendEventTx(job, "MODEL_ATTEMPT_STARTED");
    const result = await generate({ system: SOCIAL_SYSTEM, prompt: masker.mask(payload), temperature: 0.3, maxTokens: 500, json: true, signal: AbortSignal.timeout(PLAN_TIMEOUT_MS) }).catch(error => { throw new WorkflowError(error instanceof Error && error.name === "AbortError" ? "DEADLINE" : "PROVIDER_UNAVAILABLE"); });
    await recordAttempt(user, job, { model: result.model, tokensUsed: result.tokensUsed, action: "CONVERSATION", stepKey: null });
    const parsed = parseModelJson(result.text) as { text?: unknown } | null;
    if (!parsed || typeof parsed.text !== "string" || !parsed.text.trim() || parsed.text.length > 1200) throw new WorkflowError("INVALID_INPUT");
    return persistPlan(user, job, [{ stepKey: "s1", capabilityKey: "assistant.conversation", input: { text: masker.unmask(parsed.text) } }]);
  };
  if (segments.length === 1 && isSocialTurn(segments[0].text)) return converse();
  const knowledgeQuery = (job.budget as { knowledgeQuery?: unknown } | null)?.knowledgeQuery;
  if (typeof knowledgeQuery === "string" && segments.length === 1) return persistPlan(user, job, [{ stepKey: "s1", capabilityKey: "assistant.app_knowledge", input: { query: knowledgeQuery } }]);

  // Explicit how-to questions are reads, not authorization for a mutation. Enforce this outside
  // the model: repeated live tests showed it sometimes planned a price update for the same question.
  if (segments.length === 1 && !hasMultipleActions(segments[0].text) && isAppGuidanceRequest(segments[0].text)) {
    return persistPlan(user, job, [{ stepKey: "s1", capabilityKey: "assistant.app_knowledge", input: { query: segments[0].text.slice(0, 1000) } }]);
  }

  const literalAnnouncement = quotedAnnouncement(segments[0]?.text ?? "");
  if (segments.length === 1) {
    const key = isCampusClassCount(segments[0].text) ? "school.inspect" : literalAnnouncement !== null ? "communications.queue_announcement" : null;
    const entry = key ? capability(key) : null;
    if (entry && (await checkCapabilityAccess(ctx, entry)).ok) {
      const input = key === "school.inspect" ? { entity: "classes" } : {
        operation: key, messages: { [language]: { body: literalAnnouncement } }, fallbackLanguage: null,
      };
      const parsed = entry.input.safeParse(input);
      return persistPlan(user, job, [{ stepKey: "s1", capabilityKey: entry.key, input,
        missingFields: parsed.success ? [] : parsed.error.issues.map(issue => `/${issue.path.join("/")}`),
      }]);
    }
  }

  const compound = segments.some(segment => hasMultipleActions(segment.text)) || isGuidanceQuestion(segments[0]?.text ?? "");
  const pricing = compound ? null : await planPricingDialogue(ctx, job, segments);
  if (pricing) return persistPlan(user, job, pricing);
  const form = compound ? null : await planFormDialogue(ctx, job, segments);
  if (form) return persistPlan(user, job, form);
  await assertCanSpend(user, job);

  const masker = new Pseudonymizer();
  masker.token(user.email, "EMAIL");
  if (user.fullName) masker.token(user.fullName, "PERSON");
  registerVocabulary(masker, await loadPeopleVocabulary(user, job.campusId), segments.map(segment => segment.text));
  const [previousSteps, questions] = await Promise.all([
    prisma.aiWorkflowStep.findMany({ where: { schoolId: job.schoolId, jobId: job.id, planVersion: job.planVersion }, orderBy: { createdAt: "asc" } }),
    prisma.aiWorkflowQuestion.findMany({ where: { schoolId: job.schoolId, jobId: job.id }, orderBy: { createdAt: "asc" }, select: { stepId: true, pointer: true, answer: true, promptParams: true } }),
  ]);
  const userText = segments.map(segment => ({ kind: segment.kind, text: masker.mask(segment.text),
    answering: questions.filter(question => (question.answer as { segment?: number } | null)?.segment === segment.ordinal).map(question => ({
      capability: previousSteps.find(step => step.id === question.stepId)?.capabilityKey ?? (question.promptParams as { capability?: string } | null)?.capability ?? null, pointer: question.pointer,
    })),
  }));

  const retrieval = await retrieve(ctx, userText.map(item => item.text).join("\n"), previousSteps.map(step => step.capabilityKey));
  // Clarifications for an explicitly quoted announcement cannot turn its body into new actions.
  if (literalAnnouncement !== null) retrieval.cards = retrieval.cards.filter(entry => entry.key === "communications.queue_announcement");
  const planner = await buildPlannerContext(ctx);
  const payload = {
    rolePlan: await buildRolePlan(ctx),
    conversationContext: dataChannel(conversationHistory),
    language, today: ctx.now.toISOString().slice(0, 10), userText,
    context: dataChannel(planner.visible),
    previousPlan: dataChannel(previousSteps.map(step => ({ key: step.stepKey, capability: step.capabilityKey,
      status: step.status, dependsOn: step.dependsOn, input: plannerInput(step.modelInput, planner.ids), missingFields: step.missingFields,
    }))),
    capabilities: retrieval.cards.map(entry => cardFor(entry, language)),
    unavailable: retrieval.unavailable.map(({ entry, reason }) => ({ capability: entry.key, whoCan: reason.whoCan ?? [] })),
  };
  let prompt = masker.mask(JSON.stringify(payload));
  for (const hit of scanForPII(prompt)) masker.token(hit, "ID");
  prompt = masker.mask(prompt);

  const call = async (system: string, body: string) => {
    if (user.role === "APP_OWNER") await assertCanSpend(user, job);
    await acquireProviderSlot();
    await appendEventTx(job, "MODEL_ATTEMPT_STARTED");
    const result = await generate({ system, prompt: body, temperature: 0, maxTokens: 4000, json: true, openaiModel: PLANNER_MODEL, signal: AbortSignal.timeout(PLAN_TIMEOUT_MS) }).catch(error => {
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
    await recordAttempt(user, job, { model: repair.model, tokensUsed: repair.tokensUsed, action: "PLAN_REPAIR", stepKey: null });
    proposal = parse(repair.text);
  }
  if (!proposal) throw new WorkflowError("INVALID_INPUT");
  if (proposal.kind === "unsupported" && retrieval.cards.length) {
    // One second look before telling the user "not yet": logged, but it does not take a second credit.
    const recheck = await call(PLANNER_SYSTEM, `${prompt}\n${SECOND_LOOK}`);
    await recordAttempt(user, job, { model: recheck.model, tokensUsed: recheck.tokensUsed, action: "PLAN_RECHECK", stepKey: null });
    proposal = parse(recheck.text) ?? proposal;
  }
  proposal = masker.unmaskObject(proposal);
  if (literalAnnouncement !== null) {
    for (const step of proposal.steps) if (step.capability === "communications.queue_announcement") {
      const messages = step.input.messages && typeof step.input.messages === "object" ? step.input.messages as Record<string, unknown> : {};
      const variant = messages[language] && typeof messages[language] === "object" ? messages[language] as Record<string, unknown> : {};
      step.input.messages = { ...messages, [language]: { ...variant, body: literalAnnouncement } };
    }
  }

  const allowed = new Map(retrieval.cards.map(entry => [entry.key, entry]));
  // Model-authored prose is not evidence of a database read or a completed action.
  if (proposal.kind === "chat" && !proposal.steps.length) return converse();
  if (proposal.kind === "answer") return notSupported(user, job, null, "");
  if (proposal.kind === "ask" && proposal.question) return askQuestion(job, proposal.question);
  if (proposal.kind === "unsupported" || !proposal.steps.length) return notSupported(user, job, proposal.unsupportedNearest, userText.map(item => item.text).join(" "));

  const history = job.planVersion > 0 ? await prisma.aiWorkflowStep.findMany({
    where: { schoolId: job.schoolId, jobId: job.id, planVersion: { lte: job.planVersion } },
    orderBy: [{ planVersion: "desc" }, { createdAt: "desc" }],
    select: { stepKey: true, capabilityKey: true, capabilityVersion: true, planVersion: true, modelInput: true, missingFields: true },
  }) : [];
  const steps: PlannedStep[] = [];
  const seen = new Set<string>();
  for (const step of proposal.steps) {
    const entry = allowed.get(step.capability);
    // A capability that was not retrieved for this actor, or a dependency on a later step, is never accepted.
    if (!entry || ["assistant.answer", "assistant.conversation"].includes(entry.key) || seen.has(step.key) || step.dependsOn.some(key => !seen.has(key))) return notSupported(user, job, step.capability, userText.map(item => item.text).join(" "));
    seen.add(step.key);
    // Fields only a person may set (e.g. "mark the rest present") are never taken from the model.
    const modelInput = entry.humanFields?.length ? Object.fromEntries(Object.entries(step.input).filter(([key]) => !entry.humanFields!.includes(key))) : step.input;
    const sameAction = history.filter(row => row.stepKey === step.key && row.capabilityKey === entry.key && row.capabilityVersion === entry.version);
    const retained = retainLiteralFields(modelInput, sameAction, entry.class === "C" ? entry.literalEvidence ?? [] : []);
    const bound = bindHandles(fillNullables(aiOutputSchema(entry.input) as JsonSchema, retained.value), planner.ids);
    const evidence = checkEvidence(bound.value, entry.evidence, step.evidence, segments, entry.literalEvidence);
    const parsed = entry.input.safeParse(bound.value);
    const schemaMissing = parsed.success ? [] : parsed.error.issues.map(issue => `/${issue.path.join("/")}`);
    steps.push({ stepKey: step.key, capabilityKey: entry.key, dependsOn: step.dependsOn, input: bound.value, missingFields: [...new Set([...bound.missing, ...evidence.missing.filter(pointer => !retained.validated.has(pointer)), ...schemaMissing])] });
  }
  return persistPlan(user, job, steps);
}

type JsonSchema = { type?: string | string[]; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; enum?: unknown[]; anyOf?: JsonSchema[] };
const allowsNull = (schema: JsonSchema | undefined) => Boolean(schema && (schema.type === "null" || (Array.isArray(schema.type) && schema.type.includes("null")) || schema.anyOf?.some(option => option.type === "null")));
const objectBranch = (schema: JsonSchema | undefined) => schema?.properties ? schema : schema?.anyOf?.find(option => option.properties);
const arrayBranch = (schema: JsonSchema | undefined) => schema?.items ? schema : schema?.anyOf?.find(option => option.items);

/**
 * A field that is required but may be null means "not given" when null. The model often leaves such
 * fields out, which made them questions ("What should the start date be?") although none is needed.
 * Fill each absent required-nullable field with null; nothing else is added, and no fact is invented.
 */
export function fillNullables(schema: JsonSchema, value: unknown): unknown {
  const asObject = objectBranch(schema);
  if (asObject && value && typeof value === "object" && !Array.isArray(value)) {
    const next: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, child] of Object.entries(asObject.properties ?? {})) {
      if (next[key] === undefined) { if (asObject.required?.includes(key) && allowsNull(child)) next[key] = null; }
      else next[key] = fillNullables(child, next[key]);
    }
    return next;
  }
  const asArray = arrayBranch(schema);
  if (asArray?.items && Array.isArray(value)) return value.map(item => fillNullables(asArray.items!, item));
  return value;
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
  const missing = steps.flatMap(step => (capability(step.capabilityKey)?.dialogueFields ? (step.missingFields ?? []).slice(0, 1) : step.missingFields ?? []).map(pointer => ({ step, pointer })));
  if (missing.length) await prisma.$transaction(async tx => {
    const rows = await tx.aiWorkflowStep.findMany({ where: { jobId: job.id, schoolId: job.schoolId, stepKey: { in: missing.map(item => item.step.stepKey) } }, orderBy: { planVersion: "desc" } });
    for (const { step, pointer } of missing.slice(0, 8)) {
      const row = rows.find(item => item.stepKey === step.stepKey);
      const entry = capability(step.capabilityKey);
      const schema = entry ? aiOutputSchema(entry.input) as JsonSchema : undefined;
      const fieldSchema = pointer.split("/").filter(Boolean).reduce<JsonSchema | undefined>((node, key) => objectBranch(node)?.properties?.[key], schema);
      const choices = fieldSchema?.enum?.filter((value): value is string => typeof value === "string") ?? [];
      const options = choices.map(value => ({ value: step.capabilityKey === "platform.set_default_plan_pricing" && pointer === "/selectedPlan" ? PLANS[value as keyof typeof PLANS]?.name ?? value : value, label: step.capabilityKey === "platform.set_default_plan_pricing" && pointer === "/selectedPlan" ? PLANS[value as keyof typeof PLANS]?.name ?? value : value === "STANDALONE" ? "Single school (STANDALONE)" : value === "GROUP" ? "School group (GROUP)" : value }));
      await tx.aiWorkflowQuestion.create({ data: { schoolId: job.schoolId, jobId: job.id, stepId: row?.id ?? null, pointer, kind: "TEXT", options, promptKey: step.invalidFields?.includes(pointer) ? pointer.endsWith("Email") ? "FORM_EMAIL_INVALID" : "FIELD_INVALID" : step.capabilityKey === "platform.set_default_plan_pricing" ? pointer === "/selectedPlan" ? "platform.pricing_plan" : "platform.pricing_amount" : "FIELD", promptParams: { capability: step.capabilityKey, pointer } } });
    }
    await tx.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "NEEDS_INPUT", version: { increment: 1 } } });
    await appendEvent(tx, job, "QUESTION_ASKED", null, { count: Math.min(missing.length, 8) });
  });
}

async function askQuestion(job: AiWorkflowJob, proposed: string) {
  // A model must never ask a person to disclose a password or other secret.
  const question = proposed.trim() && !sensitiveKnowledgeRequest(proposed) && !/\b(?:otp|verification code|one.time code|recovery code|execute sql|run this command)\b/i.test(proposed) ? proposed.trim().slice(0, 600) : ({ en: "Which action would you like to perform in your workspace? Include the relevant record and the change you want. Do not include passwords or access tokens.", ur: "آپ اپنے ورک اسپیس میں کون سا کام کرنا چاہتے ہیں؟ متعلقہ ریکارڈ اور مطلوبہ تبدیلی بتائیں۔ پاس ورڈ یا رسائی ٹوکن شامل نہ کریں۔", ar: "ما الإجراء الذي تريد تنفيذه في مساحة عملك؟ اذكر السجل والتغيير المطلوب. لا ترسل كلمات المرور أو رموز الوصول." } as const)[job.language as Locale];
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
      // Families and students leave no words behind, even masked: only the count of unmet requests.
      create: { schoolId: job.schoolId, actorRole: user.role, language: job.language, reason, nearestKey, maskedSummary: user.role === "PARENT" || user.role === "STUDENT" || scanForPII(summary).length ? "" : summary },
      update: { count: { increment: 1 }, lastSeenAt: new Date() },
    });
    await tx.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "COMPLETED", outcome: "NOT_SUPPORTED", completedAt: new Date(), errorParams: nearestKey ? { nearest: nearestKey } : undefined, version: { increment: 1 } } });
    await appendEvent(tx, job, "JOB_COMPLETED", null, { outcome: "NOT_SUPPORTED" });
  });
}

