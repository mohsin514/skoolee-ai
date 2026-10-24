import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { OFFICES, answerIsStale, answerQuestion, type PolicyAnswer, type PolicyDoc } from "./answer";

/**
 * SKO-429 school policy assistant. Policy versions are written and approved by school leaders;
 * families and staff ask questions and get quoted, cited answers from versions that are approved,
 * in effect on the question date, meant for their audience and their campus. Restricted staff
 * policies never reach a family answer, citation or snippet. An uncertain answer offers an
 * escalation the asker reviews (recipient and included context) before anything is sent.
 */

// §7.6: school policies are written by campus operations; the principal reads them like other staff.
const MANAGERS = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"];
const FAMILY = ["PARENT", "STUDENT"];
const day = z.iso.date();
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const SectionInput = z.object({ id: z.string().trim().regex(/^[A-Za-z0-9._-]{1,20}$/u, "A section number looks like 2.1"), heading: text(2, 200), text: text(10, 8000) }).strict();
const PolicyInput = z.object({
  topic: z.string().trim().regex(/^[a-z0-9-]{2,60}$/u, "A topic key looks like attendance or fee-refunds."),
  title: text(3, 200), office: z.enum(OFFICES), audience: z.enum(["FAMILY", "STAFF", "ALL"]), language: z.enum(["en", "ar", "ur"]).default("en"),
  campusId: z.string().min(1).max(120).nullable().optional(), effectiveFrom: day, effectiveUntil: day.nullable().optional(),
  sections: z.array(SectionInput).min(1).max(60),
}).strict().refine((v) => !v.effectiveUntil || v.effectiveUntil > v.effectiveFrom, { message: "The end date must follow the start date." })
  .refine((v) => new Set(v.sections.map((s) => s.id)).size === v.sections.length, { message: "Section numbers must be unique." });
const AskInput = z.object({ question: text(3, 500), on: day.optional() }).strict();
const FeedbackInput = z.object({ helpful: z.boolean(), note: text(3, 500).optional() }).strict();
const EscalateInput = z.object({ office: z.enum(OFFICES), confirmedOffice: z.enum(OFFICES), includeQuestion: z.boolean(), message: text(10, 2000) }).strict();
const EvalInput = z.object({ question: text(3, 500), audience: z.enum(["FAMILY", "STAFF"]), expectedTopic: z.string().trim().min(2).max(60).optional(), expectedSection: z.string().trim().max(20).optional(), expectNoAnswer: z.boolean().default(false) }).strict();

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (v: string) => new Date(`${v}T00:00:00Z`);
function assertManager(user: AuthUser) { if (!MANAGERS.includes(user.role)) throw new ApiError("Only school leaders manage policies.", 403); }
const audienceOf = (user: AuthUser) => (FAMILY.includes(user.role) ? "FAMILY" : "STAFF");

type PolicyRow = Awaited<ReturnType<typeof prisma.schoolPolicy.findMany>>[number];
const toDoc = (p: PolicyRow): PolicyDoc => ({ id: p.id, topic: p.topic, title: p.title, version: p.version, office: p.office, effectiveFrom: ymd(p.effectiveFrom)!, effectiveUntil: ymd(p.effectiveUntil), sections: p.sections as PolicyDoc["sections"] });
const effectiveOn = (p: PolicyRow, on: Date) => p.effectiveFrom <= on && (!p.effectiveUntil || p.effectiveUntil > on);

/** Approved versions this audience may see on this campus, split into in-effect and not-in-effect. */
async function eligible(schoolId: string, campusId: string | null, audience: string, on: Date) {
  const rows = await prisma.schoolPolicy.findMany({ where: { schoolId, status: "APPROVED", audience: audience === "FAMILY" ? { in: ["FAMILY", "ALL"] } : undefined, OR: [{ campusId: null }, ...(campusId ? [{ campusId }] : [])] }, take: 500 });
  return { current: rows.filter((p) => effectiveOn(p, on)), notCurrent: rows.filter((p) => !effectiveOn(p, on)) };
}

// ── leaders: policies ──────────────────────────────────────────────────────────────────────────

export async function listPolicies(user: AuthUser) {
  assertManager(user);
  return prisma.schoolPolicy.findMany({ where: { schoolId: user.schoolId }, orderBy: [{ topic: "asc" }, { version: "desc" }], take: 500 });
}

