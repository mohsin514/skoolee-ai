import { EXAM_CHAIN_APPROVAL_KINDS, examChainPolicy, mayApprove, type ApprovalAuthority } from "./exam-authority";
import { headsAuthorDepartment } from "./department-heads";
import { isDeepStrictEqual } from "node:util";
import { validateKnowledgeReferences } from "./knowledge-service";
import { Prisma, type SchoolAiRecord as StoredRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { z } from "zod";
import {
  SchoolAiError, allowedWorkspaceKinds, assertApprovalRole, assertApprovalSeparation, assertSchoolAiAccess, assertSchoolAiRole,
  assertWorkspaceDomainPermission, assertWorkspaceSubject, canAccessWorkspaceRecord,
  getAssignedWorkspaceSubjects, isSchoolAiManager, resolveWorkspaceCampus, type WorkspacePermissionSnapshot,
  loadWorkspacePermissionSnapshot,
} from "./access";
import { DELIVERY_POLICY_KIND, resolveDeliveryPolicy, type ResolvedDeliveryPolicy } from "./delivery-policy";
import { legacyWorkspaceRequestHash } from "./canonical";
import { createWorkspaceSchema, parseWorkspaceData, updateWorkspaceSchema, workspaceIdSchema } from "./schemas";
import { curriculumDataSchema, paperDataSchema, validatePaperApproval } from "./assessment";
import { protectLessonPlans } from "./learning";
import { canLeadAcademics, canManageOperations } from "@/lib/api/scope";
import { PaperReviewWriteError, preparePaperContentWrite } from "./item-review";
import { nextWorkspaceStatus, protectSourceMetadata, TRUSTED_SOURCE_FIELDS, workspaceApprovalIssues, type TrustedSourceMetadata } from "./workflows";
import type { AiWorkspaceRecord, WorkspaceCreateInput, WorkspaceKind, WorkspaceRevision, WorkspaceStatus, WorkspaceUpdateInput } from "./types";
import type { WorkspaceHistoryAccess, WorkspaceRevisionPage, WorkspaceRevisionView } from "./revisions";
import { schoolAiTransaction as transaction } from "./transaction";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function dataOf(record: StoredRecord): Record<string, unknown> { return record.data as Record<string, unknown>; }
function preparePaperWrite(user: AuthUser, incoming: Record<string, unknown>, previous?: Record<string, unknown>): Record<string, unknown> {
  try {
    const before = previous ? paperDataSchema.parse(previous) : null, after = paperDataSchema.parse(incoming);
    // SKO-408: form-set membership and item groups are written only by the form-set service.
    if (!isDeepStrictEqual(before?.formSet, after.formSet) || !isDeepStrictEqual(before?.itemGroupIds, after.itemGroupIds)) throw new SchoolAiError("Form-set membership and item groups change only through the parallel-forms workspace.", 403, "PAPER_FORM_SET_AUTHORITY");
    return preparePaperContentWrite(before, after, { actorId: user.userId, at: new Date().toISOString() });
  } catch (error) {
    if (error instanceof PaperReviewWriteError) throw new SchoolAiError(error.message, error.status, "PAPER_REVIEW_AUTHORITY");
    throw error;
  }
}
function publicRecord(record: StoredRecord): AiWorkspaceRecord {
  return { id: record.id, kind: record.kind as WorkspaceKind, title: record.title, campusId: record.campusId, version: record.version, status: record.status as WorkspaceStatus, data: dataOf(record) as AiWorkspaceRecord["data"], createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
}
function withContext<T>(user: AuthUser, fn: () => Promise<T>): Promise<T> {
  assertSchoolAiRole(user);
  return runWithTenantContext({ schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: user.role, unscoped: false }, fn);
}
function translateDatabaseError(error: unknown): never {
  if (error instanceof z.ZodError) throw new SchoolAiError(error.issues.map((issue) => `${issue.path.join(".") || "data"}: ${issue.message}`).slice(0, 12).join(" "), 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034" || error.code === "P2002") throw new SchoolAiError("This item changed concurrently. Reload and retry against its current version.", 409);
    if (error.code === "P2021" || error.code === "P2022") throw new SchoolAiError("School AI storage is not available yet. Apply the school AI database migration before using this workspace.", 503);
  }
  throw error;
}
/** Unchanged hash, moved to `canonical.ts` and re-exported under its existing name so no
 * call site changes. Its output is persisted in `SchoolAiRecord.requestHash`, so the
 * ICU-dependent key order has to stay as it is for idempotency replay on existing rows.
 * New digests use `canonicalDigest` from `./canonical` instead. */
export const workspaceRequestHash = legacyWorkspaceRequestHash;

async function assertKnowledgeEvidenceRead(user:AuthUser,kind:string,campusId:string|null,data:Record<string,unknown>,db:TxClient,permissions?:WorkspacePermissionSnapshot){
  const evidence=kind==="POLICY"?(data.knowledge as {source?:{recordId:string;version:number}}|undefined)?.source:undefined;if(!evidence)return;
  const source=await db.schoolAiRecord.findFirst({where:{id:evidence.recordId,schoolId:user.schoolId,campusId,kind:"SOURCE"}});
  const subjects=user.role==="TEACHER"?await getAssignedWorkspaceSubjects(user,db):[];
  if(!source||!canAccessWorkspaceRecord(user,source,"read",subjects))throw new SchoolAiError("Knowledge evidence is no longer accessible.",403,"PERMISSION_DENIED");
  await assertWorkspaceDomainPermission(user,"SOURCE",dataOf(source),"view",permissions);
  const saved=await db.schoolAiRevision.findFirst({where:{recordId:source.id,schoolId:user.schoolId,campusId,version:evidence.version,status:"APPROVED"},select:{data:true}});
  if(!saved)throw new SchoolAiError("Approved knowledge evidence is no longer accessible.",403,"PERMISSION_DENIED");
  await assertWorkspaceDomainPermission(user,"SOURCE",saved.data as Record<string,unknown>,"view",permissions);
}

async function scopedRecord(user: AuthUser, id: string, mode: "read" | "write", db: TxClient = prisma, permissions?: WorkspacePermissionSnapshot): Promise<StoredRecord> {
  workspaceIdSchema.parse(id);
  const record = await db.schoolAiRecord.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) } });
  const subjects = user.role === "TEACHER" ? await getAssignedWorkspaceSubjects(user, db) : [];
  if (!record || !canAccessWorkspaceRecord(user, record, mode, subjects)) throw new SchoolAiError("Workspace item not found or no longer accessible.", 404);
  await assertWorkspaceDomainPermission(user, record.kind as WorkspaceKind, dataOf(record), "view", permissions);
  await assertKnowledgeEvidenceRead(user,record.kind,record.campusId,dataOf(record),db,permissions);
  return record;
}

