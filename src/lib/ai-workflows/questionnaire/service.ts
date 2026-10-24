import { Prisma } from "@prisma/client";
import type { AiSetupResponse } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveWorkspaceCampus } from "@/lib/school-ai/access";
import { WorkflowError } from "../errors";
import { sha256 } from "../executor/canonical";
import { normalizeText } from "../planner/normalize";
import { capability } from "../registry";
import type { CapabilityContext, Locale } from "../registry/types";
import { aiWorkflowsV2Enabled } from "../flag";
import { authorizeActor, capabilityContext, inTenant } from "../jobs/actor";
import { appendEvent } from "../jobs/events";
import { DEFAULT_BUDGET, advanceJob, getJob, savePlan } from "../jobs/job-service";
import { toRunView, type RunView } from "../view";
import { TEACHER_QUESTIONNAIRE } from "./roles/teacher";
import { ADMIN_QUESTIONNAIRE, CAMPUS_ADMIN_QUESTIONNAIRE } from "./roles/operator";
import type { CompiledStep, QuestionnaireDefinition, QuestionView, RemainingTask } from "./types";

/**
 * Per-user role questionnaires (ai_setup_responses). The definition always comes from the signed-in
 * user's live role; a URL key that does not match it is NOT_FOUND (red team RT14), so a teacher can
 * never open, answer or build another role's sheet.
 */
const DEFINITIONS: readonly QuestionnaireDefinition<any>[] = [TEACHER_QUESTIONNAIRE, ADMIN_QUESTIONNAIRE, CAMPUS_ADMIN_QUESTIONNAIRE];

export function definitionForRole(role: string): QuestionnaireDefinition<any> | null {
  return DEFINITIONS.find(definition => definition.roles.includes(role as never)) ?? null;
}

function definitionFor(user: AuthUser, key: string) {
  const definition = definitionForRole(user.role);
  if (!definition || definition.key !== key) throw new WorkflowError("NOT_FOUND");
  return definition;
}

async function setupContext(user: AuthUser, locale: Locale) {
  const campusId = await resolveWorkspaceCampus(user, user.campusId);
  return capabilityContext(user, campusId, locale);
}

export interface SheetView {
  key: string; definitionVersion: number; version: number; status: string; title: string;
  sheets: string[];
  known: Array<{ label: string; value: string; editLink?: string }>;
  questions: Array<{ key: string; sheet: number; prompt: string; hint: string | null; required: boolean; cls: "A" | "B" | "C"; drives: string[]; connected: boolean; view: QuestionView; value: unknown; confirmed: boolean }>;
  /** What Build will do with the confirmed answers, before anything runs. */
  willCreate: Array<{ capabilityKey: string; title: string; cls: "A" | "B" | "C"; count: number }>;
  notConnected: Array<{ capabilityKey: string; count: number }>;
  remains: Array<{ title: string; who: string; link?: string }>;
  run: RunView | null;
}

/** Only answered, confirmed questions that still apply; everything else is ignored by Build. */
function confirmedAnswers(definition: QuestionnaireDefinition<any>, prefill: unknown, response: Pick<AiSetupResponse, "answers" | "confirmedKeys">) {
  const answers = (response.answers ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const question of definition.questions) {
    if (!response.confirmedKeys.includes(question.key) || answers[question.key] === undefined) continue;
    if (question.appliesWhen && !question.appliesWhen(prefill, result)) continue;
    const parsed = question.answer(prefill).safeParse(answers[question.key]);
    if (parsed.success) result[question.key] = parsed.data;
  }
  return result;
}