export async function savePolicyDraft(user: AuthUser, raw: unknown, id?: string) {
  assertManager(user);
  const input = parse(PolicyInput, raw);
  if (id) {
    const draft = await prisma.schoolPolicy.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!draft) throw new ApiError("Policy not found", 404);
    if (draft.status !== "DRAFT") throw new ApiError("Approved versions cannot be edited. Start a new version instead.", 409);
    return prisma.schoolPolicy.update({ where: { id }, data: { ...input, campusId: input.campusId ?? null, effectiveFrom: asDate(input.effectiveFrom), effectiveUntil: input.effectiveUntil ? asDate(input.effectiveUntil) : null } });
  }
  return prisma.schoolPolicy.create({ data: { ...input, schoolId: user.schoolId, campusId: input.campusId ?? null, effectiveFrom: asDate(input.effectiveFrom), effectiveUntil: input.effectiveUntil ? asDate(input.effectiveUntil) : null, createdById: user.userId } });
}

/** A new draft version of an approved policy; approving it ends the previous version's interval. */
export async function newPolicyVersion(user: AuthUser, id: string) {
  assertManager(user);
  const base = await prisma.schoolPolicy.findFirst({ where: { id, schoolId: user.schoolId, status: "APPROVED" } });
  if (!base) throw new ApiError("Choose an approved policy to revise.", 404);
  if (await prisma.schoolPolicy.findFirst({ where: { schoolId: user.schoolId, supersedesId: id, status: "DRAFT" }, select: { id: true } })) throw new ApiError("A draft revision of this policy already exists.", 409);
  return prisma.schoolPolicy.create({ data: { schoolId: user.schoolId, campusId: base.campusId, topic: base.topic, title: base.title, office: base.office, audience: base.audience, language: base.language, version: base.version + 1,
    effectiveFrom: new Date(), effectiveUntil: null, supersedesId: base.id, sections: base.sections as Prisma.InputJsonValue, createdById: user.userId } });
}

export async function approvePolicy(user: AuthUser, id: string) {
  assertManager(user);
  return prisma.$transaction(async (tx) => {
    const draft = await tx.schoolPolicy.findFirst({ where: { id, schoolId: user.schoolId, status: "DRAFT" } });
    if (!draft) throw new ApiError("Only a draft can be approved.", 409);
    if (draft.supersedesId) {
      const old = await tx.schoolPolicy.findFirst({ where: { id: draft.supersedesId, schoolId: user.schoolId } });
      if (old && (!old.effectiveUntil || old.effectiveUntil > draft.effectiveFrom)) await tx.schoolPolicy.update({ where: { id: old.id }, data: { effectiveUntil: draft.effectiveFrom } });
      if (old) await tx.schoolPolicy.update({ where: { id: old.id }, data: { status: old.effectiveUntil && old.effectiveUntil <= new Date() ? "SUPERSEDED" : old.status } });
    }
    const done = await tx.schoolPolicy.updateMany({ where: { id, status: "DRAFT" }, data: { status: "APPROVED", approvedById: user.userId, approvedAt: new Date() } });
    if (!done.count) throw new ApiError("Another change was saved first.", 409);
    return tx.schoolPolicy.findUnique({ where: { id } });
  });
}

export async function archivePolicy(user: AuthUser, id: string) {
  assertManager(user);
  const done = await prisma.schoolPolicy.updateMany({ where: { id, schoolId: user.schoolId, status: { in: ["APPROVED", "DRAFT"] } }, data: { status: "ARCHIVED" } });
  if (!done.count) throw new ApiError("Policy not found", 404);
  return { archived: id };
}

// ── everyone: asking ───────────────────────────────────────────────────────────────────────────

export async function askPolicy(user: AuthUser, raw: unknown) {
  const input = parse(AskInput, raw);
  const audience = audienceOf(user), on = input.on ? asDate(input.on) : new Date();
  const { current, notCurrent } = await eligible(user.schoolId, user.campusId ?? null, audience, on);
  const answer = answerQuestion(input.question, current.map(toDoc), notCurrent.map(toDoc));
  const saved = await prisma.policyQuestion.create({ data: { schoolId: user.schoolId, campusId: user.campusId ?? null, askedById: user.userId, audience, question: input.question, answer: answer as unknown as Prisma.InputJsonValue, status: answer.status } });
  return { id: saved.id, question: input.question, on: ymd(on), ...answer, stale: false };
}

/** The asker's history; an answer whose cited version is no longer current is marked stale. */
export async function myPolicyQuestions(user: AuthUser) {
  const rows = await prisma.policyQuestion.findMany({ where: { schoolId: user.schoolId, askedById: user.userId }, orderBy: { createdAt: "desc" }, take: 20 });
  const { current } = await eligible(user.schoolId, user.campusId ?? null, audienceOf(user), new Date());
  const ids = new Set(current.map((p) => p.id));
  return rows.map((r) => ({ id: r.id, question: r.question, ...(r.answer as unknown as PolicyAnswer), stale: answerIsStale(r.answer as unknown as PolicyAnswer, ids), feedback: r.feedback, escalatedAt: r.escalatedAt, resolution: r.resolution, resolvedAt: r.resolvedAt, createdAt: r.createdAt }));
}

