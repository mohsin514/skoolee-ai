import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertPermission } from "@/lib/api/scope";
import { approvedQuestionForSharing } from "@/lib/school-ai/question-bank-service";

/**
 * SKO-454 question review network. Shared items live outside any one school, so every access here
 * checks the caller's school, the item's audience, network membership and embargo explicitly.
 *
 * - Only approved bank questions can be shared, never one secured for an upcoming or active exam, and
 *   never with a learner's name in it. The contributor confirms rights; the rights must permit the
 *   audience; a teacher's network or public share needs a school leader's authority.
 * - Reviews are attributable, need declared subject and language expertise, and record conflicts.
 *   Publishing needs two unconflicted approvals; any disagreement needs a recorded adjudication.
 *   No majority vote or popularity count certifies an item.
 * - A correction is a new version that is reviewed again; adopters are told and keep their version
 *   until they accept it. Withdrawal blocks future reuse. Completed assessments are never touched.
 * - Answer keys are served only to teaching staff; learners and families have no route here.
 * - Use statistics are counts and a mean only, suppressed below the privacy thresholds.
 */

const LEADERS = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"];
const TEACHING = [...LEADERS, "TEACHER"];
const AUDIENCE_RANK = { SCHOOL: 0, NETWORK: 1, PUBLIC: 2 } as const;
type Audience = keyof typeof AUDIENCE_RANK;
export const STAT_MIN_REPORT = 10, STAT_MIN_TOTAL = 30;
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const json = (value: unknown) => value as Prisma.InputJsonValue;

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
function assert(cond: boolean, message: string, status = 403): asserts cond { if (!cond) throw new ApiError(message, status); }
async function teaching(user: AuthUser) {
  assert(TEACHING.includes(user.role), "Network questions are available to teaching staff only.");
  await assertPermission(user, "exams", "view");
}
const leaderOf = (user: AuthUser, schoolId: string) => user.schoolId === schoolId && LEADERS.includes(user.role);
/** A correction proposed from another school is still the contributing school's item to publish or withdraw. */
const ownContribution = (user: AuthUser, item: { contributorSchoolId: string; contributedById: string }) => item.contributorSchoolId === user.schoolId && item.contributedById === user.userId;
const push = (history: Prisma.JsonValue, entry: Record<string, unknown>) => [...(Array.isArray(history) ? history : []), { at: new Date().toISOString(), ...entry }] as Prisma.InputJsonValue;

async function myNetworks(schoolId: string) {
  const [owned, joined] = await Promise.all([
    prisma.questionNetwork.findMany({ where: { ownerSchoolId: schoolId }, select: { id: true } }),
    prisma.questionNetworkMember.findMany({ where: { memberSchoolId: schoolId, status: "ACTIVE" }, select: { networkId: true } }),
  ]);
  return new Set([...owned.map((n) => n.id), ...joined.map((m) => m.networkId)]);
}

type Item = Awaited<ReturnType<typeof prisma.questionNetworkItem.findFirstOrThrow>>;
/** Who may see an item: its own school always; others only once it is in review or published, within
 * its audience and network, and never before its embargo ends. */
function visible(user: AuthUser, item: Item, networks: Set<string>, now = new Date()) {
  if (item.contributorSchoolId === user.schoolId) return true;
  if (!["IN_REVIEW", "PUBLISHED", "SUPERSEDED", "WITHDRAWN"].includes(item.status)) return false;
  if (item.embargoUntil && item.embargoUntil > now) return false;
  if (item.audience === "PUBLIC") return true;
  if (item.audience === "NETWORK") return !!item.networkId && networks.has(item.networkId);
  return false;
}
async function load(user: AuthUser, id: string) {
  await teaching(user);
  const item = await prisma.questionNetworkItem.findUnique({ where: { id } });
  assert(!!item && visible(user, item, await myNetworks(user.schoolId)), "Question not found", 404);
  return item;
}

// ─── Networks ───────────────────────────────────────────────────

export async function createNetwork(user: AuthUser, raw: unknown) {
  assert(LEADERS.includes(user.role), "Only school leaders create review networks.");
  const { name } = parse(z.object({ name: text(3, 120) }).strict(), raw);
  const network = await prisma.questionNetwork.create({ data: { name, ownerSchoolId: user.schoolId, createdById: user.userId } });
  await prisma.questionNetworkMember.create({ data: { networkId: network.id, memberSchoolId: user.schoolId, status: "ACTIVE", invitedById: user.userId, acceptedById: user.userId, acceptedAt: new Date() } });
  return network;
}

