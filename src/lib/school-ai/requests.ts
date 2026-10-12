import { randomUUID } from "node:crypto";
import { Prisma, type SchoolAiRequest } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { assertSchoolAiAccess, assertSchoolAiRole, assertWorkspaceSubject, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError, type WorkspacePermissionSnapshot } from "./access";
import { getWorkspaceRecord, getWorkspaceRecordInTransaction, workspaceRequestHash } from "./repository";
import type { AiWorkspaceRecord } from "./types";
import type { AssistantTurn } from "./assistant-context";
import { schoolAiTransaction } from "./transaction";
import { assertConversationActor, loadPrivateConversation, privateConversationContext, privateExchange } from "./conversation-service";

export const SCHOOL_AI_REQUEST_LEASE_MS = 180000;
const MAX_ATTEMPTS = 10;
const requestSchema = z.strictObject({
  key: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  fingerprint: z.string().min(1).max(256),
  campusId: z.string().min(1).max(128).nullable().optional(),
  subjectId: z.string().min(1).max(128).optional(),
  classId: z.string().min(1).max(128).optional(),
  retryFailed: z.boolean().optional(),
  conversationId: z.string().min(1).max(128).optional(),
  expectedConversationVersion: z.number().int().nonnegative().optional(),
  userMessage: z.string().trim().min(1).max(8000).optional(),
  requestLanguage: z.enum(["en", "ar", "ur"]).optional(),
});
const resultSchema = z.strictObject({
  reply: z.string().trim().min(1).max(8000),
  recordId: z.string().min(1).max(128).optional(),
  contextRecordIds: z.array(z.string().min(1).max(128)).max(12).default([]),
  contextVersions: z.record(z.string().min(1).max(128), z.number().int().positive()).refine(value => Object.keys(value).length <= 12).optional(),
});
export type BeginSchoolAiRequest = z.infer<typeof requestSchema>;
export type SchoolAiRequestOutput = z.input<typeof resultSchema>;
/** Server-only handle. Never return a claim token or its permission snapshot to a client. */
export interface SchoolAiRequestClaim {
  id: string;
  token: string;
  schoolId: string;
  campusId: string | null;
  actorId: string;
  actorRole: AuthUser["role"];
  subjectId: string | null;
  classId: string | null;
  requestHash: string;
  permissions: WorkspacePermissionSnapshot;
  conversationId?: string;
  conversationVersion?: number;
  history?: AssistantTurn[];
}
export type SchoolAiRequestStart = { state: "CLAIMED"; claim: SchoolAiRequestClaim } | { state: "COMPLETED"; reply: string; record?: AiWorkspaceRecord };

function withContext<T>(user: AuthUser, fn: () => Promise<T>) {
  assertSchoolAiRole(user);
  return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role, unscoped: false }, fn);
}
function translate(error: unknown): never {
  if (error instanceof z.ZodError) throw new SchoolAiError("The assistant request or saved response is invalid.", 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) throw new SchoolAiError("Apply the school AI request receipt migration before using the assistant.", 503);
  throw error;
}
function checkClaim(user: AuthUser, claim: SchoolAiRequestClaim) {
  assertSchoolAiRole(user);
  if (claim.schoolId !== user.schoolId || claim.actorId !== user.userId || claim.actorRole !== user.role || (user.role !== "SUPER_ADMIN" && claim.campusId !== user.campusId)) throw new SchoolAiError("This assistant request belongs to a different staff scope.", 403);
}
function claimWhere(user: AuthUser, claim: SchoolAiRequestClaim) {
  return { id: claim.id, schoolId: user.schoolId, actorId: user.userId, actorRole: user.role, campusId: claim.campusId, subjectId: claim.subjectId, classId: claim.classId, feature: "ASSISTANT", requestHash: claim.requestHash, claimToken: claim.token, status: "PENDING" };
}