export async function policyFeedback(user: AuthUser, questionId: string, raw: unknown) {
  const input = parse(FeedbackInput, raw);
  const done = await prisma.policyQuestion.updateMany({ where: { id: questionId, schoolId: user.schoolId, askedById: user.userId }, data: { feedback: input.helpful ? "HELPFUL" : "NOT_HELPFUL", feedbackNote: input.note ?? null } });
  if (!done.count) throw new ApiError("Question not found", 404);
  return { id: questionId };
}

/**
 * Send a question to a school office. The asker must confirm the recipient they reviewed; only the
 * question (if chosen) and their own message are included — never a learner record.
 */
export async function escalatePolicyQuestion(user: AuthUser, questionId: string, raw: unknown) {
  const input = parse(EscalateInput, raw);
  if (input.confirmedOffice !== input.office) throw new ApiError("Review the office this will be sent to before sending.", 400);
  const question = await prisma.policyQuestion.findFirst({ where: { id: questionId, schoolId: user.schoolId, askedById: user.userId } });
  if (!question) throw new ApiError("Question not found", 404);
  if (question.escalatedAt) return { id: question.id, escalatedAt: question.escalatedAt, office: (question.escalation as { office: string }).office };
  const escalation = { office: input.office, message: input.message, includedQuestion: input.includeQuestion ? question.question : null, answerStatus: question.status };
  const saved = await prisma.policyQuestion.update({ where: { id: question.id }, data: { escalation, escalatedAt: new Date() } });
  return { id: saved.id, escalatedAt: saved.escalatedAt, office: input.office };
}

// ── leaders: office queue and evaluation ───────────────────────────────────────────────────────

export async function officeQueue(user: AuthUser) {
  assertManager(user);
  const rows = await prisma.policyQuestion.findMany({ where: { schoolId: user.schoolId, escalatedAt: { not: null } }, orderBy: { escalatedAt: "desc" }, take: 100 });
  const askers = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.askedById))] }, schoolId: user.schoolId }, select: { id: true, fullName: true, role: true } });
  return rows.map((r) => ({ id: r.id, askedBy: askers.find((a) => a.id === r.askedById) ?? null, audience: r.audience, escalation: r.escalation, status: r.status, escalatedAt: r.escalatedAt, resolution: r.resolution, resolvedAt: r.resolvedAt }));
}

export async function resolveEscalation(user: AuthUser, questionId: string, raw: unknown) {
  assertManager(user);
  const input = parse(z.object({ resolution: text(5, 2000) }).strict(), raw);
  const done = await prisma.policyQuestion.updateMany({ where: { id: questionId, schoolId: user.schoolId, escalatedAt: { not: null }, resolvedAt: null }, data: { resolution: input.resolution, resolvedAt: new Date(), resolvedById: user.userId } });
  if (!done.count) throw new ApiError("This question is not waiting for a reply.", 409);
  return { id: questionId };
}

export async function addEvalCase(user: AuthUser, raw: unknown) {
  assertManager(user);
  const input = parse(EvalInput, raw);
  if (!input.expectNoAnswer && !input.expectedTopic) throw new ApiError("Name the policy topic that should answer this question.", 400);
  return prisma.policyEvalCase.create({ data: { schoolId: user.schoolId, question: input.question, audience: input.audience, expectedTopic: input.expectedTopic ?? "", expectedSection: input.expectedSection ?? null, expectNoAnswer: input.expectNoAnswer, createdById: user.userId } });
}

/** Re-run every case against the current policies; each run is appended, never overwritten. */
export async function runEvaluation(user: AuthUser) {
  assertManager(user);
  const cases = await prisma.policyEvalCase.findMany({ where: { schoolId: user.schoolId }, orderBy: { createdAt: "asc" }, take: 200 });
  const now = new Date();
  const results = [];
  for (const c of cases) {
    const { current, notCurrent } = await eligible(user.schoolId, user.campusId ?? null, c.audience, now);
    const answer = answerQuestion(c.question, current.map(toDoc), notCurrent.map(toDoc));
    const top = answer.citations[0];
    const passed = c.expectNoAnswer ? answer.status !== "ANSWERED" : answer.status === "ANSWERED" && top?.topic === c.expectedTopic && (!c.expectedSection || top?.sectionId === c.expectedSection);
    const run = { at: now.toISOString(), passed, status: answer.status, cited: top ? `${top.topic} v${top.version} §${top.sectionId}` : null };
    await prisma.policyEvalCase.update({ where: { id: c.id }, data: { runs: [...(Array.isArray(c.runs) ? c.runs : []), run] as Prisma.InputJsonValue } });
    results.push({ id: c.id, question: c.question, audience: c.audience, ...run });
  }
  return { passed: results.filter((r) => r.passed).length, total: results.length, results };
}