/** Original bytes keep every retained classification and teaching-scope obligation.
 * Editing the current text or category never declassifies the immutable upload.
 * Project only authorization facts; do not load historical OCR bodies for this check.
 */
export async function assertSourceOriginalAccess(user: AuthUser, id: string, db: TxClient, options: { version?: number; versions?: readonly number[]; permissions?: WorkspacePermissionSnapshot; preserveClassification?: boolean } = {}) {
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || user.role !== "SUPER_ADMIN" && actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new SchoolAiError("Your source access changed.", 403, "ACCESS_CHANGED");
  const permissions = options.permissions ?? await loadWorkspacePermissionSnapshot(user, db);
  await assertSchoolAiAccess(user, "view", permissions);
  const record = await scopedRecord(user, id, "read", db, permissions), storageKey = dataOf(record).storageKey;
  if (record.kind !== "SOURCE" || typeof storageKey !== "string" || !storageKey.startsWith(`school-ai/${user.schoolId}/`)) throw new SchoolAiError("The private source original is unavailable.", 409, "ORIGINAL_UNAVAILABLE");
  const versions = [...new Set([...(options.versions ?? []), ...(options.version === undefined ? [] : [options.version])])];
  if (versions.length) {
    const saved = await db.schoolAiRevision.findMany({ where: { schoolId: user.schoolId, recordId: id, campusId: record.campusId, version: { in: versions }, data: { path: ["storageKey"], equals: storageKey } }, select: { version: true } });
    if (saved.length !== versions.length) throw new SchoolAiError("The retained source version is no longer available.", 403, "SOURCE_HISTORY_UNAVAILABLE");
  }
  const scopes = await db.$queryRaw<Array<{ campusId: string | null; documentKind: string | null; subjectId: string | null; classId: string | null }>>`
    SELECT DISTINCT campus_id AS "campusId", data->>'documentKind' AS "documentKind", data->>'subjectId' AS "subjectId", data->>'classId' AS "classId"
    FROM school_ai_revisions WHERE school_id=${user.schoolId} AND record_id=${id}
      AND (data->>'storageKey'=${storageKey} OR data->>'storageKey' IS NULL) LIMIT 1001`;
  if (!scopes.length || scopes.length > 1000) throw new SchoolAiError("The retained source authority needs review.", 403, "SOURCE_HISTORY_UNAVAILABLE");
  for (const saved of scopes) {
    if (saved.campusId !== record.campusId) throw new SchoolAiError("The retained original belongs to a different source scope.", 403, "SOURCE_HISTORY_UNAVAILABLE");
    await assertWorkspaceDomainPermission(user, "SOURCE", saved, "view", permissions);
    await assertWorkspaceSubject(user, saved.campusId, saved, db);
  }
  // OCR is derived from the immutable original, even if it was requested after
  // a category edit. Never copy its text into a broader current source scope.
  if (options.preserveClassification) {
    const current = dataOf(record);
    if (scopes.some(saved => saved.documentKind && !["other", "policy"].includes(saved.documentKind) && saved.documentKind !== current.documentKind || saved.subjectId && (saved.subjectId !== current.subjectId || saved.classId !== current.classId))) {
      throw new SchoolAiError("Restore the original source category and teaching scope before applying its extracted text.", 409, "SOURCE_CLASSIFICATION_CHANGED");
    }
  }
}

/**
 * The approved Delivery_Policy revision governing a campus scope (R12.3), or the platform default.
 *
 * The authority is the **approved revision snapshot**, not the record's current `data`: a draft
 * saved on top of an approved policy leaves the approved revision governing, which is what makes
 * R12.3 true without a second store. The newest approved revision in the scope wins, so a school
 * that keeps more than one policy record still gets a deterministic answer. When nothing resolves,
 * `resolveDeliveryPolicy(null)` returns the platform default — standard tier, every managed gate
 * open, `separationOfDuties: "NOT_REQUIRED"` — so degrading removes authority and never grants it.
 */
export async function resolveScopeDeliveryPolicy(user: AuthUser, campusId: string | null, db: TxClient = prisma): Promise<ResolvedDeliveryPolicy> {
  const approved = await db.schoolAiRevision.findFirst({
    where: { schoolId: user.schoolId, campusId, status: "APPROVED", record: { schoolId: user.schoolId, kind: DELIVERY_POLICY_KIND } },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    select: { recordId: true, version: true, data: true },
  });
  return resolveDeliveryPolicy(approved ? { recordId: approved.recordId, version: approved.version, data: approved.data } : null);
}

