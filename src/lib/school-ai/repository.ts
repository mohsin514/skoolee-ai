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
import { PaperReviewWriteError, preparePaperContentWrite } from "./item-review";
import { nextWorkspaceStatus, protectSourceMetadata, TRUSTED_SOURCE_FIELDS, workspaceApprovalIssues, type TrustedSourceMetadata } from "./workflows";
import type { AiWorkspaceRecord, WorkspaceCreateInput, WorkspaceKind, WorkspaceRevision, WorkspaceStatus, WorkspaceUpdateInput } from "./types";
import type { WorkspaceHistoryAccess, WorkspaceRevisionPage, WorkspaceRevisionView } from "./revisions";
import { schoolAiTransaction as transaction } from "./transaction";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function dataOf(record: StoredRecord): Record<string, unknown> { return record.data as Record<string, unknown>; }
function preparePaperWrite(user: AuthUser, incoming: Record<string, unknown>, previous?: Record<string, unknown>): Record<string, unknown> {
  try {
    return preparePaperContentWrite(previous ? paperDataSchema.parse(previous) : null, paperDataSchema.parse(incoming), { actorId: user.userId, at: new Date().toISOString() });
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
  if (kind === "PAPER") {
    const paper = paperDataSchema.parse(data);
    const curriculum = await scopedRecord(user, paper.curriculumId, "read", db, permissions);
    if (curriculum.kind !== "CURRICULUM" || curriculum.campusId !== campusId || curriculum.subjectId !== paper.subjectId || curriculum.classId !== paper.classId) throw new SchoolAiError("Choose a curriculum from the same campus, class and subject.", 403);
    if (paper.questions.some(question=>question.figures?.length)) { const {validatePaperFigures}=await import("./paper-figure-service"); await validatePaperFigures(user,paper,campusId,db,permissions); }
    if (paper.questions.some((question) => question.reusedFrom)) {
      const { validatePaperBankProvenance } = await import("./question-bank-service");
      await validatePaperBankProvenance(user, paper, campusId, db, permissions);
    }
  }
  if (kind === "WORKFLOW") {
    for (const id of data.sourceIds as string[]) {
      const source = await scopedRecord(user, id, "read", db, permissions);
      if (source.kind !== "SOURCE" || source.status === "ARCHIVED" || source.campusId !== campusId) throw new SchoolAiError("Workflow evidence must be an accessible source from the same campus.", 403);
    }
  }
}

async function approvalIssues(user: AuthUser, record: StoredRecord, db: TxClient, permissions: WorkspacePermissionSnapshot) {
  const data = parseWorkspaceData(record.kind as WorkspaceKind, dataOf(record));
  const issues = workspaceApprovalIssues(record.kind as WorkspaceKind, data);
  if(record.kind==="POLICY")await validateKnowledgeReferences(user,record.id,record.campusId,data,db,permissions,true);
  if (record.kind === "PAPER") {
    const paper = paperDataSchema.parse(data);
    const curriculum = await scopedRecord(user, paper.curriculumId, "read", db, permissions);
    if (curriculum.kind !== "CURRICULUM" || curriculum.status !== "APPROVED" || curriculum.version !== paper.curriculumVersion || curriculum.campusId !== record.campusId) issues.push("The curriculum changed or is not approved. Review the paper against the current approved curriculum version.");
    else issues.push(...validatePaperApproval(paper, curriculumDataSchema.parse(curriculum.data)));
  }
  return issues;
}

async function revision(db: TxClient, record: StoredRecord, user: AuthUser, action: WorkspaceRevision["action"]) {
  await db.schoolAiRevision.create({ data: { schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, version: record.version, action, title: record.title, status: record.status, data: json(record.data), actorId: user.userId } });
  // Detailed content stays in the scoped revision. General audit logs contain no answer keys or document text.
  await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_records", recordId: record.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { action, kind: record.kind, version: record.version, status: record.status, campusId: record.campusId } } });
}

export async function listWorkspaceRecords(user: AuthUser, filters: { kind?: WorkspaceKind; status?: WorkspaceStatus; limit?: number; cursor?: string } = {}): Promise<{ records: AiWorkspaceRecord[]; nextCursor?: string }> {
  return withContext(user, async () => {
    try {
      const permissions = await loadWorkspacePermissionSnapshot(user);
      await assertSchoolAiAccess(user, "view", permissions);
      const kinds = allowedWorkspaceKinds(user);
      if (filters.kind && !kinds.includes(filters.kind)) throw new SchoolAiError("This workspace type is outside your role.", 403);
      const limit = Math.min(100, Math.max(1, filters.limit ?? 100));
      const subjects = user.role === "TEACHER" ? await getAssignedWorkspaceSubjects(user) : [];
      const where: Prisma.SchoolAiRecordWhereInput = {
        schoolId: user.schoolId,
        kind: filters.kind ?? { in: kinds },
        ...(filters.status ? { status: filters.status } : {}),
        ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}),
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
  /** Database-only extension; may rerun after a rolled-back serialization conflict, never on a committed replay. */
  onCreate?: (tx: TxClient, record: AiWorkspaceRecord) => Promise<unknown>;
} = {}): Promise<AiWorkspaceRecord> {
  return withContext(user, async () => {
    try {
      const permissions = await loadWorkspacePermissionSnapshot(user);
      await assertSchoolAiAccess(user, "add", permissions);
      const input = createWorkspaceSchema.parse(rawInput);
      const campusId = await resolveWorkspaceCampus(user, input.campusId);
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
      const replay = await existing(prisma);
      if (replay) return replay;
      try {
        return await transaction(user, async (tx) => {
          const replayInside = await existing(tx);
          if (replayInside) return replayInside;
          const subject = await assertWorkspaceSubject(user, campusId, data, tx);
          await validateReferences(user, input.kind, campusId, data, tx, permissions);
          const record = await tx.schoolAiRecord.create({ data: { schoolId: user.schoolId, campusId, kind: input.kind, title: input.title, data: json(data), ...subject, createdById: user.userId, updatedById: user.userId, idempotencyKey: input.idempotencyKey, requestHash } });
          if (options.onCreate) await options.onCreate(tx, publicRecord(record));
          await revision(tx, record, user, "CREATE");
          return publicRecord(record);
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
          const replayAfterRace = await existing(prisma);
          if (replayAfterRace) return replayAfterRace;
        }
        throw error;
      }
    } catch (error) { return translateDatabaseError(error); }
  });
}

/** Reuses the same version/approval boundary inside a larger atomic domain transaction. */
export async function updateWorkspaceRecordInTransaction(user: AuthUser, id: string, rawInput: WorkspaceUpdateInput, tx: TxClient, snapshot?: WorkspacePermissionSnapshot): Promise<AiWorkspaceRecord> {
  const permissions = snapshot ?? await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  const input = updateWorkspaceSchema.parse(rawInput);
  const current = await scopedRecord(user, id, "write", tx, permissions);
  const status = nextWorkspaceStatus({ version: current.version, status: current.status as WorkspaceStatus }, input);
  const action = input.action;
  if (action === "approve") {
    assertApprovalRole(user);                                                    // R2.3: may this actor approve at all?
    assertApprovalSeparation(user, current, await resolveScopeDeliveryPolicy(user, current.campusId, tx)); // R2.4: may this actor approve *this* version?
  }
  await assertSchoolAiAccess(user, action === "archive" ? "delete" : action === "approve" || current.createdById !== user.userId ? "edit" : "add", permissions);
  const prepared = current.kind === "SOURCE" && input.data ? protectSourceMetadata(input.data, dataOf(current)) : input.data ?? dataOf(current);
  const parsed = parseWorkspaceData(current.kind as WorkspaceKind, prepared);
  const data = current.kind === "PAPER" && input.data ? preparePaperWrite(user, parsed, dataOf(current)) : parsed;
  await assertWorkspaceDomainPermission(user, current.kind as WorkspaceKind, data, "edit", permissions);
  const subject = await assertWorkspaceSubject(user, current.campusId, data, tx);
  await validateReferences(user, current.kind as WorkspaceKind, current.campusId, data, tx, permissions);
  if (action === "approve" || action === "review") {
    const issues = await approvalIssues(user, current, tx, permissions);
    if (issues.length) throw new SchoolAiError(issues.slice(0, 15).join(" "), 422);
  }
  const updated = await tx.schoolAiRecord.updateMany({
    where: { id, schoolId: user.schoolId, campusId: current.campusId, version: input.version, status: current.status },
    data: { title: input.title ?? current.title, data: json(data), ...subject, status, version: { increment: 1 }, updatedById: user.userId, approvedById: action === "approve" ? user.userId : null, approvedAt: action === "approve" ? new Date() : null },
  });
  if (updated.count !== 1) throw new SchoolAiError("This item changed during review. Reload and review the current version.", 409);
  const record = await tx.schoolAiRecord.findFirstOrThrow({ where: { id, schoolId: user.schoolId } });
  await revision(tx, record, user, action.toUpperCase() as WorkspaceRevision["action"]);
  return publicRecord(record);
}

export async function updateWorkspaceRecord(user: AuthUser, id: string, rawInput: WorkspaceUpdateInput): Promise<AiWorkspaceRecord> {
  return withContext(user, async () => {
    try { return await transaction(user, tx => updateWorkspaceRecordInTransaction(user, id, rawInput, tx)); }
    catch (error) { return translateDatabaseError(error); }
  });
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
    const canApprove = domain && isSchoolAiManager(user) && await allowed(() => assertSchoolAiAccess(user, "edit", permissions));
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
