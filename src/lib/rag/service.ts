import type { AuthUser } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { SchoolAiError, assertWorkspacePermission } from "@/lib/school-ai/access";
import { authorizeActor, inTenant } from "@/lib/ai-workflows/jobs/actor";
import { sha256 } from "@/lib/ai-workflows/executor/canonical";
import { Pseudonymizer, scanForPII } from "@/lib/ai/pseudonymize";
import { registerVocabulary } from "@/lib/ai-workflows/pii/vocabulary";
import { loadPeopleVocabulary } from "@/lib/ai-workflows/pii/load-vocabulary";
import { chunkText, documentSchema, hybridRank, querySchema } from "./core";
import { EMBEDDING_MODEL, embedTexts, type Embed } from "./provider";

export const isKnowledgeManager = (role: string) => ["APP_OWNER", "SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(role);
const schoolManager = (user: AuthUser) => ["APP_OWNER", "SUPER_ADMIN"].includes(user.role);
export async function assertKnowledgeAccess(user: AuthUser, write = false) {
  await authorizeActor(user);
  if (write && !isKnowledgeManager(user.role)) throw new SchoolAiError("Only authorized school managers can publish knowledge.", 403);
  if (user.role !== "APP_OWNER") await assertWorkspacePermission(user, "ai", write ? "edit" : "view");
}
function managementWhere(user: AuthUser): Prisma.RagDocumentWhereInput {
  return { schoolId: user.schoolId, ...(schoolManager(user) ? {} : { campusId: user.campusId ?? "__none__" }) };
}
export function readableWhere(user: AuthUser, now = new Date()): Prisma.RagDocumentWhereInput {
  return { schoolId: user.schoolId, status: "PUBLISHED", roles: { has: user.role },
    AND: [{ OR: [{ campusId: null }, ...(user.campusId ? [{ campusId: user.campusId }] : [])] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
  };
}
const summary = { id: true, title: true, campusId: true, roles: true, version: true, status: true, indexMode: true, publishedAt: true, expiresAt: true, updatedAt: true } as const;
export async function maskKnowledge(user: AuthUser, texts: string[]) {
  const masker = new Pseudonymizer();
  registerVocabulary(masker, await loadPeopleVocabulary(user, user.campusId), texts);
  masker.token(user.email, "EMAIL");
  if (user.fullName) masker.token(user.fullName, "PERSON");
  for (const text of texts) for (const hit of scanForPII(text)) masker.token(hit, "ID");
  return { masker, texts: texts.map(text => masker.mask(text)) };
}
async function audit(tx: TxClient, user: AuthUser, id: string, action: string, version: number) {
  await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "rag_documents", recordId: id, newValue: { action, version } } });
}

