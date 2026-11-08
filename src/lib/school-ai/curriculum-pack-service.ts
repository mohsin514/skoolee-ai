import { createHash } from "node:crypto";
import { Prisma, type CurriculumPackActivation, type CurriculumPackVersion } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { canLeadAcademics } from "@/lib/api/scope";
import { runUnscoped } from "@/lib/db/tenant-context";
import { SchoolAiError } from "./access";
import { schoolAiTransaction } from "./transaction";
import { curriculumContractSchema } from "./curriculum-contract";
import { saveOriginal, sourceStorageAvailable } from "./source-storage";
import { getAIModel } from "@/lib/ai/openai";
import { AI_PROMPT_VERSION } from "@/lib/ai/prompts";
import { AI_POLICY_VERSION } from "@/lib/ai/evaluation";
import { educatorEvalEnforced, evaluationFingerprint, evaluationStatusSchema, packAiEvaluationGate } from "@/lib/ai-evaluation/educator/gate";
import educatorEvaluationStatus from "@/config/educator-evaluation-status.json";
import {
  PACK_GEOGRAPHIES, activationBlockers, canApprovePack, canManagePackRequest, curriculumPackGate, planTransition, shippedCurriculumPacks, sourceEvidenceSchema,
  type ActivationSnapshot, type ActivationStatus, type CatalogueRow, type DeclaredPack, type PackActor, type PackGate, type SourceEvidence,
} from "./curriculum-pack-registry";

/** SKAI-1008..1012 persistence: platform catalogue, per-campus activation with evidence, append-only history. */

export function catalogueRowOf(row: CurriculumPackVersion): CatalogueRow {
  const content = curriculumContractSchema.parse(row.content);
  return { packId: row.packId, version: row.version, board: row.board, subject: row.subject, schoolGrade: row.schoolGrade, examYear: row.examYear, language: row.language, status: row.status, contentSha256: row.contentSha256, content, unverified: content.unverified };
}

export function snapshotOf(row: CurriculumPackActivation): ActivationSnapshot {
  return {
    schoolId: row.schoolId, campusId: row.campusId, status: row.status as ActivationStatus, geography: row.geography, schoolGrade: row.schoolGrade,
    localBudgetApprover: row.localBudgetApprover, sourceEvidence: z.array(sourceEvidenceSchema).parse(row.sourceEvidence), educatorApprover: row.educatorApprover,
    educatorApproverId: row.educatorApproverId, approvedOn: row.approvedOn, reviewDueOn: row.reviewDueOn, requestedById: row.requestedById, contentSha256: row.contentSha256,
  };
}

async function actorOf(user: AuthUser, campusId: string | null): Promise<PackActor> {
  const leadsAcademics = await canLeadAcademics(user, campusId).catch(() => false);
  return { userId: user.userId, role: user.role, schoolId: user.schoolId, campusId: user.campusId, leadsAcademics };
}

const SCHOOL_ROLES = new Set(["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"]);
function assertSchoolReader(user: AuthUser) {
  if (!SCHOOL_ROLES.has(user.role)) throw new SchoolAiError("Curriculum packs are managed by the group owner, campus administrator or principal.", 403);
}

/** Platform owner: the catalogue with every unverified item and how many campuses use each version. */
export async function platformCatalogue() {
  const rows = await prisma.curriculumPackVersion.findMany({ orderBy: [{ board: "asc" }, { packId: "asc" }, { version: "desc" }] });
  const counts = await runUnscoped("curriculum packs: platform usage counts per catalogue version (no school detail)", () => prisma.curriculumPackActivation.groupBy({ by: ["packVersionId", "status"], _count: { _all: true } }));
  return rows.map(row => ({ id: row.id, ...catalogueRowOf(row), content: undefined, activations: Object.fromEntries(counts.filter(item => item.packVersionId === row.id).map(item => [item.status, item._count._all])) }));
}