/**
 * SKO-408 R18.4, R18.5: practice items are copied from released exams of the same class and subject,
 * exactly as delivered, and never from an item group that is scheduled in an exam still to come.
 */
async function validatePracticeReferences(user: AuthUser, campusId: string | null, data: Record<string, unknown>, db: TxClient) {
  const { practiceSetSchema } = await import("./practice");
  const practice = practiceSetSchema.parse(data);
  const now = new Date();
  const assignments = await db.schoolAiExamAssignment.findMany({ where: { id: { in: practice.sourceAssignmentIds }, schoolId: user.schoolId }, select: { id: true, campusId: true, classId: true, endsAt: true, resultsReleasedAt: true, paperSnapshot: true } });
  for (const sourceId of practice.sourceAssignmentIds) {
    const assignment = assignments.find(row => row.id === sourceId);
    if (!assignment || assignment.campusId !== campusId || assignment.classId !== practice.classId) throw new SchoolAiError("Practice can only come from exams of this class and campus.", 403);
    if (!assignment.resultsReleasedAt || assignment.endsAt > now) throw new SchoolAiError("Practice can only use items from an exam whose results are released.", 409, "PRACTICE_SOURCE_UNRELEASED");
    if (paperDataSchema.parse(assignment.paperSnapshot).subjectId !== practice.subjectId) throw new SchoolAiError("Practice can only come from exams of this subject.", 403);
  }
  const groups: string[] = [];
  for (const item of practice.items) {
    const paper = paperDataSchema.parse(assignments.find(row => row.id === item.sourceAssignmentId)!.paperSnapshot);
    const question = paper.questions.find(entry => entry.id === item.questionId);
    if (!question || question.prompt !== item.prompt || question.type !== item.type || question.marks !== item.marks || !isDeepStrictEqual(question.options, item.options)) throw new SchoolAiError("A practice item must match the released item exactly.", 409, "PRACTICE_ITEM_CHANGED");
    groups.push(paper.itemGroupIds?.[question.id] ?? question.id);
  }
  if (await db.schoolAiExposureEntry.count({ where: { schoolId: user.schoolId, itemGroupId: { in: groups }, examDate: { gt: now } } })) throw new SchoolAiError("An item in this practice set is scheduled in a future exam and cannot be used for practice.", 409, "PRACTICE_FUTURE_EXPOSURE");
}

async function validateReferences(user: AuthUser, kind: WorkspaceKind, campusId: string | null, data: Record<string, unknown>, db: TxClient, permissions: WorkspacePermissionSnapshot) {
  if(kind==="POLICY")await validateKnowledgeReferences(user,null,campusId,data,db,permissions);
  if (kind === DELIVERY_POLICY_KIND) {
    // `resolveScopeDeliveryPolicy` looks a policy up by school **and campus**, so a policy stored
    // without a campus would be approved and then govern no attempt at all. Refuse it at write
    // time rather than store a record whose `separationOfDuties` and `maxForms` silently decide
    // nothing (R12.2, R12.3). The body itself is already bound by `deliveryPolicySchema`, and the
    // record carries no cross-record reference to check.
    if (!campusId) throw new SchoolAiError("Choose the campus this delivery policy governs.", 400);
  }
  // PRACTICE carries no cross-record reference under its placeholder body; its released-item and
  // approved-source links land with its schema in SKO-408 task 23.x (R18.4, R18.5), as a branch
  // here. BRIEF now has its body (`assessmentBriefSchema`), whose extracted suggestions name a
  // source record and version; resolving those against an approved source revision needs a read, so
  // it belongs to the brief service in SKO-408 task 5.2 — as a branch here — and not to the pure
  // schema, which bounds their shape only.
  if (kind === "PRACTICE") await validatePracticeReferences(user, campusId, data, db);
  if (kind === "CURRICULUM") {
    // SKO-500: a cited SOURCE revision must exist in this campus at (or before) its current version.
    for (const cited of curriculumDataSchema.parse(data).sources) {
      if (!cited.sourceRecordId) continue;
      const source = await db.schoolAiRecord.findFirst({ where: { id: cited.sourceRecordId, schoolId: user.schoolId, campusId, kind: "SOURCE" }, select: { version: true } });
      if (!source || (cited.sourceVersion ?? 1) > source.version) throw new SchoolAiError("A cited syllabus is not available in this campus.", 409, "CURRICULUM_SOURCE_MISSING");
    }
  }
  if (kind === "PAPER") {
    const paper = paperDataSchema.parse(data);
    const curriculum = await scopedRecord(user, paper.curriculumId, "read", db, permissions);
    if (curriculum.kind !== "CURRICULUM" || curriculum.campusId !== campusId || curriculum.subjectId !== paper.subjectId || curriculum.classId !== paper.classId) throw new SchoolAiError("Choose a curriculum from the same campus, class and subject.", 403);
    if (paper.questions.some(question=>question.figures?.length)) { const {validatePaperFigures}=await import("./paper-figure-service"); await validatePaperFigures(user,paper,campusId,db,permissions); }
    if (paper.questions.some((question) => question.reusedFrom)) {
      const { validatePaperBankProvenance } = await import("./question-bank-service");
      await validatePaperBankProvenance(user, paper, campusId, db, permissions);
    }
    if (paper.formativeOf) {
      // The link must name approved practice of this class and subject, and only its own source exams.
      const practice = await scopedRecord(user, paper.formativeOf.practiceRecordId, "read", db, permissions);
      if (practice.kind !== "PRACTICE" || practice.status !== "APPROVED" || practice.campusId !== campusId || practice.classId !== paper.classId || practice.subjectId !== paper.subjectId) throw new SchoolAiError("A formative check follows approved practice of the same class and subject.", 403);
      const { practiceSetSchema } = await import("./practice");
      const sources = practiceSetSchema.parse(dataOf(practice)).sourceAssignmentIds;
      if (paper.formativeOf.sourceAssignmentIds.some(sourceId => !sources.includes(sourceId))) throw new SchoolAiError("A formative check names only the exams its practice came from.", 403);
    }
  }
  if (kind === "WORKFLOW") {
    for (const id of data.sourceIds as string[]) {
      const source = await scopedRecord(user, id, "read", db, permissions);
      if (source.kind !== "SOURCE" || source.status === "ARCHIVED" || source.campusId !== campusId) throw new SchoolAiError("Workflow evidence must be an accessible source from the same campus.", 403);
    }
  }
}