/** Compiled steps split into what the registry can run now and what is not connected yet. */
function plan(definition: QuestionnaireDefinition<any>, answers: Record<string, unknown>, prefill: unknown, ctx: CapabilityContext) {
  const compiled = definition.compile(answers, prefill, ctx);
  const ready: CompiledStep[] = [], missing: CompiledStep[] = [];
  for (const step of compiled) {
    const entry = capability(step.capabilityKey);
    (entry && entry.roles.includes(ctx.user.role) && entry.input.safeParse(step.input).success ? ready : missing).push(step);
  }
  // Renumber what can run; a step whose dependency is not connected cannot run either.
  const renamed = new Map<string, string>();
  const runnable = ready.filter(step => (step.dependsOn ?? []).every(key => ready.some(other => other.stepKey === key)));
  runnable.forEach((step, index) => renamed.set(step.stepKey, `s${index + 1}`));
  return { ready: runnable.map(step => ({ ...step, stepKey: renamed.get(step.stepKey)!, dependsOn: (step.dependsOn ?? []).map(key => renamed.get(key)!) })), missing: [...missing, ...ready.filter(step => !runnable.includes(step))] };
}

function countBy(steps: CompiledStep[]) {
  const counts = new Map<string, number>();
  for (const step of steps) counts.set(step.capabilityKey, (counts.get(step.capabilityKey) ?? 0) + 1);
  return [...counts];
}

async function loadResponse(user: AuthUser, definition: QuestionnaireDefinition<any>, campusId: string | null) {
  return prisma.aiSetupResponse.upsert({
    where: { schoolId_userId_questionnaireKey: { schoolId: user.schoolId, userId: user.userId, questionnaireKey: definition.key } },
    create: { schoolId: user.schoolId, campusId, userId: user.userId, role: user.role, questionnaireKey: definition.key, definitionVersion: definition.version },
    update: {},
  });
}

export function getSheet(user: AuthUser, key: string, locale: Locale): Promise<SheetView> {
  return inTenant(user, async () => {
    await authorizeActor(user);
    const definition = definitionFor(user, key);
    const ctx = await setupContext(user, locale);
    const [prefill, response] = await Promise.all([definition.prefill(ctx), loadResponse(user, definition, ctx.campusId)]);
    const stored = (response.answers ?? {}) as Record<string, unknown>;
    const answers = confirmedAnswers(definition, prefill, response);
    const { ready, missing } = plan(definition, answers, prefill, ctx);
    const running = response.jobId ? await getJob(user, response.jobId).catch(() => null) : null;
    const applicable: Record<string, unknown> = {};
    const questions: SheetView["questions"] = [];
    for (const question of definition.questions) {
      if (question.appliesWhen && !question.appliesWhen(prefill, { ...stored, ...applicable })) continue;
      const value = stored[question.key] ?? question.initial?.(prefill);
      applicable[question.key] = value;
      questions.push({
        key: question.key, sheet: question.sheet, prompt: question.prompt[locale], hint: question.hint?.[locale] ?? null, required: question.required, cls: question.cls,
        drives: [...question.drives], connected: question.drives.every(drive => Boolean(capability(drive))), view: question.view(prefill, locale), value: value ?? null,
        confirmed: response.confirmedKeys.includes(question.key),
      });
    }
    const remains: RemainingTask[] = definition.remains(answers, prefill);
    return {
      key: definition.key, definitionVersion: definition.version, version: response.version, status: response.status, title: definition.title[locale],
      sheets: definition.sheets.map(sheet => sheet[locale]),
      known: definition.known(prefill, locale).map(fact => ({ label: fact.label[locale], value: fact.value, ...(fact.editLink ? { editLink: fact.editLink } : {}) })),
      questions,
      willCreate: countBy(ready).map(([capabilityKey, count]) => { const entry = capability(capabilityKey)!; return { capabilityKey, title: entry.copy.title[locale], cls: entry.class, count }; }),
      notConnected: countBy(missing).map(([capabilityKey, count]) => ({ capabilityKey, count })),
      remains: remains.map(task => ({ title: task.title[locale], who: task.who[locale], ...(task.link ? { link: task.link } : {}) })),
      run: running ? toRunView(running) : null,
    };
  });
}