/** A school's view: the catalogue, its campus requests with blockers and history, and what this user may do. */
export async function schoolCurriculumPacks(user: AuthUser, now = new Date()) {
  assertSchoolReader(user);
  const campusFilter = user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "__none__" };
  const [versions, activations, campuses] = await Promise.all([
    prisma.curriculumPackVersion.findMany({ orderBy: [{ board: "asc" }, { packId: "asc" }, { version: "desc" }] }),
    prisma.curriculumPackActivation.findMany({ where: { schoolId: user.schoolId, ...campusFilter }, include: { events: { orderBy: { at: "asc" } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.campus.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...(user.role === "SUPER_ADMIN" ? {} : { id: user.campusId ?? "__none__" }) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const byId = new Map(versions.map(row => [row.id, row]));
  const rows = [];
  for (const activation of activations) {
    const version = byId.get(activation.packVersionId);
    if (!version) continue;
    const snapshot = snapshotOf(activation);
    const actor = await actorOf(user, activation.campusId);
    const catalogue = catalogueRowOf(version);
    rows.push({
      id: activation.id, campusId: activation.campusId, packId: version.packId, version: version.version, status: activation.status, geography: activation.geography,
      schoolGrade: activation.schoolGrade, localBudgetApprover: activation.localBudgetApprover, sourceEvidence: snapshot.sourceEvidence.map(({ documentKey: _key, ...item }) => ({ ...item, hasDocument: Boolean(_key) })),
      sources: catalogue.content.sources.map(source => ({ id: source.id, reference: source.reference, authority: source.authority, url: source.url })),
      educatorApprover: activation.educatorApprover, approvedOn: activation.approvedOn?.toISOString().slice(0, 10) ?? null, reviewDueOn: activation.reviewDueOn?.toISOString().slice(0, 10) ?? null,
      revokedReason: activation.revokedReason, contentSha256: activation.contentSha256,
      blockers: activation.status === "REVOKED" ? [] : activationBlockers(catalogue, snapshot, now),
      events: activation.events.map(event => ({ from: event.fromStatus, to: event.toStatus, actorRole: event.actorRole, reason: event.reason, at: event.at.toISOString() })),
      can: {
        edit: activation.status === "DRAFT" && canManagePackRequest(actor, activation.schoolId, activation.campusId),
        approve: activation.status === "DRAFT" && canApprovePack(actor, activation.schoolId, activation.campusId) && user.userId !== activation.requestedById,
        activate: activation.status === "APPROVED" && canManagePackRequest(actor, activation.schoolId, activation.campusId),
        revoke: activation.status !== "REVOKED" && (canManagePackRequest(actor, activation.schoolId, activation.campusId) || canApprovePack(actor, activation.schoolId, activation.campusId)),
      },
    });
  }
  const canRequest = user.role === "SUPER_ADMIN" || ((user.role === "CAMPUS_ADMIN" || user.role === "ADMIN") && Boolean(user.campusId));
  return {
    catalogue: versions.map(row => ({ id: row.id, packId: row.packId, version: row.version, board: row.board, subject: row.subject, schoolGrade: row.schoolGrade, examYear: row.examYear, language: row.language, status: row.status, unverifiedCount: catalogueRowOf(row).unverified.length })),
    activations: rows, campuses, geographies: PACK_GEOGRAPHIES, canRequest, uploadsAvailable: sourceStorageAvailable(),
  };
}

const requestSchema = z.object({
  packVersionId: z.string().uuid(), campusId: z.string().min(1).max(100), geography: z.enum(PACK_GEOGRAPHIES),
  schoolGrade: z.string().trim().min(1).max(40), localBudgetApprover: z.string().trim().max(120).optional(),
}).strict();

async function audit(tx: TxClient, user: AuthUser, activation: CurriculumPackActivation, from: string | null, to: string, reason?: string) {
  await tx.curriculumPackActivationEvent.create({ data: { schoolId: activation.schoolId, activationId: activation.id, fromStatus: from, toStatus: to, actorId: user.userId, actorRole: user.role, reason: reason ?? null, contentSha256: activation.contentSha256 } });
  await tx.auditLog.create({ data: { schoolId: activation.schoolId, tableName: "curriculum_pack_activations", recordId: activation.id, userId: user.userId, newValue: { action: `curriculum_pack.${to.toLowerCase()}`, from, to, campusId: activation.campusId, contentSha256: activation.contentSha256 } } });
}

export async function requestCurriculumPack(user: AuthUser, raw: unknown) {
  assertSchoolReader(user);
  const input = requestSchema.parse(raw);
  const actor = await actorOf(user, input.campusId);
  if (!canManagePackRequest(actor, user.schoolId, input.campusId)) throw new SchoolAiError("Only the group owner, or the campus administrator for their own campus, can request a curriculum pack.", 403);
  return schoolAiTransaction(user, async tx => {
    const campus = await tx.campus.findFirst({ where: { id: input.campusId, schoolId: user.schoolId, archivedAt: null }, select: { id: true } });
    if (!campus) throw new SchoolAiError("This campus is unavailable.", 404);
    const version = await tx.curriculumPackVersion.findUnique({ where: { id: input.packVersionId } });
    if (!version) throw new SchoolAiError("This pack version is not in the catalogue.", 404);
    const open = await tx.curriculumPackActivation.findFirst({ where: { schoolId: user.schoolId, campusId: input.campusId, packVersionId: version.id, status: { not: "REVOKED" } }, select: { id: true } });
    if (open) throw new SchoolAiError("This campus already has an open request for this pack version.", 409);
    const activation = await tx.curriculumPackActivation.create({ data: { schoolId: user.schoolId, campusId: input.campusId, packVersionId: version.id, contentSha256: version.contentSha256, geography: input.geography, schoolGrade: input.schoolGrade, localBudgetApprover: input.localBudgetApprover || null, requestedById: user.userId } });
    await audit(tx, user, activation, null, "DRAFT");
    return { id: activation.id };
  });
}

const evidenceSchema = z.object({ sourceId: z.string().trim().min(1).max(80), rightsScope: z.string().trim().min(1).max(500), permissionEvidence: z.string().trim().min(1).max(500) }).strict();
const DOCUMENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

/** Records (or replaces) a source's rights and permission evidence, optionally with an uploaded document. DRAFT only. */
export async function recordPackEvidence(user: AuthUser, activationId: string, raw: unknown, file?: { bytes: Buffer; type: string; name: string }) {
  assertSchoolReader(user);
  const input = evidenceSchema.parse(raw);
  let document: Pick<SourceEvidence, "documentKey" | "documentSha256" | "documentName"> = {};
  const existing = await prisma.curriculumPackActivation.findFirst({ where: { id: activationId, schoolId: user.schoolId }, include: { packVersion: true } });
  if (!existing) throw new SchoolAiError("Pack request not found.", 404);
  const actor = await actorOf(user, existing.campusId);
  if (!canManagePackRequest(actor, user.schoolId, existing.campusId)) throw new SchoolAiError("Only the group owner or this campus's administrator can record evidence.", 403);
  if (!catalogueRowOf(existing.packVersion).content.sources.some(source => source.id === input.sourceId)) throw new SchoolAiError("Evidence must name one of the pack's sources.", 422);
  if (file) {
    if (!DOCUMENT_TYPES.has(file.type)) throw new SchoolAiError("Upload a PDF, PNG or JPEG permission document.", 415);
    if (!sourceStorageAvailable()) throw new SchoolAiError("Document storage is not configured. Record the evidence reference instead.", 503);
    document = { documentKey: await saveOriginal(user.schoolId, file.bytes, file.type), documentSha256: createHash("sha256").update(file.bytes).digest("hex"), documentName: file.name.slice(0, 200) || "evidence" };
  }
  return schoolAiTransaction(user, async tx => {
    const row = await tx.curriculumPackActivation.findFirst({ where: { id: activationId, schoolId: user.schoolId } });
    if (!row || row.status !== "DRAFT") throw new SchoolAiError("Evidence can change only while the request is a draft.", 409);
    const evidence = snapshotOf(row).sourceEvidence.filter(item => item.sourceId !== input.sourceId);
    const previous = snapshotOf(row).sourceEvidence.find(item => item.sourceId === input.sourceId);
    const keep = file ? document : { documentKey: previous?.documentKey, documentSha256: previous?.documentSha256, documentName: previous?.documentName };
    const next = sourceEvidenceSchema.parse(Object.fromEntries(Object.entries({ ...input, ...keep }).filter(([, value]) => value !== undefined)));
    const updated = await tx.curriculumPackActivation.updateMany({ where: { id: row.id, schoolId: user.schoolId, status: "DRAFT", updatedAt: row.updatedAt }, data: { sourceEvidence: [...evidence, next] as unknown as Prisma.InputJsonValue } });
    if (updated.count !== 1) throw new SchoolAiError("This request changed. Refresh and try again.", 409);
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "curriculum_pack_activations", recordId: row.id, userId: user.userId, newValue: { action: "curriculum_pack.evidence", sourceId: input.sourceId, documentSha256: next.documentSha256 ?? null } } });
    return { id: row.id };
  });
}

const transitionSchema = z.object({ to: z.enum(["APPROVED", "ACTIVE", "REVOKED"]), approvedOn: z.string().optional(), reviewDueOn: z.string().optional(), reason: z.string().trim().max(500).optional() }).strict();

export async function transitionCurriculumPack(user: AuthUser, activationId: string, raw: unknown, now = new Date()) {
  assertSchoolReader(user);
  const input = transitionSchema.parse(raw);
  const found = await prisma.curriculumPackActivation.findFirst({ where: { id: activationId, schoolId: user.schoolId }, select: { campusId: true } });
  if (!found) throw new SchoolAiError("Pack request not found.", 404);
  const actor = await actorOf(user, found.campusId);
  return schoolAiTransaction(user, async tx => {
    const row = await tx.curriculumPackActivation.findFirst({ where: { id: activationId, schoolId: user.schoolId }, include: { packVersion: true } });
    if (!row) throw new SchoolAiError("Pack request not found.", 404);
    const snapshot = snapshotOf(row);
    const blockers = input.to === "ACTIVE" ? activationBlockers(catalogueRowOf(row.packVersion), snapshot, now) : [];
    const plan = planTransition(snapshot, input.to, actor, blockers, input, now);
    if (!plan.ok) throw Object.assign(new SchoolAiError(plan.errors[0], plan.status, input.to === "ACTIVE" && plan.status === 422 ? "CURRICULUM_PACK_BLOCKED" : undefined), { details: plan.errors });
    const data: Prisma.CurriculumPackActivationUpdateManyMutationInput = { status: input.to };
    if (input.to === "APPROVED") Object.assign(data, { educatorApproverId: user.userId, educatorApprover: user.fullName || user.email, approvedOn: new Date(`${input.approvedOn}T00:00:00Z`), reviewDueOn: new Date(`${input.reviewDueOn}T00:00:00Z`) });
    if (input.to === "REVOKED") data.revokedReason = input.reason!;
    const changed = await tx.curriculumPackActivation.updateMany({ where: { id: row.id, schoolId: user.schoolId, status: row.status, updatedAt: row.updatedAt }, data });
    if (changed.count !== 1) throw new SchoolAiError("This request changed. Refresh and try again.", 409);
    await audit(tx, user, row, row.status, input.to, input.reason);
    return { id: row.id, status: input.to };
  });
}

/**
 * The enforcement read used by paper generation and paper approval. Fails closed: a curriculum that
 * names a catalogue pack is refused unless that version is ACTIVE for the paper's campus.
 */
export async function curriculumPackGateFor(db: TxClient, schoolId: string, campusId: string | null, declared: DeclaredPack | undefined, pin?: { packId: string; version: number; contentSha256: string } | null, now = new Date(), opts: { ai?: boolean } = {}): Promise<PackGate> {
  if (!declared?.packId) return { gated: false };
  const knownPackIds = new Set(shippedCurriculumPacks().map(pack => pack.packId));
  const versions = await db.curriculumPackVersion.findMany({ where: { packId: declared.packId } });
  if (!versions.length && !knownPackIds.has(declared.packId)) return { gated: false };
  const version = versions.find(row => row.version === declared.version) ?? null;
  const activation = version && campusId ? await db.curriculumPackActivation.findFirst({ where: { schoolId, campusId, packVersionId: version.id, status: "ACTIVE" }, orderBy: { updatedAt: "desc" } }) : null;
  return curriculumPackGate({ declared, knownPackIds: new Set([...knownPackIds, declared.packId]), catalogue: version ? catalogueRowOf(version) : null, activation: activation ? snapshotOf(activation) : null, pin, now, aiEvaluation: opts.ai ? currentPackAiEvaluation(declared.packId) : undefined });
}

/** SKAI-1053 (D5-04): the committed educator-evaluation verdicts for the running model/prompt. */
export function currentPackAiEvaluation(packId: string) {
  const fingerprint = evaluationFingerprint({ model: getAIModel(), promptVersion: AI_PROMPT_VERSION, policyVersion: AI_POLICY_VERSION });
  return packAiEvaluationGate(packId, evaluationStatusSchema.parse(educatorEvaluationStatus), fingerprint, educatorEvalEnforced());
}