export function listKnowledge(user: AuthUser) {
  return inTenant(user, async () => {
    await assertKnowledgeAccess(user);
    const rows = await prisma.ragDocument.findMany({ where: isKnowledgeManager(user.role) ? { ...managementWhere(user), status: { not: "DELETED" } } : readableWhere(user), select: summary, orderBy: { updatedAt: "desc" }, take: 101 });
    return { documents: rows.slice(0, 100), truncated: rows.length > 100, canManage: isKnowledgeManager(user.role) };
  });
}
export function readKnowledge(user: AuthUser, id: string, version?: number) {
  return inTenant(user, async () => {
    await assertKnowledgeAccess(user);
    const where = version !== undefined || !isKnowledgeManager(user.role) ? readableWhere(user) : managementWhere(user);
    const doc = await prisma.ragDocument.findFirst({ where: { ...where, id, ...(version !== undefined ? { version } : { status: { not: "DELETED" } }) }, select: { ...summary, content: true } });
    if (!doc) throw new SchoolAiError("This source is unavailable, changed, or outside your access.", 404);
    return doc;
  });
}
export function saveKnowledge(user: AuthUser, raw: unknown, existing?: { id: string; version: number }) {
  return inTenant(user, async () => {
    await assertKnowledgeAccess(user, true);
    const input = documentSchema.parse(raw);
    if (!schoolManager(user) && (!user.campusId || input.campusId !== user.campusId)) throw new SchoolAiError("Publish knowledge only for your assigned campus.", 403);
    if (input.campusId && !await prisma.campus.findFirst({ where: { id: input.campusId, schoolId: user.schoolId }, select: { id: true } })) throw new SchoolAiError("Campus not found.", 404);
    if (input.expiresAt && new Date(input.expiresAt) <= new Date()) throw new SchoolAiError("Choose a future expiry date.", 422);
    if (/-----BEGIN .*PRIVATE KEY-----|\b(?:password|api[_ -]?key|secret[_ -]?key)\s*[:=]\s*\S+/i.test(input.content)) throw new SchoolAiError("Remove credentials from knowledge documents.", 422);
    const data = { ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, checksum: sha256(input.content), status: "DRAFT", indexMode: null, publishedAt: null, publishedById: null };
    return prisma.$transaction(async tx => {
      if (existing) {
        const claimed = await tx.ragDocument.updateMany({ where: { ...managementWhere(user), id: existing.id, version: existing.version, status: { not: "DELETED" } }, data: { ...data, version: { increment: 1 } } });
        if (claimed.count !== 1) throw new SchoolAiError("This document changed. Reload before saving.", 409);
        await tx.ragChunk.deleteMany({ where: { schoolId: user.schoolId, documentId: existing.id } });
        await audit(tx, user, existing.id, "EDIT_WITHDRAW", existing.version + 1);
        return tx.ragDocument.findFirstOrThrow({ where: { id: existing.id, schoolId: user.schoolId }, select: summary });
      }
      // Serialize the per-school capacity check without holding a database lock during embedding calls.
      await tx.$queryRaw`SELECT id FROM schools WHERE id = ${user.schoolId} FOR UPDATE`;
      if (await tx.ragDocument.count({ where: { schoolId: user.schoolId, status: { not: "DELETED" } } }) >= 100) throw new SchoolAiError("This school has reached its 100-document knowledge limit. Remove unused documents. Archiving preserves them and does not release capacity.", 409);
      const doc = await tx.ragDocument.create({ data: { ...data, schoolId: user.schoolId, createdById: user.userId }, select: summary });
      await audit(tx, user, doc.id, "CREATE", doc.version);
      return doc;
    });
  });
}

export function publishKnowledge(user: AuthUser, id: string, version: number, embed: Embed = embedTexts) {
  return inTenant(user, async () => {
    await assertKnowledgeAccess(user, true);
    const doc = await prisma.ragDocument.findFirst({ where: { ...managementWhere(user), id, version, status: { in: ["DRAFT", "PUBLISHED", "ARCHIVED"] } } });
    if (!doc) throw new SchoolAiError("This document changed. Reload before publishing.", 409);
    if (doc.expiresAt && doc.expiresAt <= new Date()) throw new SchoolAiError("This source has expired.", 422);
    const chunks = chunkText(doc.content);
    if (!chunks.length || chunks.length > 60) throw new SchoolAiError("Document is empty or exceeds the indexing limit.", 422);
    const masked = await maskKnowledge(user, chunks.map(chunk => `${doc.title}\n${chunk.text}`));
    let vectors: number[][] | null = null;
    try { vectors = await embed(masked.texts); } catch { /* Keyword retrieval stays available; UI explicitly reports degraded indexing. */ }
    if (vectors && (vectors.length !== chunks.length || vectors.some(vector => vector.length !== 512 || vector.some(n => !Number.isFinite(n))))) vectors = null;
    await assertKnowledgeAccess(user, true); // Permissions may have changed during a provider call.
    return prisma.$transaction(async tx => {
      const next = version + 1;
      const claim = await tx.ragDocument.updateMany({ where: { ...managementWhere(user), id, version, checksum: doc.checksum, status: { not: "DELETED" } }, data: { status: "PUBLISHED", version: next, publishedAt: new Date(), publishedById: user.userId, indexMode: vectors ? "HYBRID" : "KEYWORD" } });
      if (claim.count !== 1) throw new SchoolAiError("The document changed while indexing. Review and publish the latest version.", 409);
      await tx.ragChunk.deleteMany({ where: { schoolId: user.schoolId, documentId: id } });
      await tx.ragChunk.createMany({ data: chunks.map((chunk, index) => ({ ...chunk, schoolId: user.schoolId, documentId: id, version: next, embedding: vectors?.[index] ?? [], model: vectors ? EMBEDDING_MODEL : null })) });
      await audit(tx, user, id, "PUBLISH", next);
      return tx.ragDocument.findFirstOrThrow({ where: { id, schoolId: user.schoolId }, select: summary });
    });
  });
}