async function approvalIssues(user: AuthUser, record: StoredRecord, db: TxClient, permissions: WorkspacePermissionSnapshot, action: "approve" | "review" = "approve") {
  const data = parseWorkspaceData(record.kind as WorkspaceKind, dataOf(record));
  const issues = workspaceApprovalIssues(record.kind as WorkspaceKind, data);
  if(record.kind==="POLICY")await validateKnowledgeReferences(user,record.id,record.campusId,data,db,permissions,true);
  if (record.kind === "PAPER") {
    const paper = paperDataSchema.parse(data);
    const curriculum = await scopedRecord(user, paper.curriculumId, "read", db, permissions);
    if (curriculum.kind !== "CURRICULUM" || curriculum.status !== "APPROVED" || curriculum.version !== paper.curriculumVersion || curriculum.campusId !== record.campusId) issues.push("The curriculum changed or is not approved. Review the paper against the current approved curriculum version.");
    else {
      // SKO-500: outcomes taught on the Teaching Line count as taught.
      const { overlayTeachingLine } = await import("./teaching-progress-service");
      const found = validatePaperApproval(paper, await overlayTeachingLine(db, user.schoolId, curriculum.id, curriculumDataSchema.parse(curriculum.data)));
      // SKO-501: sending for review needs every item ready, not yet approved; approval belongs to the
      // reviewer (in the exam chain, the moderator's signature approves the items).
      const { itemStateFor } = await import("./item-review");
      const allReady = paper.questions.length > 0 && paper.questions.every(question => ["READY_FOR_REVIEW", "APPROVED"].includes(itemStateFor(question)));
      issues.push(...(action === "review" && allReady ? found.filter(issue => !issue.startsWith("Approve every item before approving the paper")) : found));
    }
  }
  return issues;
}

async function revision(db: TxClient, record: StoredRecord, user: AuthUser, action: WorkspaceRevision["action"]) {
  await db.schoolAiRevision.create({ data: { schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, version: record.version, action, title: record.title, status: record.status, data: json(record.data), actorId: user.userId } });
  // Detailed content stays in the scoped revision. General audit logs contain no answer keys or document text.
  await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_records", recordId: record.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { action, kind: record.kind, version: record.version, status: record.status, campusId: record.campusId } } });
}

export async function listWorkspaceRecords(user: AuthUser, filters: { kind?: WorkspaceKind; status?: WorkspaceStatus; limit?: number; cursor?: string; campusId?: string; activeOnly?: boolean } = {}): Promise<{ records: AiWorkspaceRecord[]; nextCursor?: string }> {
  return withContext(user, async () => {
    try {
      const permissions = await loadWorkspacePermissionSnapshot(user);
      await assertSchoolAiAccess(user, "view", permissions);
      const kinds = allowedWorkspaceKinds(user);
      if (filters.kind && !kinds.includes(filters.kind)) throw new SchoolAiError("This workspace type is outside your role.", 403);
      if (filters.campusId) {
        if (user.role !== "SUPER_ADMIN" && filters.campusId !== user.campusId) throw new SchoolAiError("This campus is outside your scope.", 403);
        const campus = await prisma.campus.findFirst({ where: { id: filters.campusId, schoolId: user.schoolId, archivedAt: null }, select: { id: true } });
        if (!campus) throw new SchoolAiError("This campus is unavailable.", 403);
      }
      const limit = Math.min(100, Math.max(1, filters.limit ?? 100));
      const subjects = user.role === "TEACHER" ? await getAssignedWorkspaceSubjects(user) : [];
      const where: Prisma.SchoolAiRecordWhereInput = {
        schoolId: user.schoolId,
        kind: filters.kind ?? { in: kinds },
        ...(filters.status ? { status: filters.status } : filters.activeOnly ? { status: { not: "ARCHIVED" } } : {}),
        ...(filters.campusId ? { campusId: filters.campusId } : user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}),
        ...(!isSchoolAiManager(user) ? { createdById: user.userId } : {}),
      };
      if (user.role === "TEACHER") {
        delete where.createdById;
        where.subjectId = { in: subjects.map((subject) => subject.id) };
        where.OR = [{ createdById: user.userId }, { kind: { in: ["SOURCE", "CURRICULUM"] }, status: "APPROVED" }];
      }
      if (filters.cursor) {
        await scopedRecord(user, filters.cursor, "read", prisma, permissions); // Cursors cannot probe another tenant's record.
      }
      const rows = await prisma.schoolAiRecord.findMany({ where, take: limit + 1, ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}), orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const page = rows.slice(0, limit);
      const records: AiWorkspaceRecord[] = [];
      for (const row of page) {
        if (!canAccessWorkspaceRecord(user, row, "read", subjects)) continue;
        try { await assertWorkspaceDomainPermission(user, row.kind as WorkspaceKind, dataOf(row), "view", permissions); await assertKnowledgeEvidenceRead(user,row.kind,row.campusId,dataOf(row),prisma,permissions); records.push(publicRecord(row)); }
        catch (error) { if (!(error instanceof Error && "status" in error && error.status === 403)) throw error; }
      }
      return { records, ...(rows.length > limit && page.length ? { nextCursor: page[page.length - 1].id } : {}) };
    } catch (error) { return translateDatabaseError(error); }
  });
}