export async function inviteSchool(user: AuthUser, networkId: string, raw: unknown) {
  const { schoolSlug } = parse(z.object({ schoolSlug: text(2, 120) }).strict(), raw);
  const network = await prisma.questionNetwork.findUnique({ where: { id: networkId } });
  assert(!!network && leaderOf(user, network.ownerSchoolId), "Only the network's owning school invites members.");
  const school = await prisma.school.findFirst({ where: { slug: schoolSlug }, select: { id: true } });
  assert(!!school, "No school has that identifier.", 404);
  return prisma.questionNetworkMember.upsert({ where: { networkId_memberSchoolId: { networkId, memberSchoolId: school.id } }, create: { networkId, memberSchoolId: school.id, invitedById: user.userId }, update: {} });
}

export async function acceptInvite(user: AuthUser, memberId: string) {
  const member = await prisma.questionNetworkMember.findUnique({ where: { id: memberId } });
  assert(!!member && leaderOf(user, member.memberSchoolId), "Only a leader of the invited school accepts.");
  return prisma.questionNetworkMember.update({ where: { id: memberId }, data: { status: "ACTIVE", acceptedById: user.userId, acceptedAt: new Date() } });
}

// ─── Contributing ───────────────────────────────────────────────

const Rights = z.object({
  basis: z.enum(["OWN_WORK", "SCHOOL_OWNED", "LICENSED", "OPEN_LICENCE"]),
  holder: text(2, 200).optional(), licence: text(2, 300).optional(), attribution: text(2, 300).optional(),
  permits: z.enum(["SCHOOL", "NETWORK", "PUBLIC"]),
  confirmed: z.literal(true, { error: "Confirm the rights before sharing." }),
}).strict();
const SubmitInput = z.object({
  source: z.object({ paperId: text(1, 120), paperVersion: z.number().int().positive(), questionId: text(1, 120) }).strict(),
  audience: z.enum(["SCHOOL", "NETWORK", "PUBLIC"]), networkId: text(1, 120).optional(),
  rights: Rights, grade: text(1, 80).optional(), curriculum: text(1, 120).optional(), embargoUntil: z.iso.date().optional(),
}).strict();

/** Learner names never leave the school inside a shared question. */
async function assertNoLearnerNames(schoolId: string, texts: string[]) {
  const body = ` ${texts.join(" ").toLowerCase().replace(/\s+/g, " ")} `;
  const students = await prisma.student.findMany({ where: { schoolId }, select: { fullName: true } });
  for (const s of students) {
    const name = s.fullName.trim().toLowerCase().replace(/\s+/g, " ");
    if (name.length >= 3 && body.includes(` ${name}`)) throw new ApiError("This question contains a learner's name. Remove it in the school's own paper before sharing; nothing was shared.", 422);
  }
}

