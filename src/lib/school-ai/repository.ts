import { createHash } from "node:crypto";
import { Prisma, type SchoolAiRecord as StoredRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { z } from "zod";
import {
  SchoolAiError, allowedWorkspaceKinds, assertApprovalRole, assertSchoolAiAccess, assertSchoolAiRole,
  assertWorkspaceDomainPermission, assertWorkspaceSubject, canAccessWorkspaceRecord,
  getAssignedWorkspaceSubjects, isSchoolAiManager, resolveWorkspaceCampus, type WorkspacePermissionSnapshot,
  loadWorkspacePermissionSnapshot,
} from "./access";
import { createWorkspaceSchema, parseWorkspaceData, updateWorkspaceSchema, workspaceIdSchema } from "./schemas";
import { curriculumDataSchema, paperDataSchema, validatePaperApproval } from "./assessment";
import { nextWorkspaceStatus, protectSourceMetadata, TRUSTED_SOURCE_FIELDS, workspaceApprovalIssues, type TrustedSourceMetadata } from "./workflows";
import type { AiWorkspaceRecord, WorkspaceCreateInput, WorkspaceKind, WorkspaceRevision, WorkspaceStatus, WorkspaceUpdateInput } from "./types";
import type { WorkspaceHistoryAccess, WorkspaceRevisionPage, WorkspaceRevisionView } from "./revisions";
import { schoolAiTransaction as transaction } from "./transaction";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function dataOf(record: StoredRecord): Record<string, unknown> { return record.data as Record<string, unknown>; }
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
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function workspaceRequestHash(value: unknown) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }

async function scopedRecord(user: AuthUser, id: string, mode: "read" | "write", db: TxClient = prisma, permissions?: WorkspacePermissionSnapshot): Promise<StoredRecord> {
  workspaceIdSchema.parse(id);
  const record = await db.schoolAiRecord.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) } });
  const subjects = user.role === "TEACHER" ? await getAssignedWorkspaceSubjects(user, db) : [];
  if (!record || !canAccessWorkspaceRecord(user, record, mode, subjects)) throw new SchoolAiError("Workspace item not found or no longer accessible.", 404);
  await assertWorkspaceDomainPermission(user, record.kind as WorkspaceKind, dataOf(record), "view", permissions);
  return record;
}

async function validateReferences(user: AuthUser, kind: WorkspaceKind, campusId: string | null, data: Record<string, unknown>, db: TxClient, permissions: WorkspacePermissionSnapshot) {
  if (kind === "PAPER") {
    const paper = paperDataSchema.parse(data);
    const curriculum = await scopedRecord(user, paper.curriculumId, "read", db, permissions);
    if (curriculum.kind !== "CURRICULUM" || curriculum.campusId !== campusId || curriculum.subjectId !== paper.subjectId || curriculum.classId !== paper.classId) throw new SchoolAiError("Choose a curriculum from the same campus, class and subject.", 403);
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
        try { await assertWorkspaceDomainPermission(user, row.kind as WorkspaceKind, dataOf(row), "view", permissions); records.push(publicRecord(row)); }
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
      const data = parseWorkspaceData(input.kind, preparedData);
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
  if (action === "approve") assertApprovalRole(user);
  await assertSchoolAiAccess(user, action === "archive" ? "delete" : action === "approve" || current.createdById !== user.userId ? "edit" : "add", permissions);
  const prepared = current.kind === "SOURCE" && input.data ? protectSourceMetadata(input.data, dataOf(current)) : input.data ?? dataOf(current);
  const data = parseWorkspaceData(current.kind as WorkspaceKind, prepared);
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
        try { await assertWorkspaceDomainPermission(user, record.kind as WorkspaceKind, row.data as Record<string, unknown>, "view", permissions); permitted.push(row); }
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
      if (user.role === "TEACHER") await assertWorkspaceSubject(user, saved.campusId, saved.data as Record<string, unknown>);
      return { ...publicRecord(current), title: saved.title, version: saved.version, status: "APPROVED", data: saved.data as AiWorkspaceRecord["data"], updatedAt: saved.createdAt.toISOString() };
    } catch (error) { return translateDatabaseError(error); }
  });
}