export function withdrawKnowledge(user: AuthUser, id: string, version: number, remove = false) {
  return inTenant(user, async () => {
    await assertKnowledgeAccess(user, true);
    return prisma.$transaction(async tx => {
      const claim = await tx.ragDocument.updateMany({ where: { ...managementWhere(user), id, version, status: { not: "DELETED" } }, data: { status: remove ? "DELETED" : "ARCHIVED", version: { increment: 1 }, indexMode: null, ...(remove ? { content: "", checksum: sha256("") } : {}) } });
      if (!claim.count) throw new SchoolAiError("Document changed or unavailable.", 409);
      await tx.ragChunk.deleteMany({ where: { schoolId: user.schoolId, documentId: id } });
      await audit(tx, user, id, remove ? "DELETE" : "ARCHIVE", version + 1);
      return { id, status: remove ? "DELETED" : "ARCHIVED", version: version + 1 };
    });
  });
}

export function searchKnowledge(user: AuthUser, raw: string, embed: Embed = embedTexts) {
  return inTenant(user, async () => {
    await assertKnowledgeAccess(user);
    const query = querySchema.parse(raw);
    // ACL is applied before any content is loaded, ranked, embedded or sent to generation.
    const docs = await prisma.ragDocument.findMany({ where: readableWhere(user), select: { id: true, title: true, version: true, indexMode: true }, take: 101 });
    if (docs.length > 100) throw new SchoolAiError("Knowledge index exceeds its supported capacity.", 503);
    const chunks = docs.length ? await prisma.ragChunk.findMany({ where: { schoolId: user.schoolId, OR: docs.map(doc => ({ documentId: doc.id, version: doc.version })) }, take: 6001 }) : [];
    if (chunks.length > 6000) throw new SchoolAiError("Knowledge index exceeds its supported capacity.", 503);
    let vector: number[] | null = null;
    if (chunks.some(chunk => chunk.model === EMBEDDING_MODEL)) {
      const masked = await maskKnowledge(user, [query]);
      try { vector = (await embed(masked.texts))?.[0] ?? null; } catch { /* Search remains lexical when provider is unavailable. */ }
    }
    const ranked = hybridRank(query, chunks.map(chunk => ({ ...chunk, title: docs.find(doc => doc.id === chunk.documentId)!.title })), vector, EMBEDDING_MODEL);
    const sources = ranked.map(({ chunk }) => {
      const row = chunks.find(row => row.id === chunk.id)!;
      const doc = docs.find(doc => doc.id === chunk.documentId)!;
      return { documentId: doc.id, chunkId: chunk.id, title: doc.title, version: doc.version, text: chunk.text, startOffset: row.startOffset, endOffset: row.endOffset,
        href: `/ai/knowledge/${encodeURIComponent(doc.id)}?version=${doc.version}` };
    });
    return { sources, mode: vector ? "HYBRID" as const : "KEYWORD" as const };
  });
}