export async function submitQuestion(user: AuthUser, raw: unknown) {
  await teaching(user);
  const input = parse(SubmitInput, raw);
  const rights = input.rights;
  assert(rights.basis !== "LICENSED" || (!!rights.holder && !!rights.licence), "A licensed source needs its holder and licence terms.", 400);
  assert(rights.basis !== "OPEN_LICENCE" || !!rights.licence, "Name the open licence.", 400);
  assert(AUDIENCE_RANK[input.audience] <= AUDIENCE_RANK[rights.permits], `The recorded rights permit sharing with ${rights.permits.toLowerCase()} audiences only; the question stays private.`, 409);
  if (input.audience === "NETWORK") assert(!!input.networkId && (await myNetworks(user.schoolId)).has(input.networkId), "Choose a network your school belongs to.", 400);
  const entry = await approvedQuestionForSharing(user, input.source);
  const secured = entry.eligibility.reasons.filter((r) => r !== "HISTORY_LIMIT" && r !== "SOURCE_ARCHIVED");
  assert(!secured.length, "This question is secured for an upcoming or active exam and stays private. Share it after the exam window.", 409);
  const q = entry.question;
  await assertNoLearnerNames(user.schoolId, [q.prompt, q.modelAnswer, ...q.options.map((o) => o.text), ...q.rubric.map((r) => r.criterion)]);
  const [subject, cls] = await Promise.all([prisma.subject.findFirst({ where: { id: entry.subjectId }, select: { name: true } }), prisma.class.findFirst({ where: { id: entry.classId }, select: { name: true } })]);
  const status = input.audience === "SCHOOL" || LEADERS.includes(user.role) ? "IN_REVIEW" : "AWAITING_AUTHORITY";
  return prisma.questionNetworkItem.create({ data: {
    shareKey: `Q-${randomBytes(3).toString("hex").toUpperCase()}`, version: 1,
    contributorSchoolId: user.schoolId, contributorCampusId: entry.campusId, contributedById: user.userId,
    source: json({ ...entry.source, paperTitle: entry.paperTitle, approvedAt: entry.approvedAt }),
    audience: input.audience, networkId: input.audience === "NETWORK" ? input.networkId! : null,
    rights: json({ basis: rights.basis, holder: rights.holder ?? null, licence: rights.licence ?? null, attribution: rights.attribution ?? null, permits: rights.permits, confirmedById: user.userId, confirmedAt: new Date().toISOString() }),
    tags: json({ subject: subject?.name ?? "", grade: input.grade ?? cls?.name ?? "", curriculum: input.curriculum ?? "", language: entry.language }),
    content: json({ type: q.type, prompt: q.prompt, marks: q.marks, options: q.options, outcomes: entry.outcomes.map((o) => ({ title: o.title, source: o.sourceTitle, reference: o.sourceReference })) }),
    answerKey: json({ correctOptionId: q.correctOptionId, correctOptionIds: q.correctOptionIds ?? null, numericKey: q.numericKey ?? null, modelAnswer: q.modelAnswer, rubric: q.rubric }),
    status, embargoUntil: input.embargoUntil ? new Date(`${input.embargoUntil}T00:00:00Z`) : null, authorizedById: status === "IN_REVIEW" && input.audience !== "SCHOOL" ? user.userId : null,
  } });
}

/** A school leader authorizes a teacher's network or public share. */
export async function authorizeShare(user: AuthUser, id: string) {
  const item = await load(user, id);
  assert(leaderOf(user, item.contributorSchoolId), "A leader of the contributing school authorizes sharing.");
  const done = await prisma.questionNetworkItem.updateMany({ where: { id, status: "AWAITING_AUTHORITY" }, data: { status: "IN_REVIEW", authorizedById: user.userId } });
  assert(done.count === 1, "This question is not waiting for authority.", 409);
  return prisma.questionNetworkItem.findUniqueOrThrow({ where: { id } });
}

// ─── Reviewing and publishing ───────────────────────────────────

const ReviewInput = z.object({
  expertise: z.object({ subject: text(1, 80), language: text(2, 8) }).strict(),
  conflict: z.boolean(), conflictNote: text(3, 300).optional(),
  issues: z.array(z.object({ code: z.enum(["KEY_ERROR", "AMBIGUOUS", "CURRICULUM_FIT", "LANGUAGE", "BIAS", "RIGHTS", "OTHER"]), detail: text(3, 500) }).strict()).max(10).default([]),
  decision: z.enum(["APPROVE", "REQUEST_CHANGES", "REJECT"]),
}).strict();