export async function getWorkspaceRecord(user: AuthUser, id: string): Promise<AiWorkspaceRecord> {
  return withContext(user, async () => {
    try {
      const permissions = await loadWorkspacePermissionSnapshot(user);
      await assertSchoolAiAccess(user, "view", permissions);
      return publicRecord(await scopedRecord(user, id, "read", prisma, permissions));
    }
    catch (error) { return translateDatabaseError(error); }
  });
}

/** Internal composition point: use the caller's transaction and preloaded permissions. */
export async function getWorkspaceRecordInTransaction(user: AuthUser, id: string, tx: TxClient, permissions: WorkspacePermissionSnapshot): Promise<AiWorkspaceRecord> {
  await assertSchoolAiAccess(user, "view", permissions);
  return publicRecord(await scopedRecord(user, id, "read", tx, permissions));
}

/** Intake uses this before expensive extraction; key ownership is always the authenticated actor. */
export async function findWorkspaceCreateByKey(user: AuthUser, key: string, expected?: { kind: WorkspaceKind; campusId?: string | null; idempotencyFingerprint: string }): Promise<AiWorkspaceRecord | null> {
  return withContext(user, async () => {
    try {
      const permissions = await loadWorkspacePermissionSnapshot(user);
      await assertSchoolAiAccess(user, "add", permissions);
      if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new SchoolAiError("Invalid idempotency key.");
      const expectedCampus = expected ? await resolveWorkspaceCampus(user, expected.campusId) : undefined;
      if (expected && !allowedWorkspaceKinds(user).includes(expected.kind)) throw new SchoolAiError("This workspace type is outside your role.", 403);
      const record = await prisma.schoolAiRecord.findFirst({ where: { schoolId: user.schoolId, createdById: user.userId, idempotencyKey: key } });
      if (!record) return null;
      if (expected && record.requestHash !== workspaceRequestHash({ fingerprint: expected.idempotencyFingerprint, kind: expected.kind, campusId: expectedCampus })) throw new SchoolAiError("This idempotency key was already used for a different request.", 409);
      return publicRecord(await scopedRecord(user, record.id, "read", prisma, permissions));
    } catch (error) { return translateDatabaseError(error); }
  });
}

export async function createWorkspaceRecord(user: AuthUser, rawInput: WorkspaceCreateInput, options: {
  trustedSourceMetadata?: TrustedSourceMetadata;
  idempotencyFingerprint?: string;
  /** Internal composition: atomically create a generated package with its receipt. */
  transactionClient?: TxClient;
  /** Database-only extension; may rerun after a rolled-back serialization conflict, never on a committed replay. */
  onCreate?: (tx: TxClient, record: AiWorkspaceRecord) => Promise<unknown>;
} = {}): Promise<AiWorkspaceRecord> {
  const create = async () => {
    try {
      const db = options.transactionClient ?? prisma;
      const permissions = await loadWorkspacePermissionSnapshot(user, db);
      await assertSchoolAiAccess(user, "add", permissions);
      const input = createWorkspaceSchema.parse(rawInput);
      const campusId = await resolveWorkspaceCampus(user, input.campusId, db);
      const preparedData = input.kind === "SOURCE" ? protectSourceMetadata(input.data, undefined, options.trustedSourceMetadata) : input.data;
      const parsed = parseWorkspaceData(input.kind, preparedData);
      const data = input.kind === "PAPER" ? preparePaperWrite(user, parsed) : parsed;
      await assertWorkspaceDomainPermission(user, input.kind, data, "add", permissions);
      const hashData = { ...data };
      if (input.kind === "SOURCE") for (const field of TRUSTED_SOURCE_FIELDS) delete hashData[field];
      const requestHash = workspaceRequestHash(options.idempotencyFingerprint ? { fingerprint: options.idempotencyFingerprint, kind: input.kind, campusId } : { kind: input.kind, title: input.title, campusId, data: hashData });
      const existing = async (db: TxClient) => {
        const previous = await db.schoolAiRecord.findFirst({ where: { schoolId: user.schoolId, createdById: user.userId, idempotencyKey: input.idempotencyKey } });
        if (!previous) return null;
        if (previous.requestHash !== requestHash) throw new SchoolAiError("This idempotency key was already used for different content. Use a new key for a new draft.", 409);
        return publicRecord(await scopedRecord(user, previous.id, "read", db, permissions));
      };
      const replay = await existing(db);
      if (replay) return replay;
      try {
        const save = async (tx: TxClient) => {
          const replayInside = await existing(tx);
          if (replayInside) return replayInside;
          const subject = await assertWorkspaceSubject(user, campusId, data, tx);
          await validateReferences(user, input.kind, campusId, data, tx, permissions);
          const record = await tx.schoolAiRecord.create({ data: { schoolId: user.schoolId, campusId, kind: input.kind, title: input.title, data: json(data), ...subject, createdById: user.userId, updatedById: user.userId, idempotencyKey: input.idempotencyKey, requestHash } });
          if (options.onCreate) await options.onCreate(tx, publicRecord(record));
          await revision(tx, record, user, "CREATE");
          await linkSlotIfNamed(user, record, tx, "create");
          return publicRecord(record);
        };
        return await (options.transactionClient ? save(options.transactionClient) : transaction(user, save));
      } catch (error) {
        // The outer owner must retry a rolled-back transaction in its entirety.
        if (options.transactionClient) throw error;
        if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
          const replayAfterRace = await existing(prisma);
          if (replayAfterRace) return replayAfterRace;
        }
        throw error;
      }
    } catch (error) {
      if (options.transactionClient) throw error;
      return translateDatabaseError(error);
    }
  };
  return options.transactionClient ? create() : withContext(user, create);
}

