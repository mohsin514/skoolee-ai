import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { z } from "zod";
import { SchoolAiError, assertSchoolAiAccess, assertWorkspacePermission, assertWorkspaceSubject, isSchoolAiManager, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, type WorkspacePermissionSnapshot } from "./access";
import { curriculumDataSchema, paperDataSchema, type PaperData } from "./assessment";
import { alignmentIssues, bankFiltersSchema, bankQuestionMatches, bankReuseSchema, bankSourceSchema, reuseAlignment, reuseBankQuestion, type BankEntry, type CurriculumRef, type ReuseAlignment } from "./question-bank";
import { mergeBankReuseEligibility, type BankReuseEligibility } from "./question-bank-exposure";
import { bankEligibilityFromFacts, loadBankExposureFacts } from "./question-bank-exposure-service";
import { schoolAiTransaction } from "./transaction";

const cursorSchema = z.object({ revisionId: z.string().min(1).max(120), index: z.number().int().min(0).max(100) }).strict();
const encodeCursor = (revisionId: string, index: number) => Buffer.from(JSON.stringify({ revisionId, index })).toString("base64url");
function decodeCursor(value?: string) {
  if (!value) return null;
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
  catch { throw new SchoolAiError("The question-bank page reference is invalid."); }
}
function context<T>(user: AuthUser, fn: () => Promise<T>) {
  return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role, unscoped: false }, fn);
}
async function bankAccess(user: AuthUser, db: TxClient = prisma, grants?: WorkspacePermissionSnapshot) {
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, role: user.role, isActive: true, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) }, select: { accessVersion: true } });
  if (!actor || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new SchoolAiError("Your question-bank access changed. Sign in again before continuing.", 403, "ACCESS_CHANGED");
  const permissions = grants ?? await loadWorkspacePermissionSnapshot(user, db);
  await assertSchoolAiAccess(user, "view", permissions);
  await assertWorkspacePermission(user, "exams", "view", permissions);
  if (!isSchoolAiManager(user) && user.role !== "TEACHER") throw new SchoolAiError("The question bank is available to authorized teaching staff only.", 403);
  return permissions;
}
async function approvedSource(user: AuthUser, source: z.infer<typeof bankSourceSchema>, db: TxClient = prisma, grants?: WorkspacePermissionSnapshot, allowArchived = false) {
  await bankAccess(user, db, grants);
  const current = await db.schoolAiRecord.findFirst({ where: { id: source.paperId, kind: "PAPER", schoolId: user.schoolId, ...(!allowArchived ? { status: { not: "ARCHIVED" } } : {}), ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}), ...(user.role === "TEACHER" ? { createdById: user.userId } : {}) } });
  if (!current?.campusId) throw new SchoolAiError("The source paper is unavailable in your question bank.", 404);
  await assertWorkspaceSubject(user, current.campusId, current.data as Record<string, unknown>, db);
  const revision = await db.schoolAiRevision.findFirst({ where: { recordId: current.id, version: source.paperVersion, status: "APPROVED", schoolId: user.schoolId, campusId: current.campusId } });
  if (!revision) throw new SchoolAiError("This source paper version was not approved.", 404);
  const paper = paperDataSchema.parse(revision.data);
  await assertWorkspaceSubject(user, current.campusId, paper, db);
  const question = paper.questions.find((item) => item.id === source.questionId);
  if (!question) throw new SchoolAiError("The approved question was not found.", 404);
  const curriculumRevision = await db.schoolAiRevision.findFirst({ where: { recordId: paper.curriculumId, version: paper.curriculumVersion, status: "APPROVED", schoolId: user.schoolId, campusId: current.campusId, record: { kind: "CURRICULUM" } } });
  if (!curriculumRevision) throw new SchoolAiError("The approved source curriculum version is unavailable.", 409);
  const curriculum = curriculumDataSchema.parse(curriculumRevision.data);
  if (curriculum.subjectId !== paper.subjectId || curriculum.classId !== paper.classId) throw new SchoolAiError("The approved source scope does not match.", 409);
  return { paperId: current.id, paperVersion: revision.version, paper, curriculum, question, campusId: current.campusId, sourceStatus: current.status, approvedAt: revision.createdAt.toISOString(), title: revision.title };
}
export type EligibleBankEntry = BankEntry & { eligibility: BankReuseEligibility };
function entry(source: Awaited<ReturnType<typeof approvedSource>>, eligibility: BankReuseEligibility): EligibleBankEntry {
  return { eligibility, source: { paperId: source.paperId, paperVersion: source.paperVersion, questionId: source.question.id }, paperTitle: source.title, approvedAt: source.approvedAt, campusId: source.campusId, language: source.paper.language, subjectId: source.paper.subjectId, classId: source.paper.classId, curriculumId: source.paper.curriculumId, curriculumVersion: source.paper.curriculumVersion, question: source.question, outcomes: source.question.outcomeIds.map((id) => {
    const outcome = source.curriculum.outcomes.find((item) => item.id === id)!;
    const material = source.curriculum.sources.find((item) => item.id === outcome.sourceId)!;
    return { id, title: outcome.title, sourceTitle: material.title, sourceReference: material.reference, page: outcome.sourcePage };
  }) };
}