/** Claims are short database operations; no transaction remains open during a provider call. */
export async function beginSchoolAiRequest(user: AuthUser, raw: BeginSchoolAiRequest): Promise<SchoolAiRequestStart> {
  return withContext(user, async () => {
    try {
      const input = requestSchema.parse(raw);
      if (input.conversationId) return await beginPrivateRequest(user, input);
      const permissions = await loadWorkspacePermissionSnapshot(user);
      await assertSchoolAiAccess(user, "add", permissions);
      await assertSchoolAiAccess(user, "view", permissions);
      await assertSchoolOperational(user.schoolId);
      const campusId = await resolveWorkspaceCampus(user, input.campusId);
      const subject = await assertWorkspaceSubject(user, campusId, { subjectId: input.subjectId, classId: input.classId });
      const requestHash = workspaceRequestHash({ feature: "ASSISTANT", fingerprint: input.fingerprint, campusId, ...subject, role: user.role });
      const where = { schoolId: user.schoolId, actorId: user.userId, feature: "ASSISTANT", idempotencyKey: input.key };
      const handle = (row: SchoolAiRequest): SchoolAiRequestClaim => ({ id: row.id, token: row.claimToken!, schoolId: user.schoolId, campusId, actorId: user.userId, actorRole: user.role, ...subject, requestHash, permissions });
      const existing = async (row: SchoolAiRequest): Promise<SchoolAiRequestStart> => {
        if (row.requestHash !== requestHash) throw new SchoolAiError("This request key was already used for different content or access scope.", 409);
        if (row.status === "COMPLETED") {
          const output = resultSchema.parse({ reply: row.reply, ...(row.recordId ? { recordId: row.recordId } : {}), contextRecordIds: row.contextRecordIds });
          // Replaying a reply must not restore information after access to its evidence was removed.
          for (const id of output.contextRecordIds) await getWorkspaceRecord(user, id);
          const record = output.recordId ? await getWorkspaceRecord(user, output.recordId) : undefined;
          return { state: "COMPLETED", reply: output.reply, ...(record ? { record } : {}) };
        }
        const now = new Date();
        if (row.status === "PENDING" && row.leaseExpiresAt && row.leaseExpiresAt > now) throw new SchoolAiError("This assistant request is still processing. Wait before retrying the same request.", 409);
        if (!input.retryFailed) throw new SchoolAiError("This assistant request did not complete. Explicitly retry it to start a new attempt.", 409);
        if (row.attempts >= MAX_ATTEMPTS) throw new SchoolAiError("This request reached its retry limit. Start a new request.", 409);
        const token = randomUUID(), leaseExpiresAt = new Date(now.getTime() + SCHOOL_AI_REQUEST_LEASE_MS);
        const claimed = await prisma.schoolAiRequest.updateMany({
          where: { ...where, id: row.id, requestHash, status: row.status, claimToken: row.claimToken, attempts: row.attempts, leaseExpiresAt: row.leaseExpiresAt },
          data: { status: "PENDING", claimToken: token, leaseExpiresAt, attempts: { increment: 1 }, reply: null, recordId: null, contextRecordIds: [], completedAt: null },
        });
        if (claimed.count !== 1) throw new SchoolAiError("Another attempt claimed this request. Wait before retrying.", 409);
        return { state: "CLAIMED", claim: handle({ ...row, claimToken: token }) };
      };
      const row = await prisma.schoolAiRequest.findFirst({ where });
      if (row) return await existing(row);
      try {
        const created = await prisma.schoolAiRequest.create({ data: { ...where, actorRole: user.role, campusId, ...subject, requestHash, claimToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + SCHOOL_AI_REQUEST_LEASE_MS) } });
        return { state: "CLAIMED", claim: handle(created) };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const raced = await prisma.schoolAiRequest.findFirst({ where });
          if (raced) return await existing(raced);
          throw new SchoolAiError("This request key was already used in a different access scope.", 409);
        }
        throw error;
      }
    } catch (error) { return translate(error); }
  });
}

