import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { z } from "zod";
import { SchoolAiError, assertSchoolAiAccess, assertWorkspacePermission, assertWorkspaceSubject, isSchoolAiManager, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, type WorkspacePermissionSnapshot } from "./access";
import { curriculumDataSchema, paperDataSchema, type PaperData } from "./assessment";
import { bankFiltersSchema, bankQuestionMatches, bankReuseSchema, bankSourceSchema, reuseBankQuestion, type BankEntry } from "./question-bank";

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
  return { paperId: current.id, paperVersion: revision.version, paper, curriculum, question, campusId: current.campusId, approvedAt: revision.createdAt.toISOString(), title: revision.title };
}
function entry(source: Awaited<ReturnType<typeof approvedSource>>): BankEntry {
  return { source: { paperId: source.paperId, paperVersion: source.paperVersion, questionId: source.question.id }, paperTitle: source.title, approvedAt: source.approvedAt, campusId: source.campusId, language: source.paper.language, subjectId: source.paper.subjectId, classId: source.paper.classId, curriculumId: source.paper.curriculumId, curriculumVersion: source.paper.curriculumVersion, question: source.question, outcomes: source.question.outcomeIds.map((id) => {
    const outcome = source.curriculum.outcomes.find((item) => item.id === id)!;
    const material = source.curriculum.sources.find((item) => item.id === outcome.sourceId)!;
    return { id, title: outcome.title, sourceTitle: material.title, sourceReference: material.reference, page: outcome.sourcePage };
  }) };
}
export async function listQuestionBank(user: AuthUser, raw: unknown) {
  return context(user, async () => {
    const permissions = await bankAccess(user);
    const filters = bankFiltersSchema.parse(raw);
    const campusId = await resolveWorkspaceCampus(user, filters.campusId);
    await assertWorkspaceSubject(user, campusId, filters);
    const cursor = decodeCursor(filters.cursor);
    const where: Prisma.SchoolAiRevisionWhereInput = { schoolId: user.schoolId, campusId, status: "APPROVED", AND: [{ data: { path: ["subjectId"], equals: filters.subjectId } }, { data: { path: ["classId"], equals: filters.classId } }, ...(filters.language ? [{ data: { path: ["language"], equals: filters.language } }] : [])], record: { kind: "PAPER", status: { not: "ARCHIVED" }, ...(user.role === "TEACHER" ? { createdById: user.userId, subjectId: filters.subjectId, classId: filters.classId } : {}) } };
    if (cursor && !await prisma.schoolAiRevision.findFirst({ where: { ...where, id: cursor.revisionId }, select: { id: true } })) throw new SchoolAiError("The question-bank page is no longer available.", 404);
    const revisions = await prisma.schoolAiRevision.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 11, ...(cursor ? { cursor: { id: cursor.revisionId } } : {}) });
    const items: BankEntry[] = [];
    for (const revision of revisions.slice(0, 10)) {
      const paper = paperDataSchema.parse(revision.data);
      if (paper.subjectId !== filters.subjectId || paper.classId !== filters.classId) continue;
      const start = cursor?.revisionId === revision.id ? cursor.index : 0;
      let revisionSource: Awaited<ReturnType<typeof approvedSource>> | null = null;
      for (let index = start; index < paper.questions.length; index++) {
        const question = paper.questions[index];
        if (!bankQuestionMatches(question, paper, filters)) continue;
        revisionSource ??= await approvedSource(user, { paperId: revision.recordId, paperVersion: revision.version, questionId: question.id }, prisma, permissions);
        items.push(entry({ ...revisionSource, question }));
        if (items.length === 20) return { items, nextCursor: encodeCursor(revision.id, index + 1) };
      }
    }
    return { items, ...(revisions.length > 10 ? { nextCursor: encodeCursor(revisions[9].id, 100) } : {}) };
  });
}

export async function prepareQuestionReuse(user: AuthUser, raw: unknown) {
  return context(user, async () => {
    const permissions = await bankAccess(user);
    await assertSchoolAiAccess(user, "add", permissions); await assertWorkspacePermission(user, "exams", "add", permissions);
    const input = bankReuseSchema.parse(raw);
    const source = await approvedSource(user, input.source, prisma, permissions);
    const { getWorkspaceRecord } = await import("./repository");
    const record = await getWorkspaceRecord(user, input.paper.curriculumId);
    if (record.kind !== "CURRICULUM" || record.status !== "APPROVED" || record.version !== input.paper.curriculumVersion || record.campusId !== source.campusId) throw new SchoolAiError("Choose the current approved curriculum from the same campus before reusing a question.", 409);
    const curriculum = curriculumDataSchema.parse(record.data);
    await assertWorkspaceSubject(user, record.campusId, curriculum);
    try { return { paper: reuseBankQuestion(input, source, curriculum, randomUUID()) }; }
    catch (error) { throw new SchoolAiError(error instanceof Error ? error.message : "Review the question mapping before reuse.", 422); }
  });
}

/** Repository hook: clients cannot label an invented or inaccessible source as approved provenance. */
export async function validatePaperBankProvenance(user: AuthUser, paper: PaperData, campusId: string | null, db: TxClient, permissions: WorkspacePermissionSnapshot) {
  const sources = new Map<string, Awaited<ReturnType<typeof approvedSource>>>();
  for (const question of paper.questions) if (question.reusedFrom) {
    const origin = question.reusedFrom;
    const key = `${origin.paperId}:${origin.paperVersion}`;
    const source = sources.get(key) ?? await approvedSource(user, { paperId: origin.paperId, paperVersion: origin.paperVersion, questionId: origin.questionId }, db, permissions, true);
    sources.set(key, source);
    if (!source.paper.questions.some((item) => item.id === origin.questionId)) throw new SchoolAiError("The approved source question was not found.", 404);
    if (source.campusId !== campusId || source.paper.subjectId !== paper.subjectId || source.paper.classId !== paper.classId || origin.curriculumId !== source.paper.curriculumId || origin.curriculumVersion !== source.paper.curriculumVersion) throw new SchoolAiError("Question provenance must identify its actual approved source and curriculum scope.", 403);
  }
}