/** SKO-406 decisions between two curriculum versions, in either direction. */
async function objectiveDecisions(db: TxClient, schoolId: string, a: CurriculumRef, b: CurriculumRef) {
  if (a.curriculumId === b.curriculumId && a.curriculumVersion === b.curriculumVersion) return [];
  return db.curriculumObjectiveMapping.findMany({ where: { schoolId, OR: [
    { fromRecordId: a.curriculumId, fromVersion: a.curriculumVersion, toRecordId: b.curriculumId, toVersion: b.curriculumVersion },
    { fromRecordId: b.curriculumId, fromVersion: b.curriculumVersion, toRecordId: a.curriculumId, toVersion: a.curriculumVersion },
  ] }, orderBy: { createdAt: "desc" }, take: 2000 });
}

/** Caches only within one read/transaction. The save path always gets a fresh exposure snapshot. */
function eligibilityReader(user: AuthUser, db: TxClient, permissions: WorkspacePermissionSnapshot, now: Date) {
  const facts = new Map<string, ReturnType<typeof loadBankExposureFacts>>();
  const decisions = new Map<string, BankReuseEligibility>();
  const read = async (source: Awaited<ReturnType<typeof approvedSource>>, ancestors: readonly string[] = []): Promise<BankReuseEligibility> => {
    const paperKey = `${source.paperId}:${source.paperVersion}`, itemKey = `${paperKey}:${source.question.id}`;
    if (ancestors.includes(itemKey) || ancestors.length >= 16) throw new SchoolAiError("The source lineage needs review before reuse. Choose another reviewed question.", 409, "BANK_LINEAGE_UNAVAILABLE");
    const cached = decisions.get(itemKey); if (cached) return cached;
    if (!facts.has(paperKey)) facts.set(paperKey, loadBankExposureFacts(db, user.schoolId, source, now));
    let result = bankEligibilityFromFacts(source, source.question.id, await facts.get(paperKey)!, now);
    if (source.question.reusedFrom) {
      const origin = source.question.reusedFrom;
      const parent = await approvedSource(user, { paperId: origin.paperId, paperVersion: origin.paperVersion, questionId: origin.questionId }, db, permissions, true);
      if (parent.campusId !== source.campusId || parent.paper.subjectId !== source.paper.subjectId || parent.paper.classId !== source.paper.classId) throw new SchoolAiError("The source lineage no longer matches this teaching scope.", 403, "BANK_LINEAGE_UNAVAILABLE");
      result = mergeBankReuseEligibility(result, await read(parent, [...ancestors, itemKey]));
    }
    decisions.set(itemKey, result); return result;
  };
  return read;
}
function assertReusable(eligibility: BankReuseEligibility) {
  if (eligibility.reuse === "BLOCKED") throw new SchoolAiError("This source has a recorded reuse restriction. Review its exposure and release details, or choose another reviewed question. Your draft has not been changed.", 409, `BANK_REUSE_${eligibility.reasons[0]}`);
}
export async function listQuestionBank(user: AuthUser, raw: unknown) {
  return context(user, async () => {
    const permissions = await bankAccess(user);
    const filters = bankFiltersSchema.parse(raw);
    const campusId = await resolveWorkspaceCampus(user, filters.campusId);
    await assertWorkspaceSubject(user, campusId, filters);
    const cursor = decodeCursor(filters.cursor);
    // When the teacher names the curriculum version being assembled, each entry carries the reviewed alignment to it.
    const targetRecord = filters.targetCurriculumId ? await prisma.schoolAiRevision.findFirst({ where: { schoolId: user.schoolId, campusId, recordId: filters.targetCurriculumId, version: filters.targetCurriculumVersion ?? -1, status: "APPROVED", record: { kind: "CURRICULUM" } } }) : null;
    if (filters.targetCurriculumId && !targetRecord) throw new SchoolAiError("Choose an approved curriculum version from your campus.", 404);
    const target = targetRecord ? { ref: { curriculumId: targetRecord.recordId, curriculumVersion: targetRecord.version }, outcomes: curriculumDataSchema.parse(targetRecord.data).outcomes.filter(outcome => outcome.included && outcome.taught).map(outcome => outcome.id) } : null;
    const alignments = new Map<string, Promise<Awaited<ReturnType<typeof objectiveDecisions>>>>();
    const alignmentFor = async (entryValue: EligibleBankEntry): Promise<ReuseAlignment | undefined> => {
      if (!target) return undefined;
      const ref = { curriculumId: entryValue.curriculumId, curriculumVersion: entryValue.curriculumVersion }, key = `${ref.curriculumId}:${ref.curriculumVersion}`;
      if (!alignments.has(key)) alignments.set(key, objectiveDecisions(prisma, user.schoolId, ref, target.ref));
      return reuseAlignment(ref, target.ref, entryValue.question.outcomeIds, target.outcomes, await alignments.get(key)!);
    };
    const wanted = (alignment: ReuseAlignment | undefined, question: { outcomeIds: string[] }) => !filters.outcomeId || (alignment?.mode === "MAPPED" ? Object.values(alignment.targets).some(list => list.some(item => item.outcomeId === filters.outcomeId)) : question.outcomeIds.includes(filters.outcomeId));
    const where: Prisma.SchoolAiRevisionWhereInput = { schoolId: user.schoolId, campusId, status: "APPROVED", AND: [{ data: { path: ["subjectId"], equals: filters.subjectId } }, { data: { path: ["classId"], equals: filters.classId } }, ...(filters.language ? [{ data: { path: ["language"], equals: filters.language } }] : [])], record: { kind: "PAPER", ...(user.role === "TEACHER" ? { createdById: user.userId, subjectId: filters.subjectId, classId: filters.classId } : {}) } };
    if (cursor && !await prisma.schoolAiRevision.findFirst({ where: { ...where, id: cursor.revisionId }, select: { id: true } })) throw new SchoolAiError("The question-bank page is no longer available.", 404);
    const revisions = await prisma.schoolAiRevision.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 11, ...(cursor ? { cursor: { id: cursor.revisionId } } : {}) });
    const items: EligibleBankEntry[] = [];
    const readEligibility = eligibilityReader(user, prisma, permissions, new Date());
    for (const revision of revisions.slice(0, 10)) {
      const paper = paperDataSchema.parse(revision.data);
      if (paper.subjectId !== filters.subjectId || paper.classId !== filters.classId) continue;
      const start = cursor?.revisionId === revision.id ? cursor.index : 0;
      let revisionSource: Awaited<ReturnType<typeof approvedSource>> | null = null;
      for (let index = start; index < paper.questions.length; index++) {
        const question = paper.questions[index];
        if (!bankQuestionMatches(question, paper, filters)) continue;
        revisionSource ??= await approvedSource(user, { paperId: revision.recordId, paperVersion: revision.version, questionId: question.id }, prisma, permissions, true);
        const source = { ...revisionSource, question };
        const value = entry(source, await readEligibility(source));
        value.alignment = await alignmentFor(value);
        if (!wanted(value.alignment, question)) continue;
        items.push(value);
        if (items.length === 20) return { items, nextCursor: encodeCursor(revision.id, index + 1) };
      }
    }
    return { items, ...(revisions.length > 10 ? { nextCursor: encodeCursor(revisions[9].id, 100) } : {}) };
  });
}