/** Reuses the same version/approval boundary inside a larger atomic domain transaction. */
export async function updateWorkspaceRecordInTransaction(user: AuthUser, id: string, rawInput: WorkspaceUpdateInput, tx: TxClient, snapshot?: WorkspacePermissionSnapshot, options: { asDepartmentHead?: boolean } = {}): Promise<AiWorkspaceRecord> {
  const permissions = snapshot ?? await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  const input = updateWorkspaceSchema.parse(rawInput);
  // SKO-500: a head of department approves a member's syllabus without owning or teaching it.
  const current = options.asDepartmentHead ? await departmentHeadRecord(user, id, input, tx) : await scopedRecord(user, id, "write", tx, permissions);
  const status = nextWorkspaceStatus({ version: current.version, status: current.status as WorkspaceStatus }, input);
  const action = input.action;
  let authority: ApprovalAuthority | null = null;
  if (action === "approve") {
    const policy = await resolveScopeDeliveryPolicy(user, current.campusId, tx);
    authority = await assertMayApprove(user, current, policy, tx);               // R2.3 (SKO-500: exam-chain kinds by `mayApprove`)
    assertApprovalSeparation(user, current, policy);                             // R2.4: may this actor approve *this* version?
  }
  // SKO-500: a chain seat (classroom tier, head of department) approves with authoring access; the
  // exams-module permission below still applies. Managers keep the edit requirement.
  const chainSeat = authority === "CLASSROOM_TIER" || authority === "HEAD_OF_DEPARTMENT";
  await assertSchoolAiAccess(user, action === "archive" ? "delete" : chainSeat ? "add" : action === "approve" || current.createdById !== user.userId ? "edit" : "add", permissions);
  const prepared = current.kind === "SOURCE" && input.data ? protectSourceMetadata(input.data, dataOf(current))
    // SKO-414: lesson-plan ownership, AI origin, groups and delivery cannot be forged through a generic save.
    : current.kind === "CURRICULUM" && input.data ? protectLessonPlansFor(user, input.data, dataOf(current))
    : input.data ?? dataOf(current);
  const parsed = parseWorkspaceData(current.kind as WorkspaceKind, prepared);
  const data = current.kind === "PAPER" && input.data ? preparePaperWrite(user, parsed, dataOf(current)) : parsed;
  await assertWorkspaceDomainPermission(user, current.kind as WorkspaceKind, data, "edit", permissions);
  const subject = options.asDepartmentHead ? { subjectId: current.subjectId, classId: current.classId } : await assertWorkspaceSubject(user, current.campusId, data, tx);
  await validateReferences(user, current.kind as WorkspaceKind, current.campusId, data, tx, permissions);
  if (action === "approve" || action === "review") {
    const issues = await approvalIssues(user, current, tx, permissions, action === "review" ? "review" : "approve");
    if (issues.length) throw new SchoolAiError(issues.slice(0, 15).join(" "), 422);
  }
  const updated = await tx.schoolAiRecord.updateMany({
    where: { id, schoolId: user.schoolId, campusId: current.campusId, version: input.version, status: current.status },
    data: { title: input.title ?? current.title, data: json(data), ...subject, status, version: { increment: 1 }, updatedById: user.userId, approvedById: action === "approve" ? user.userId : null, approvedAt: action === "approve" ? new Date() : null },
  });
  if (updated.count !== 1) throw new SchoolAiError("This item changed during review. Reload and review the current version.", 409);
  const record = await tx.schoolAiRecord.findFirstOrThrow({ where: { id, schoolId: user.schoolId } });
  await revision(tx, record, user, action.toUpperCase() as WorkspaceRevision["action"]);
  if (!options.asDepartmentHead) await linkSlotIfNamed(user, record, tx, action);
  if (action === "approve" && current.kind === "CURRICULUM") await approveBundledSource(user, data, current.campusId, tx, permissions, options);
  return publicRecord(record);
}

/** SKO-500: a PAPER that names a paper slot keeps the slot pointing at it (same transaction). */
async function linkSlotIfNamed(user: AuthUser, record: StoredRecord, tx: TxClient, action: string) {
  if (record.kind !== "PAPER") return;
  const slotId = (record.data as { slotId?: unknown } | null)?.slotId;
  if (typeof slotId !== "string" || !slotId) return;
  const { linkPaperToSlot } = await import("./paper-slot-service");
  await linkPaperToSlot(user, { id: record.id, version: record.version, status: record.status, campusId: record.campusId }, slotId, tx, action);
}

/**
 * SKO-500: one approval, not two. A curriculum drawn from an uploaded syllabus names that SOURCE
 * revision in `approvalBundle`; approving the curriculum approves it in the same transaction, under the
 * same authority. A source edited after the outline was taken is refused rather than approved unseen.
 */