/** Call only inside the same transaction that saves/charges the generated answer. */
export async function completeSchoolAiRequest(user: AuthUser, claim: SchoolAiRequestClaim, raw: SchoolAiRequestOutput, tx: TxClient): Promise<void> {
  try {
    checkClaim(user, claim);
    const output = resultSchema.parse(raw);
    claim.permissions = await assertConversationActor(user, tx, "add");
    if (claim.conversationId) {
      const conversation = await loadPrivateConversation(user, claim.conversationId, tx);
      if (conversation.version !== claim.conversationVersion) throw new SchoolAiError("This conversation advanced while preparing the reply. Continue from its latest saved version.", 409);
    }
    await assertSchoolAiAccess(user, "add", claim.permissions);
    await assertSchoolAiAccess(user, "view", claim.permissions);
    await assertWorkspaceSubject(user, claim.campusId, { subjectId: claim.subjectId, classId: claim.classId }, tx);
    const contextIds = [...new Set(output.contextRecordIds)];
    if (output.contextVersions && (Object.keys(output.contextVersions).length !== contextIds.length || contextIds.some(id => output.contextVersions![id] === undefined))) throw new SchoolAiError("Every context item must name its reviewed version.", 400);
    for (const id of contextIds) {
      const record = await getWorkspaceRecordInTransaction(user, id, tx, claim.permissions);
      if (record.campusId !== claim.campusId && record.campusId !== null) throw new SchoolAiError("Assistant evidence belongs to a different campus.", 403);
      if (output.contextVersions && (record.version !== output.contextVersions[id] || record.status !== "APPROVED")) throw new SchoolAiError("The approved context changed while the assistant was preparing an answer. Review the current information and retry.", 409);
    }
    if (output.recordId) {
      const record = await tx.schoolAiRecord.findFirst({ where: { id: output.recordId, schoolId: user.schoolId, campusId: claim.campusId, createdById: user.userId, kind: "WORKFLOW", subjectId: claim.subjectId, classId: claim.classId } });
      if (!record) throw new SchoolAiError("The assistant draft does not belong to this request's staff scope.", 403);
      await getWorkspaceRecordInTransaction(user, record.id, tx, claim.permissions);
    }
    const updated = await tx.schoolAiRequest.updateMany({
      where: { ...claimWhere(user, claim), leaseExpiresAt: { gt: new Date() } },
      data: { status: "COMPLETED", reply: output.reply, recordId: output.recordId ?? null, contextRecordIds: contextIds, contextVersions: output.contextVersions ?? {}, claimToken: null, leaseExpiresAt: null, completedAt: new Date() },
    });
    if (updated.count !== 1) throw new SchoolAiError("This assistant attempt expired or was superseded. Retry the request before saving its answer.", 409);
  } catch (error) { return translate(error); }
}

/** A late failed attempt cannot overwrite a newer claim or a committed answer. */
export async function failSchoolAiRequest(user: AuthUser, claim: SchoolAiRequestClaim): Promise<void> {
  checkClaim(user, claim);
  return withContext(user, async () => {
    try {
      await prisma.schoolAiRequest.updateMany({ where: claimWhere(user, claim), data: { status: "FAILED", claimToken: null, leaseExpiresAt: null } });
    } catch (error) { return translate(error); }
  });
}