export async function prepareQuestionReuse(user: AuthUser, raw: unknown) {
  return schoolAiTransaction(user, db => prepareQuestionReuseInTransaction(user, raw, db));
}

/** The preview is not a reservation; repository provenance validation repeats the guard on save. */
export async function prepareQuestionReuseInTransaction(user: AuthUser, raw: unknown, db: TxClient, now = new Date()) {
    const permissions = await bankAccess(user, db);
    await assertSchoolAiAccess(user, "add", permissions); await assertWorkspacePermission(user, "exams", "add", permissions);
    const input = bankReuseSchema.parse(raw);
    const source = await approvedSource(user, input.source, db, permissions, true);
    assertReusable(await eligibilityReader(user, db, permissions, now)(source));
    const record = await db.schoolAiRecord.findFirst({ where: { id: input.paper.curriculumId, schoolId: user.schoolId, campusId: source.campusId, kind: "CURRICULUM", status: "APPROVED", version: input.paper.curriculumVersion } });
    if (!record) throw new SchoolAiError("Choose the current approved curriculum from the same campus before reusing a question.", 409);
    const curriculum = curriculumDataSchema.parse(record.data);
    await assertWorkspaceSubject(user, record.campusId, curriculum, db);
    const sourceRef = { curriculumId: source.paper.curriculumId, curriculumVersion: source.paper.curriculumVersion }, targetRef = { curriculumId: record.id, curriculumVersion: record.version };
    const alignment = reuseAlignment(sourceRef, targetRef, source.question.outcomeIds, curriculum.outcomes.map(outcome => outcome.id), await objectiveDecisions(db, user.schoolId, sourceRef, targetRef));
    const misaligned = alignmentIssues(alignment, input.mappings);
    if (misaligned.length) throw new SchoolAiError(misaligned.join(" "), 409, "BANK_REUSE_UNMAPPED_OBJECTIVE");
    try { return { paper: reuseBankQuestion(input, source, curriculum, randomUUID()) }; }
    catch (error) { throw new SchoolAiError(error instanceof Error ? error.message : "Review the question mapping before reuse.", 422); }
}