async function approveBundledSource(user: AuthUser, data: Record<string, unknown>, campusId: string | null, tx: TxClient, permissions: WorkspacePermissionSnapshot, options: { asDepartmentHead?: boolean }) {
  const bundle = curriculumDataSchema.parse(data).approvalBundle;
  if (!bundle) return;
  const source = await tx.schoolAiRecord.findFirst({ where: { id: bundle.sourceRecordId, schoolId: user.schoolId, campusId, kind: "SOURCE" }, select: { version: true, status: true } });
  if (!source) throw new SchoolAiError("The syllabus this curriculum cites is no longer available.", 409, "BUNDLE_SOURCE_MISSING");
  if (source.status === "APPROVED") return;
  if (source.version !== bundle.sourceVersion) throw new SchoolAiError("The syllabus file changed after its outline was taken. Review the syllabus, then approve again.", 409, "BUNDLE_SOURCE_CHANGED");
  await updateWorkspaceRecordInTransaction(user, bundle.sourceRecordId, { version: source.version, action: "approve" }, tx, permissions, options);
}

/** SKO-500 (§14.1): who may approve. Exam-chain kinds go through `mayApprove`; every other kind keeps the manager rule. */
async function assertMayApprove(user: AuthUser, current: StoredRecord, policy: ResolvedDeliveryPolicy, tx: TxClient): Promise<ApprovalAuthority> {
  if (!(EXAM_CHAIN_APPROVAL_KINDS as readonly string[]).includes(current.kind)) { assertApprovalRole(user); return "MANAGER"; }
  const subjects = user.role === "TEACHER" ? await getAssignedWorkspaceSubjects(user, tx) : [];
  const data = dataOf(current);
  const paper = current.kind === "PAPER" ? paperDataSchema.safeParse(data) : null;
  const decision = mayApprove(
    { userId: user.userId, role: user.role, teachesRecordScope: subjects.some(subject => subject.id === current.subjectId && subject.classId === current.classId), headsAuthorDepartment: await headsAuthorDepartment(tx, user.schoolId, user.userId, current.createdById) },
    { kind: current.kind, createdById: current.createdById, ...(paper?.success ? { examType: paper.data.examType, totalMarks: paper.data.blueprint.totalMarks } : {}) },
    examChainPolicy(policy.policy),
  );
  // SKO-501 (authority narrowing, plan 4.8): a term paper (mid-term, final) is approved by the academic lead
  // only — the principal, or a campus admin while the campus has no principal. Other kinds keep the manager rule.
  if (decision.allowed && decision.as === "MANAGER" && current.kind === "PAPER" && paper?.success && (paper.data.examType === "MID_TERM" || paper.data.examType === "FINAL") && !(await canLeadAcademics(user, current.campusId))) {
    throw new SchoolAiError("A term paper is approved by the principal or academic lead, after moderation.", 403, "APPROVAL_TERM_PAPER_NEEDS_SEAL_AUTHORITY");
  }
  if (decision.allowed) return decision.as;
  const messages: Record<typeof decision.reason, string> = {
    NOT_AN_APPROVER: "Only your head of department or an academic lead can approve this saved version.",
    TERM_PAPER_NEEDS_SEAL_AUTHORITY: "A term paper is approved by the principal or academic lead, after moderation.",
    ABOVE_CLASSROOM_CEILING: "This paper is above the classroom marks limit, so your head of department approves it.",
    TIER_DISABLED: "Your school asks a head of department to approve this. Send it for review.",
    OUT_OF_SCOPE: "You can approve only for the classes and subjects you teach.",
  };
  throw new SchoolAiError(messages[decision.reason], 403, `APPROVAL_${decision.reason}`);
}

/** The record a head of department may approve: a member's syllabus or syllabus source, in the head's campus. */
async function departmentHeadRecord(user: AuthUser, id: string, input: { action?: string }, tx: TxClient): Promise<StoredRecord> {
  workspaceIdSchema.parse(id);
  const record = await tx.schoolAiRecord.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) } });
  if (!record || input.action !== "approve" || !["SOURCE", "CURRICULUM"].includes(record.kind) || !(await headsAuthorDepartment(tx, user.schoolId, user.userId, record.createdById))) throw new SchoolAiError("Workspace item not found or no longer accessible.", 404);
  return record;
}

export async function updateWorkspaceRecord(user: AuthUser, id: string, rawInput: WorkspaceUpdateInput): Promise<AiWorkspaceRecord> {
  const record = await withContext(user, async () => {
    try { return await transaction(user, tx => updateWorkspaceRecordInTransaction(user, id, rawInput, tx)); }
    catch (error) { return translateDatabaseError(error); }
  });
  // SKO-500: after commit, a requested paper sent for review tells its moderator.
  const slotId = record.kind === "PAPER" ? (record.data as { slotId?: unknown }).slotId : undefined;
  if (typeof slotId === "string" && (rawInput as { action?: string }).action === "review") {
    const { notifyPaperSubmitted } = await import("./paper-slot-service");
    await notifyPaperSubmitted(user, { id: record.id, campusId: record.campusId }, slotId).catch(error => console.error("[paper-slot] submit notice failed", error));
  }
  return record;
}