export async function reviewQuestion(user: AuthUser, id: string, raw: unknown) {
  const item = await load(user, id);
  const input = parse(ReviewInput, raw);
  assert(item.status === "IN_REVIEW", "This version is not in review.", 409);
  assert(item.contributedById !== user.userId, "Contributors do not review their own questions.");
  const tags = item.tags as { subject: string; language: string };
  assert(input.expertise.subject.toLowerCase() === tags.subject.toLowerCase() && input.expertise.language === tags.language, "Reviews are limited to reviewers with this subject and language.");
  assert(input.decision === "APPROVE" || input.issues.length > 0, "Name the issue behind this decision.", 400);
  assert(!input.conflict || !!input.conflictNote, "Describe the conflict of interest.", 400);
  try {
    return await prisma.questionNetworkReview.create({ data: { itemId: id, version: item.version, reviewerId: user.userId, reviewerSchoolId: user.schoolId, expertise: json(input.expertise), conflict: input.conflict, conflictNote: input.conflictNote ?? null, issues: json(input.issues), decision: input.decision } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("You already reviewed this version.", 409);
    throw error;
  }
}

function reviewSummary(reviews: { decision: string; conflict: boolean }[]) {
  const counted = reviews.filter((r) => !r.conflict);
  return { approvals: counted.filter((r) => r.decision === "APPROVE").length, objections: counted.filter((r) => r.decision !== "APPROVE").length, conflicts: reviews.length - counted.length };
}

async function notifyAdopters(shareKey: string, title: string, message: string, status: "CORRECTION_AVAILABLE" | "WITHDRAWN_UPSTREAM", note: Record<string, unknown>) {
  const adoptions = await prisma.questionNetworkAdoption.findMany({ where: { shareKey } });
  for (const a of adoptions) {
    await prisma.questionNetworkAdoption.update({ where: { id: a.id }, data: { status, history: push(a.history, { event: status, ...note }) } });
    await runWithTenantContext({ schoolId: a.adopterSchoolId, userId: a.adoptedById }, () => prisma.notification.create({ data: { schoolId: a.adopterSchoolId, userId: a.adoptedById, type: "QUESTION_NETWORK", title, message, sourceType: "QUESTION_NETWORK_ADOPTION", sourceId: a.id } }));
  }
  return adoptions.length;
}

/**
 * Publish a reviewed version. Two unconflicted approvals are required; any objection needs an
 * adjudication by a leader of the contributing school who did not contribute it. A published
 * correction supersedes the previous version and tells its adopters.
 */
export async function publishQuestion(user: AuthUser, id: string, raw: unknown) {
  const item = await load(user, id);
  const { adjudication } = parse(z.object({ adjudication: text(10, 1000).optional() }).strict(), raw ?? {});
  assert(item.status === "IN_REVIEW", "Only a version in review can be published.", 409);
  assert(ownContribution(user, item) || leaderOf(user, item.contributorSchoolId), "The contributor or a leader of the contributing school publishes.");
  const summary = reviewSummary(await prisma.questionNetworkReview.findMany({ where: { itemId: id } }));
  assert(summary.approvals >= 2, `Two reviews without a conflict of interest must approve this version; it has ${summary.approvals}.`, 409);
  if (summary.objections) {
    assert(!!adjudication, "Reviewers disagree. A leader of the contributing school must record an adjudication before publishing.", 409);
    assert(leaderOf(user, item.contributorSchoolId) && item.contributedById !== user.userId, "Adjudication is by a leader of the contributing school who did not contribute the question.");
  }
  const previous = item.correctionOfId ? await prisma.questionNetworkItem.findUnique({ where: { id: item.correctionOfId } }) : null;
  const done = await prisma.questionNetworkItem.updateMany({ where: { id, status: "IN_REVIEW" }, data: { status: "PUBLISHED", publishedAt: new Date(), adjudication: adjudication ? json({ by: user.userId, reason: adjudication, at: new Date().toISOString(), ...summary }) : Prisma.JsonNull } });
  assert(done.count === 1, "This version changed since you opened it.", 409);
  let notified = 0;
  if (previous && previous.status === "PUBLISHED") {
    await prisma.questionNetworkItem.update({ where: { id: previous.id }, data: { status: "SUPERSEDED" } });
    notified = await notifyAdopters(item.shareKey, `A corrected version of ${item.shareKey} is available`, `Version ${item.version} corrects version ${previous.version}: ${item.changeNote ?? ""}. Your adopted version stays as it is until you accept the correction; completed assessments are not changed.`, "CORRECTION_AVAILABLE", { version: item.version });
  }
  return { item: await prisma.questionNetworkItem.findUniqueOrThrow({ where: { id } }), notified };
}

const CorrectionInput = z.object({ prompt: text(5, 12000).optional(), modelAnswer: text(1, 12000).optional(), correctOptionId: text(1, 120).nullable().optional(), changeNote: text(10, 1000) }).strict();

/** Any teacher who can see a published version may propose a correction; it is a new version to review. */
export async function proposeCorrection(user: AuthUser, id: string, raw: unknown) {
  const item = await load(user, id);
  const input = parse(CorrectionInput, raw);
  assert(item.status === "PUBLISHED", "Corrections are proposed against the published version.", 409);
  const open = await prisma.questionNetworkItem.findFirst({ where: { shareKey: item.shareKey, status: { in: ["IN_REVIEW", "AWAITING_AUTHORITY"] } } });
  assert(!open, `Version ${open?.version} is already in review.`, 409);
  const content = { ...(item.content as Record<string, unknown>), ...(input.prompt ? { prompt: input.prompt } : {}) };
  const answerKey = { ...(item.answerKey as Record<string, unknown>), ...(input.modelAnswer ? { modelAnswer: input.modelAnswer } : {}), ...(input.correctOptionId !== undefined ? { correctOptionId: input.correctOptionId } : {}) };
  await assertNoLearnerNames(user.schoolId, [String(content.prompt ?? ""), String(answerKey.modelAnswer ?? ""), input.changeNote]);
  const last = await prisma.questionNetworkItem.findFirst({ where: { shareKey: item.shareKey }, orderBy: { version: "desc" }, select: { version: true } });
  return prisma.questionNetworkItem.create({ data: {
    shareKey: item.shareKey, version: (last?.version ?? item.version) + 1, contributorSchoolId: item.contributorSchoolId, contributorCampusId: item.contributorCampusId, contributedById: user.userId,
    source: json({ ...(item.source as Record<string, unknown>), proposedBySchoolId: user.schoolId }), audience: item.audience, networkId: item.networkId, rights: json(item.rights), tags: json(item.tags),
    content: json(content), answerKey: json(answerKey), status: "IN_REVIEW", embargoUntil: item.embargoUntil, authorizedById: item.authorizedById, correctionOfId: item.id, changeNote: input.changeNote,
  } });
}

/** Withdrawal blocks future reuse of every version; adopters are told; delivered history is untouched. */
export async function withdrawQuestion(user: AuthUser, id: string, raw: unknown) {
  const item = await load(user, id);
  const { reason } = parse(z.object({ reason: text(10, 500) }).strict(), raw);
  assert(ownContribution(user, item) || leaderOf(user, item.contributorSchoolId), "The contributor or a leader of the contributing school withdraws.");
  await prisma.questionNetworkItem.updateMany({ where: { shareKey: item.shareKey, status: { in: ["AWAITING_AUTHORITY", "IN_REVIEW", "PUBLISHED", "SUPERSEDED"] } }, data: { status: "WITHDRAWN", withdrawnAt: new Date(), withdrawReason: reason } });
  const notified = await notifyAdopters(item.shareKey, `${item.shareKey} was withdrawn`, `Reason: ${reason}. Do not use it in new assessments. Completed assessments keep their original version.`, "WITHDRAWN_UPSTREAM", { reason });
  return { withdrawn: item.shareKey, notified };
}

// ─── Reuse and evidence ─────────────────────────────────────────

export async function adoptQuestion(user: AuthUser, id: string) {
  const item = await load(user, id);
  assert(item.status === "PUBLISHED", "Only a published, reviewed version can be adopted.", 409);
  const existing = await prisma.questionNetworkAdoption.findUnique({ where: { adopterSchoolId_shareKey: { adopterSchoolId: user.schoolId, shareKey: item.shareKey } } });
  if (existing) { assert(existing.itemId === item.id, "Your school adopted an earlier version; accept the correction instead.", 409); return existing; }
  return prisma.questionNetworkAdoption.create({ data: { shareKey: item.shareKey, itemId: item.id, adopterSchoolId: user.schoolId, adoptedById: user.userId, history: json([{ at: new Date().toISOString(), event: "ADOPTED", version: item.version, by: user.userId }]) } });
}

export async function acceptCorrection(user: AuthUser, adoptionId: string) {
  await teaching(user);
  const adoption = await prisma.questionNetworkAdoption.findUnique({ where: { id: adoptionId } });
  assert(!!adoption && adoption.adopterSchoolId === user.schoolId, "Adoption not found", 404);
  assert(adoption.status === "CORRECTION_AVAILABLE", "There is no correction to accept.", 409);
  const latest = await prisma.questionNetworkItem.findFirst({ where: { shareKey: adoption.shareKey, status: "PUBLISHED" }, orderBy: { version: "desc" } });
  assert(!!latest, "The correction is no longer published.", 409);
  return prisma.questionNetworkAdoption.update({ where: { id: adoptionId }, data: { itemId: latest.id, status: "ACTIVE", history: push(adoption.history, { event: "ACCEPTED_CORRECTION", version: latest.version, by: user.userId }) } });
}

export async function reportUse(user: AuthUser, id: string, raw: unknown) {
  const item = await load(user, id);
  const input = parse(z.object({ sampleSize: z.number().int().min(1).max(100000), meanScore: z.number().min(0).max(1), context: text(3, 120) }).strict(), raw);
  const adopted = await prisma.questionNetworkAdoption.findFirst({ where: { adopterSchoolId: user.schoolId, itemId: id } });
  assert(!!adopted || item.contributorSchoolId === user.schoolId, "Only schools that used this version report evidence.");
  return prisma.questionNetworkStat.upsert({ where: { shareKey_version_reporterSchoolId_context: { shareKey: item.shareKey, version: item.version, reporterSchoolId: user.schoolId, context: input.context } }, create: { shareKey: item.shareKey, version: item.version, reporterSchoolId: user.schoolId, reportedById: user.userId, ...input }, update: { sampleSize: input.sampleSize, meanScore: input.meanScore, reportedById: user.userId } });
}

/** Counts and a weighted mean only; small reports are left out and small totals are not shown. */
export function statSummary(stats: { sampleSize: number; meanScore: number }[]) {
  const usable = stats.filter((s) => s.sampleSize >= STAT_MIN_REPORT);
  const total = usable.reduce((s, x) => s + x.sampleSize, 0);
  const suppressed = stats.length - usable.length;
  if (total < STAT_MIN_TOTAL) return { shown: false as const, reports: usable.length, suppressed, minimum: STAT_MIN_TOTAL };
  return { shown: true as const, sampleSize: total, reports: usable.length, suppressed, meanScore: Math.round((usable.reduce((s, x) => s + x.meanScore * x.sampleSize, 0) / total) * 100) / 100, note: "Observed facility from reporting schools; not a calibrated difficulty." };
}

// ─── Overview ───────────────────────────────────────────────────

export async function networkOverview(user: AuthUser) {
  await teaching(user);
  const networks = await myNetworks(user.schoolId);
  const now = new Date();
  const candidates = await prisma.questionNetworkItem.findMany({ where: { OR: [{ contributorSchoolId: user.schoolId }, { status: { in: ["IN_REVIEW", "PUBLISHED"] }, audience: { in: ["PUBLIC", "NETWORK"] } }] }, orderBy: [{ shareKey: "asc" }, { version: "desc" }], take: 500 });
  const items = candidates.filter((i) => visible(user, i, networks, now));
  const ids = items.map((i) => i.id);
  const [reviews, adoptions, stats, myNetworkRows, invites] = await Promise.all([
    prisma.questionNetworkReview.findMany({ where: { itemId: { in: ids } }, orderBy: { createdAt: "asc" } }),
    prisma.questionNetworkAdoption.findMany({ where: { adopterSchoolId: user.schoolId } }),
    prisma.questionNetworkStat.findMany({ where: { shareKey: { in: [...new Set(items.map((i) => i.shareKey))] } } }),
    prisma.questionNetwork.findMany({ where: { id: { in: [...networks] } } }),
    prisma.questionNetworkMember.findMany({ where: { memberSchoolId: user.schoolId, status: "INVITED" } }),
  ]);
  const decorate = (i: Item) => {
    const mine = reviews.filter((r) => r.itemId === i.id);
    return { ...i, reviews: mine.map((r) => ({ decision: r.decision, conflict: r.conflict, conflictNote: r.conflictNote, issues: r.issues, version: r.version, reviewerSchool: r.reviewerSchoolId === user.schoolId ? "Your school" : "Another school", mine: r.reviewerId === user.userId })), summary: reviewSummary(mine), stats: statSummary(stats.filter((s) => s.shareKey === i.shareKey && s.version === i.version)) };
  };
  return {
    userId: user.userId, schoolId: user.schoolId, isLeader: LEADERS.includes(user.role),
    library: items.filter((i) => i.status === "PUBLISHED" && i.contributorSchoolId !== user.schoolId).map(decorate),
    reviewQueue: items.filter((i) => i.status === "IN_REVIEW" && i.contributedById !== user.userId).map(decorate),
    contributions: items.filter((i) => i.contributorSchoolId === user.schoolId).map(decorate),
    adoptions: adoptions.map((a) => ({ ...a, item: items.find((i) => i.id === a.itemId) ?? null })),
    networks: myNetworkRows, invites,
  };
}

/** The school's approved bank questions that may be offered for sharing (checks repeat on submit). */
export async function shareableQuestions(user: AuthUser) {
  await teaching(user);
  const revisions = await prisma.schoolAiRevision.findMany({ where: { schoolId: user.schoolId, status: "APPROVED", ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}), record: { kind: "PAPER", status: { not: "ARCHIVED" }, ...(user.role === "TEACHER" ? { createdById: user.userId } : {}) } }, orderBy: { createdAt: "desc" }, take: 10, select: { recordId: true, version: true, title: true, data: true } });
  return revisions.flatMap((r) => ((r.data as { questions?: { id: string; prompt: string }[] }).questions ?? []).map((q) => ({ paperId: r.recordId, paperVersion: r.version, questionId: q.id, paperTitle: r.title, prompt: q.prompt.slice(0, 160) })));
}