/** Private conversation claims serialize only database state, never a model call. */
async function beginPrivateRequest(user: AuthUser, input: BeginSchoolAiRequest): Promise<SchoolAiRequestStart> {
  if (input.expectedConversationVersion === undefined || !input.userMessage || !input.requestLanguage) throw new SchoolAiError("A private conversation needs its saved version and message.", 400);
  return schoolAiTransaction(user, async tx => {
    const permissions = await assertConversationActor(user, tx, "add");
    const conversation = await loadPrivateConversation(user, input.conversationId!, tx);
    const campusId = await resolveWorkspaceCampus(user, input.campusId, tx);
    const subject = await assertWorkspaceSubject(user, campusId, { subjectId: input.subjectId, classId: input.classId }, tx);
    if (conversation.campusId !== campusId || conversation.subjectId !== subject.subjectId || conversation.classId !== subject.classId) throw new SchoolAiError("This conversation belongs to a different selected campus or subject.", 403);
    const requestHash = workspaceRequestHash({ feature: "ASSISTANT", fingerprint: input.fingerprint, campusId, ...subject, role: user.role });
    const where = { schoolId: user.schoolId, actorId: user.userId, feature: "ASSISTANT", idempotencyKey: input.key };
    const row = await tx.schoolAiRequest.findFirst({ where });
    const now = new Date();
    const claim = async (saved: SchoolAiRequest): Promise<SchoolAiRequestStart> => ({ state: "CLAIMED", claim: { id: saved.id, token: saved.claimToken!, schoolId: user.schoolId, campusId, actorId: user.userId, actorRole: user.role, ...subject, requestHash, permissions, conversationId: conversation.id, conversationVersion: saved.conversationVersion!, history: await privateConversationContext(user, conversation.id, saved.conversationVersion!, tx, permissions) } });
    if (row) {
      if (row.requestHash !== requestHash || row.conversationId !== conversation.id || row.userMessage !== input.userMessage || row.requestLanguage !== input.requestLanguage) throw new SchoolAiError("This request key was already used for different content or access scope.", 409);
      if (row.status === "COMPLETED") {
        const exchange = await privateExchange(user, row, tx, permissions);
        if (exchange.hidden || !exchange.turns) throw new SchoolAiError("Access to evidence for this earlier reply is no longer available.", 403);
        const record = row.recordId ? await getWorkspaceRecordInTransaction(user, row.recordId, tx, permissions) : undefined;
        return { state: "COMPLETED", reply: exchange.turns[1].text, ...(record ? { record } : {}) };
      }
      if (row.conversationVersion !== conversation.version) throw new SchoolAiError("This conversation has a newer turn. Continue from the latest saved conversation.", 409);
      if (row.status === "PENDING" && row.leaseExpiresAt && row.leaseExpiresAt > now) throw new SchoolAiError("This reply is still processing. Wait, then refresh this conversation.", 409);
      if (!input.retryFailed) throw new SchoolAiError("Explicitly retry this incomplete reply or start another turn.", 409);
      if (row.attempts >= MAX_ATTEMPTS) throw new SchoolAiError("This turn reached its retry limit. Start another turn.", 409);
      const token = randomUUID(), leaseExpiresAt = new Date(now.getTime() + SCHOOL_AI_REQUEST_LEASE_MS);
      const changed = await tx.schoolAiRequest.updateMany({ where: { ...where, id: row.id, requestHash, status: row.status, claimToken: row.claimToken, attempts: row.attempts, leaseExpiresAt: row.leaseExpiresAt }, data: { status: "PENDING", claimToken: token, leaseExpiresAt, attempts: { increment: 1 }, reply: null, recordId: null, contextRecordIds: [], contextVersions: {}, completedAt: null } });
      if (changed.count !== 1) throw new SchoolAiError("Another attempt claimed this reply. Refresh the conversation.", 409);
      return claim({ ...row, claimToken: token });
    }
    if (conversation.version !== input.expectedConversationVersion) throw new SchoolAiError("Another turn changed this conversation. Refresh before sending.", 409);
    const pending = await tx.schoolAiRequest.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, conversationId: conversation.id, status: "PENDING", leaseExpiresAt: { gt: now } }, select: { id: true } });
    if (pending) throw new SchoolAiError("Wait for this conversation's current reply before sending another message.", 409);
    const reserved = await tx.schoolAiConversation.updateMany({ where: { id: conversation.id, schoolId: user.schoolId, actorId: user.userId, version: conversation.version, archivedAt: null }, data: { version: { increment: 1 } } });
    if (reserved.count !== 1) throw new SchoolAiError("Another turn changed this conversation. Refresh before sending.", 409);
    const saved = await tx.schoolAiRequest.create({ data: { ...where, actorRole: user.role, campusId, ...subject, requestHash, claimToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + SCHOOL_AI_REQUEST_LEASE_MS), conversationId: conversation.id, conversationVersion: conversation.version + 1, userMessage: input.userMessage, requestLanguage: input.requestLanguage } });
    return claim(saved);
  });
}