/** Repository hook: clients cannot label an invented or inaccessible source as approved provenance. */
export async function validatePaperBankProvenance(user: AuthUser, paper: PaperData, campusId: string | null, db: TxClient, permissions: WorkspacePermissionSnapshot) {
  const sources = new Map<string, Awaited<ReturnType<typeof approvedSource>>>();
  const readEligibility = eligibilityReader(user, db, permissions, new Date());
  for (const question of paper.questions) if (question.reusedFrom) {
    const origin = question.reusedFrom;
    const key = `${origin.paperId}:${origin.paperVersion}`;
    const source = sources.get(key) ?? await approvedSource(user, { paperId: origin.paperId, paperVersion: origin.paperVersion, questionId: origin.questionId }, db, permissions, true);
    sources.set(key, source);
    const original = source.paper.questions.find((item) => item.id === origin.questionId);
    if (!original) throw new SchoolAiError("The approved source question was not found.", 404);
    if (source.campusId !== campusId || source.paper.subjectId !== paper.subjectId || source.paper.classId !== paper.classId || origin.curriculumId !== source.paper.curriculumId || origin.curriculumVersion !== source.paper.curriculumVersion) throw new SchoolAiError("Question provenance must identify its actual approved source and curriculum scope.", 403);
    assertReusable(await readEligibility({ ...source, question: original }));
  }
}
