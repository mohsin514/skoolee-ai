import { canReadAssistantCatalog } from "./assistant-catalog-service";
import { assistantCatalogSelectionSchema } from "./assistant-catalog";
import { knowledgeIsCurrent } from "./knowledge-service";
import { Prisma, type SchoolAiConversation, type SchoolAiRequest } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { type TxClient } from "@/lib/db/prisma";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { assertSchoolAiAccess, assertSchoolAiRole, assertWorkspaceDomainPermission, assertWorkspaceSubject, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError, type WorkspacePermissionSnapshot } from "./access";
import { getWorkspaceRecordInTransaction, workspaceRequestHash } from "./repository";
import { schoolAiTransaction } from "./transaction";
import { conversationCreateSchema, conversationUpdateSchema, type PrivateConversation, type PrivateConversationPage, type PrivateExchange } from "./conversations";
import { boundedAssistantHistory } from "./assistant-context";
import type { WorkspaceKind } from "./types";

export function publicConversation(row: SchoolAiConversation): PrivateConversation { return { id: row.id, title: row.title, purpose: row.purpose as PrivateConversation["purpose"], topicKey: row.topicKey, campusId: row.campusId, subjectId: row.subjectId, classId: row.classId, version: row.version, archivedAt: row.archivedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
export async function assertConversationActor(user: AuthUser, tx: TxClient, action: "view" | "add" = "view") {
  assertSchoolAiRole(user);
  const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new SchoolAiError("Your staff access changed. Sign in again.", 403);
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  if (action !== "view") await assertSchoolAiAccess(user, action, permissions);
  await assertSchoolOperational(user.schoolId, tx);
  return permissions;
}
export async function loadPrivateConversation(user: AuthUser, id: string, tx: TxClient, allowArchived = false) {
  const row = await tx.schoolAiConversation.findFirst({ where: { id, schoolId: user.schoolId, actorId: user.userId, actorRole: user.role, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
  if (!row) throw new SchoolAiError("Private conversation not found in your current staff access.", 404);
  if (!allowArchived && row.archivedAt) throw new SchoolAiError("Resume this archived conversation before sending another message.", 409);
  await resolveWorkspaceCampus(user, row.campusId, tx);
  await assertWorkspaceSubject(user, row.campusId, { subjectId: row.subjectId, classId: row.classId }, tx);
  return row;
}
export async function canReadConversationEvidence(user: AuthUser, request: SchoolAiRequest, tx: TxClient, permissions: WorkspacePermissionSnapshot) {
  if (!await canReadAssistantCatalog(user, request.campusId, request.catalogContext)) return false;
  const contextIds = Array.isArray(request.contextRecordIds) ? request.contextRecordIds.filter((value): value is string => typeof value === "string") : [];
  const versions = request.contextVersions && typeof request.contextVersions === "object" && !Array.isArray(request.contextVersions) ? request.contextVersions as Record<string, unknown> : {};
  const evidence = [...contextIds.map(id => ({ id, version: versions[id] })), ...(request.recordId ? [{ id: request.recordId, version: 1 }] : [])];
  try {
    for (const item of evidence) {
      const current = await getWorkspaceRecordInTransaction(user, item.id, tx, permissions);
      if (current.campusId !== request.campusId && current.campusId !== null) return false;
      if (!Number.isInteger(item.version) || Number(item.version) < 1) return false;
      const historical = await tx.schoolAiRevision.findFirst({ where: { schoolId: user.schoolId, recordId: item.id, version: Number(item.version) }, select: { data: true, campusId: true } });
      if (!historical) return false;
      await assertWorkspaceDomainPermission(user, current.kind as WorkspaceKind, historical.data as Record<string, unknown>, "view", permissions);
      await assertWorkspaceSubject(user, historical.campusId, historical.data as Record<string, unknown>, tx);
    }
    return true;
  } catch (error) {
    if (error instanceof SchoolAiError && [403, 404].includes(error.status)) return false;
    throw error;
  }
}
export async function privateExchange(user: AuthUser, row: SchoolAiRequest, tx: TxClient, permissions: WorkspacePermissionSnapshot): Promise<PrivateExchange> {
  const base = { id: row.id, version: row.conversationVersion!, createdAt: (row.completedAt ?? row.createdAt).toISOString() };
  if (row.actorId !== user.userId || row.actorRole !== user.role || !row.userMessage || !row.reply || !await canReadConversationEvidence(user, row, tx, permissions)) return { ...base, hidden: true };
  return { ...base, hidden: false, turns: [{ role: "user", text: row.userMessage }, { role: "assistant", text: row.reply }], ...(row.recordId ? { recordId: row.recordId } : {}) };
}
export async function privateConversationContext(user: AuthUser, conversationId: string, beforeVersion: number, tx: TxClient, permissions: WorkspacePermissionSnapshot) {
  const rows = await tx.schoolAiRequest.findMany({ where: { schoolId: user.schoolId, actorId: user.userId, conversationId, conversationVersion: { lt: beforeVersion }, status: "COMPLETED" }, orderBy: { conversationVersion: "desc" }, take: 4 });
  const turns: import("./assistant-context").AssistantTurn[] = [];
  const evidenceVersions: Record<string, number> = {};
  for (const row of rows.reverse()) {
    const exchange = await privateExchange(user, row, tx, permissions);
    if (!exchange.turns) continue;
    // Saved proposals stay in the visible transcript, but never become model facts.
    // Old context is reusable only while its exact approved evidence is current.
    if (row.recordId || row.catalogContext) continue; // Grounded turns remain visible but never silently carry entity facts to another turn/domain.
    const versions = row.contextVersions as Record<string, number>;
    const combined = { ...evidenceVersions, ...versions };
    if (Object.keys(combined).length > 12) continue;
    let current = true;
    for (const [id, version] of Object.entries(versions)) {
      const record = await getWorkspaceRecordInTransaction(user, id, tx, permissions);
      if (record.version !== version || record.status !== "APPROVED" || !await knowledgeIsCurrent(user,record,tx,permissions)) { current = false; break; }
    }
    if (!current) continue;
    Object.assign(evidenceVersions, versions);
    turns.push(...exchange.turns);
  }
  return { history: boundedAssistantHistory(turns), evidenceVersions };
}
export async function createPrivateConversation(user: AuthUser, input: unknown) {
  const data = conversationCreateSchema.parse(input);
  const work = () => schoolAiTransaction(user, async tx => {
    await assertConversationActor(user, tx, "add");
    const campusId = await resolveWorkspaceCampus(user, data.campusId, tx);
    const scope = await assertWorkspaceSubject(user, campusId, data, tx);
    const hash = workspaceRequestHash({ title: data.title, purpose: data.purpose, topicKey: data.topicKey ?? null, campusId, ...scope, role: user.role });
    const existing = await tx.schoolAiConversation.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, idempotencyKey: data.idempotencyKey } });
    if (existing) { if (existing.requestHash !== hash) throw new SchoolAiError("This conversation key belongs to different content or scope.", 409); return publicConversation(await loadPrivateConversation(user, existing.id, tx, true)); }
    return publicConversation(await tx.schoolAiConversation.create({ data: { schoolId: user.schoolId, actorId: user.userId, actorRole: user.role, title: data.title, purpose: data.purpose, topicKey: data.topicKey ?? null, campusId, ...scope, idempotencyKey: data.idempotencyKey, requestHash: hash } }));
  });
  try { return await work(); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return work(); throw error; }
}
export async function listPrivateConversations(user: AuthUser, options: { campusId?: string | null; subjectId?: string; classId?: string; purpose?: "WORKSPACE" | "SETUP"; topicKey?: string; before?: string; archived?: boolean } = {}) {
  return schoolAiTransaction(user, async tx => {
    await assertConversationActor(user, tx);
    const campusId = await resolveWorkspaceCampus(user, options.campusId, tx);
    const scope = await assertWorkspaceSubject(user, campusId, options, tx);
    const where = { schoolId: user.schoolId, actorId: user.userId, actorRole: user.role, campusId, ...scope, purpose: options.purpose ?? "WORKSPACE", topicKey: options.topicKey ?? null, archivedAt: options.archived ? { not: null } : null };
    const cursor = options.before ? await tx.schoolAiConversation.findFirst({ where: { id: options.before, ...where }, select: { id: true, createdAt: true } }) : null;
    if (options.before && !cursor) throw new SchoolAiError("Conversation page no longer available.", 404);
    const rows = await tx.schoolAiConversation.findMany({ where: { ...where, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21 });
    return { conversations: rows.slice(0, 20).map(publicConversation), nextCursor: rows.length > 20 ? rows[19].id : null };
  });
}
export async function getPrivateConversation(user: AuthUser, id: string, beforeVersion?: number): Promise<PrivateConversationPage> {
  return schoolAiTransaction(user, async tx => {
    const permissions = await assertConversationActor(user, tx);
    const conversation = await loadPrivateConversation(user, id, tx, true);
    const rows = await tx.schoolAiRequest.findMany({ where: { schoolId: user.schoolId, actorId: user.userId, conversationId: id, status: "COMPLETED", ...(beforeVersion ? { conversationVersion: { lt: beforeVersion } } : {}) }, orderBy: { conversationVersion: "desc" }, take: 21 });
    const page = rows.slice(0, 20);
    const recovery = await tx.schoolAiRequest.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, conversationId: id, conversationVersion: conversation.version, status: { in: ["PENDING", "FAILED"] } }, select: { idempotencyKey: true, userMessage: true, requestLanguage: true, conversationVersion: true, status: true, leaseExpiresAt: true, catalogContext: true } });
    const exchanges: PrivateExchange[] = [];
    for (const row of page.reverse()) exchanges.push(await privateExchange(user, row, tx, permissions));
    const recoveryAllowed = recovery && await canReadAssistantCatalog(user, conversation.campusId, recovery.catalogContext);
    return { conversation: publicConversation(conversation), exchanges, nextVersion: rows.length > 20 ? rows[19].conversationVersion : null, recovery: recoveryAllowed && recovery?.userMessage ? { catalog: recovery.catalogContext ? assistantCatalogSelectionSchema.parse(recovery.catalogContext) : undefined, key: recovery.idempotencyKey, message: recovery.userMessage, language: recovery.requestLanguage === "ar" || recovery.requestLanguage === "ur" ? recovery.requestLanguage : "en", version: recovery.conversationVersion!, status: recovery.status as "PENDING" | "FAILED", leaseExpiresAt: recovery.leaseExpiresAt?.toISOString() ?? null } : null };
  });
}
export async function updatePrivateConversation(user: AuthUser, id: string, input: unknown) {
  const data = conversationUpdateSchema.parse(input);
  return schoolAiTransaction(user, async tx => {
    await assertConversationActor(user, tx, "add"); const row = await loadPrivateConversation(user, id, tx, true);
    if (row.version !== data.version) throw new SchoolAiError("This conversation changed. Reload before continuing.", 409);
    const active = await tx.schoolAiRequest.findFirst({ where: { schoolId: user.schoolId, conversationId: id, status: "PENDING", leaseExpiresAt: { gt: new Date() } }, select: { id: true } });
    if (active) throw new SchoolAiError("Wait for the pending reply before archiving or resuming this conversation.", 409);
    return publicConversation(await tx.schoolAiConversation.update({ where: { id: row.id }, data: { archivedAt: data.action === "archive" ? new Date() : null, version: { increment: 1 } } }));
  });
}