export const saveAnswersSchema = z.strictObject({
  version: z.number().int().positive(),
  /** Answers by question key; null clears one. Unknown keys are refused. */
  answers: z.record(z.string().max(64), z.unknown()),
  confirmedKeys: z.array(z.string().max(64)).max(40),
});

/** Saves answers with optimistic concurrency: a second tab with an older version gets STALE_VERSION. */
export function saveAnswers(user: AuthUser, key: string, raw: unknown) {
  return inTenant(user, async () => {
    await authorizeActor(user);
    const definition = definitionFor(user, key);
    const input = saveAnswersSchema.parse(raw);
    const ctx = await setupContext(user, "en");
    const prefill = await definition.prefill(ctx);
    const response = await loadResponse(user, definition, ctx.campusId);
    if (response.version !== input.version) throw new WorkflowError("STALE_VERSION");
    const known = new Map(definition.questions.map(question => [question.key, question]));
    const answers = { ...((response.answers ?? {}) as Record<string, unknown>) };
    for (const [questionKey, value] of Object.entries(input.answers)) {
      const question = known.get(questionKey);
      if (!question) throw new WorkflowError("INVALID_INPUT", { field: questionKey });
      if (value === null) { delete answers[questionKey]; continue; }
      if (!question.answer(prefill).safeParse(value).success) throw new WorkflowError("INVALID_INPUT", { field: questionKey });
      answers[questionKey] = value;
    }
    const confirmedKeys = [...new Set(input.confirmedKeys)].filter(questionKey => known.has(questionKey) && answers[questionKey] !== undefined);
    await prisma.$transaction(async tx => {
      const updated = await tx.aiSetupResponse.updateMany({
        where: { id: response.id, schoolId: user.schoolId, version: input.version },
        data: { answers: answers as Prisma.InputJsonValue, confirmedKeys, definitionVersion: definition.version, status: "DRAFT", version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new WorkflowError("STALE_VERSION");
      // Changed answers supersede an unfinished build: what already saved stays, what waits is cancelled,
      // and the next Build compiles the new version (its diff shows only what is new).
      if (response.jobId && response.status === "APPLYING") {
        const job = await tx.aiWorkflowJob.findFirst({ where: { id: response.jobId, schoolId: user.schoolId, status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED", "FAILED"] } } });
        if (job) {
          await tx.aiWorkflowStep.updateMany({ where: { jobId: job.id, schoolId: user.schoolId, status: { in: ["PENDING", "NEEDS_INPUT", "READY", "WAITING_CONFIRM"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
          await tx.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "CANCELLED", version: { increment: 1 } } });
          await appendEvent(tx, job, "JOB_CANCELLED");
        }
      }
    });
    return { version: input.version + 1 };
  });
}

/** "Not now": the sheet stays resumable and the first-login prompt backs off. */
export function deferSheet(user: AuthUser, key: string) {
  return inTenant(user, async () => {
    const definition = definitionFor(user, key);
    const response = await loadResponse(user, definition, user.campusId);
    if (response.status === "APPLYING" || response.status === "READY") return response;
    return prisma.aiSetupResponse.update({ where: { id: response.id }, data: { status: "DEFERRED", deferrals: { increment: 1 } } });
  });
}

export const buildSchema = z.strictObject({ version: z.number().int().positive(), language: z.enum(["en", "ar", "ur"]) });

/**
 * Build: one job for this response version. Compiled steps are saved as the plan without a model call;
 * class A runs now, each class-B step waits for its own preview and save, class C goes to its owner.
 * A second tab, device or retry reopens the same job (partial unique index on the response version).
 */
export function buildSetup(user: AuthUser, key: string, raw: unknown) {
  return inTenant(user, async () => {
    await authorizeActor(user);
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { slug: true } });
    if (!aiWorkflowsV2Enabled(school?.slug)) throw new WorkflowError("NOT_CONNECTED");
    const definition = definitionFor(user, key);
    const input = buildSchema.parse(raw);
    const ctx = await setupContext(user, input.language);
    const prefill = await definition.prefill(ctx);
    const response = await loadResponse(user, definition, ctx.campusId);
    if (response.version !== input.version || response.definitionVersion !== definition.version) throw new WorkflowError("STALE_VERSION");
    const existing = await prisma.aiWorkflowJob.findFirst({ where: { schoolId: user.schoolId, setupResponseId: response.id, setupResponseVersion: response.version } });
    if (existing) return toRunView(await getJob(user, (await advanceJob(user, existing.id)).id));
    const answers = confirmedAnswers(definition, prefill, response);
    const { ready } = plan(definition, answers, prefill, ctx);
    if (!ready.length) throw new WorkflowError("INVALID_INPUT");
    let jobId: string;
    try {
      jobId = await prisma.$transaction(async tx => {
        const job = await tx.aiWorkflowJob.create({ data: {
          schoolId: user.schoolId, campusId: ctx.campusId, actorId: user.userId, actorRole: user.role, accessVersion: user.accessVersion ?? 0, origin: "QUESTIONNAIRE", planMode: "PLAN_REVIEW",
          setupResponseId: response.id, setupResponseVersion: response.version, language: input.language, idempotencyKey: `setup-${response.id}-${response.version}`,
          requestHash: sha256({ questionnaire: definition.key, definitionVersion: definition.version, version: response.version, answers }), budget: { ...DEFAULT_BUDGET, maxModelCalls: 0 }, expiresAt: new Date(Date.now() + 14 * 86_400_000),
        } });
        await tx.aiWorkflowSegment.create({ data: { schoolId: user.schoolId, jobId: job.id, ordinal: 0, kind: "REQUEST", text: `Set me up from my ${definition.key} questionnaire answers.`, normalized: normalizeText(`Set me up from my ${definition.key} questionnaire answers.`) } });
        for (const [index, [fieldKey, value]] of Object.entries(answers).entries()) {
          const text = JSON.stringify(value);
          await tx.aiWorkflowSegment.create({ data: { schoolId: user.schoolId, jobId: job.id, ordinal: index + 1, kind: "QUESTIONNAIRE_ANSWER", fieldKey, text, normalized: normalizeText(text) } });
        }
        await tx.aiSetupResponse.update({ where: { id: response.id }, data: { status: "APPLYING", jobId: job.id, submittedAt: new Date() } });
        await appendEvent(tx, job, "JOB_STARTED");
        return job.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const live = await prisma.aiWorkflowJob.findFirst({ where: { schoolId: user.schoolId, setupResponseId: response.id, setupResponseVersion: response.version } });
        if (live) return toRunView(await getJob(user, live.id));
      }
      throw error;
    }
    await savePlan(user, jobId, ready.map(step => ({ stepKey: step.stepKey, capabilityKey: step.capabilityKey, input: step.input, dependsOn: step.dependsOn })));
    await advanceJob(user, jobId);
    return toRunView(await getJob(user, jobId));
  });
}

/**
 * The first-login trigger (Appendix D defect 1): invited teachers arrive with onboardingComplete set,
 * so the prompt reads the per-user response instead. It backs off after three "Not now"s.
 */
export function setupStatus(user: AuthUser) {
  return inTenant(user, async () => {
    const definition = definitionForRole(user.role);
    if (!definition) return null;
    const response = await prisma.aiSetupResponse.findUnique({ where: { schoolId_userId_questionnaireKey: { schoolId: user.schoolId, userId: user.userId, questionnaireKey: definition.key } }, select: { status: true, deferrals: true, definitionVersion: true } });
    const status = response?.status ?? "NEW";
    const show = status === "NEW" || status === "DRAFT" || status === "PARTIAL" || status === "APPLYING" || (status === "DEFERRED" && (response?.deferrals ?? 0) < 3) || (status === "READY" && response!.definitionVersion < definition.version);
    return { key: definition.key, status, show };
  });
}