export async function listWorkspaceRevisionPage(user: AuthUser, id: string, options: { version?: number; beforeVersion?: number; limit?: number } = {}): Promise<WorkspaceRevisionPage> {
  return withContext(user, async () => {
    try {
      const permissions = await loadWorkspacePermissionSnapshot(user);
      await assertSchoolAiAccess(user, "view", permissions);
      const record = await scopedRecord(user, id, "read", prisma, permissions);
      // Shared approved sources/curricula do not disclose other authors' earlier unpublished drafts.
      const ownOrManager = isSchoolAiManager(user) || record.createdById === user.userId;
      const limit = Math.max(1, Math.min(100, options.limit ?? 20));
      const rows = await prisma.schoolAiRevision.findMany({ where: { recordId: id, schoolId: user.schoolId, campusId: record.campusId, ...(!ownOrManager ? { status: "APPROVED" } : {}), ...(options.version ? { version: options.version } : options.beforeVersion ? { version: { lt: options.beforeVersion } } : {}) }, orderBy: { version: "desc" }, take: limit + 1 });
      const page = rows.slice(0, limit);
      const subjects = user.role === "TEACHER" ? await getAssignedWorkspaceSubjects(user) : [];
      const scoped = page.filter((row) => user.role !== "TEACHER" || subjects.some((subject) => {
        const data = row.data as Record<string, unknown>;
        return subject.id === data.subjectId && subject.classId === data.classId && subject.campusId === row.campusId;
      }));
      const permitted: typeof scoped = [];
      for (const row of scoped) {
        try { await assertWorkspaceDomainPermission(user, record.kind as WorkspaceKind, row.data as Record<string, unknown>, "view", permissions); await assertKnowledgeEvidenceRead(user,record.kind,row.campusId,row.data as Record<string,unknown>,prisma,permissions); permitted.push(row); }
        catch (error) { if (!(error instanceof Error && "status" in error && error.status === 403)) throw error; }
      }
      const actors = await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(permitted.map(row => row.actorId))] } }, select: { id: true, fullName: true } });
      const names = new Map(actors.map(actor => [actor.id, actor.fullName]));
      return { revisions: permitted.map((row) => ({ id: row.id, recordId: row.recordId, version: row.version, action: row.action as WorkspaceRevision["action"], title: row.title, status: row.status as WorkspaceStatus, data: row.data as Record<string, unknown>, actorId: row.actorId, actorName: names.get(row.actorId) || null, createdAt: row.createdAt.toISOString() })), nextVersion: rows.length > limit && page.length ? page[page.length - 1].version : null };
    } catch (error) { return translateDatabaseError(error); }
  });
}

export async function listWorkspaceRevisions(user: AuthUser, id: string): Promise<WorkspaceRevisionView[]> {
  return (await listWorkspaceRevisionPage(user, id, { limit: 100 })).revisions;
}

export async function getWorkspaceHistoryAccess(user: AuthUser, id: string): Promise<WorkspaceHistoryAccess> {
  return withContext(user, async () => {
    const permissions = await loadWorkspacePermissionSnapshot(user);
    await assertSchoolAiAccess(user, "view", permissions);
    const record = await scopedRecord(user, id, "read", prisma, permissions);
    const subjects = user.role === "TEACHER" ? await getAssignedWorkspaceSubjects(user) : [];
    if (record.status === "ARCHIVED" || !canAccessWorkspaceRecord(user, record, "write", subjects)) return { canRestore: false, canApprove: false };
    const allowed = async (check: () => Promise<void>) => { try { await check(); return true; } catch (error) { if (error instanceof Error && "status" in error && error.status === 403) return false; throw error; } };
    const domain = await allowed(() => assertWorkspaceDomainPermission(user, record.kind as WorkspaceKind, dataOf(record), "edit", permissions));
    const canRestore = domain && await allowed(() => assertSchoolAiAccess(user, record.createdById === user.userId ? "add" : "edit", permissions));
    let authority: ApprovalAuthority | null = null;
    const mayApproveIt = domain && record.status !== "APPROVED" && await allowed(async () => { authority = await assertMayApprove(user, record, await resolveScopeDeliveryPolicy(user, record.campusId), prisma); });
    const canApprove = mayApproveIt && await allowed(() => assertSchoolAiAccess(user, authority === "CLASSROOM_TIER" || authority === "HEAD_OF_DEPARTMENT" ? "add" : "edit", permissions));
    return { canRestore, canApprove };
  });
}

export async function getApprovedWorkspaceRevision(user: AuthUser, id: string, version: number): Promise<AiWorkspaceRecord> {
  return withContext(user, async () => {
    try {
      const permissions = await loadWorkspacePermissionSnapshot(user);
      await assertSchoolAiAccess(user, "view", permissions);
      const current = await scopedRecord(user, id, "read", prisma, permissions);
      const saved = await prisma.schoolAiRevision.findFirst({ where: { recordId: id, schoolId: user.schoolId, campusId: current.campusId, version, status: "APPROVED" } });
      if (!saved) throw new SchoolAiError("Approved workspace version not found.", 404);
      await assertWorkspaceDomainPermission(user, current.kind as WorkspaceKind, saved.data as Record<string, unknown>, "view", permissions);
      await assertKnowledgeEvidenceRead(user,current.kind,saved.campusId,saved.data as Record<string,unknown>,prisma,permissions);
      if (user.role === "TEACHER") await assertWorkspaceSubject(user, saved.campusId, saved.data as Record<string, unknown>);
      return { ...publicRecord(current), title: saved.title, version: saved.version, status: "APPROVED", data: saved.data as AiWorkspaceRecord["data"], updatedAt: saved.createdAt.toISOString() };
    } catch (error) { return translateDatabaseError(error); }
  });
}

function protectLessonPlansFor(user: AuthUser, next: Record<string, unknown>, previous: Record<string, unknown>) {
  try { return protectLessonPlans(next, previous, { userId: user.userId, leader: canManageOperations(user) }) as Record<string, unknown>; }
  catch (error) { throw new SchoolAiError(error instanceof Error ? error.message : "This lesson plan cannot be changed here.", (error as { status?: number }).status ?? 400); }
}
