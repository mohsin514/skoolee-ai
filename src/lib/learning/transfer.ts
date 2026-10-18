import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { liveGuardianRelationshipWhere } from "@/lib/parent/guardian-query";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { curriculumDataSchema } from "@/lib/school-ai/assessment";
import { saveLearningAction } from "./actions";

/**
 * SKO-471: the learning transfer bridge. A receiving school imports a learner's evidence from another
 * school or curriculum (for a learner it already enrolls), a guardian consents to its use, teachers map
 * each source objective to destination objectives — or record that it is not comparable — and a reviewed
 * bridge plan becomes a draft learning action. Nothing here creates an identity, converts grades, writes
 * marks or places a learner. Suggestions are plain text overlap with the shared words cited; no model is
 * required and none is called.
 */

const id = z.string().trim().min(1).max(120);
const text = (max: number) => z.string().trim().min(1).max(max);
export const TRANSFER_FIELDS = ["objectives", "work", "results"] as const;
export const importSchema = z.object({
  studentId: id,
  source: z.object({
    institution: text(200), learnerRef: text(120), curriculumId: text(120), curriculumName: text(200), version: text(60),
    language: z.string().trim().max(20).optional().nullable(),
    objectives: z.array(z.object({ id: text(120), version: text(60), title: text(500), work: z.string().trim().max(2000).optional().nullable(), result: z.string().trim().max(200).optional().nullable() }).strict()).min(1).max(200),
  }).strict(),
}).strict();
export const consentSchema = z.object({ caseId: id, fields: z.array(z.enum(TRANSFER_FIELDS)).min(1), expiresOn: z.string().date() }).strict();
export const destinationSchema = z.object({ caseId: id, curriculumRecordId: id, version: z.number().int().positive() }).strict();
export const reviewSchema = z.object({ caseId: id, sourceObjectiveId: id, decision: z.enum(["ACCEPTED", "NOT_COMPARABLE", "REJECTED"]), targetOutcomeIds: z.array(id).max(20), note: z.string().trim().max(1000).optional().nullable(), version: z.number().int().positive() }).strict();
export const bridgeSchema = z.object({ caseId: id, version: z.number().int().positive(), reviewDate: z.string().date() }).strict();

type Objective = z.infer<typeof importSchema>["source"]["objectives"][number];
type Evidence = { objectives: Objective[] };
const json = (value: unknown) => value as Prisma.InputJsonValue;
const today = () => new Date().toISOString().slice(0, 10);
const words = (value: string) => new Set(value.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 3));

function assertStaff(user: AuthUser) {
  if (!canManageOperations(user) && user.role !== "TEACHER") throw new ApiError("Learning transfer is for school staff.", 403);
}

/** The learner must be on the caller's campus; a teacher must teach them. Unknown ids reveal nothing. */
async function learner(tx: TxClient, user: AuthUser, studentId: string) {
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }), archivedAt: null }, select: { id: true, fullName: true, classId: true, campusId: true } });
  if (!student) throw new ApiError("Not found.", 404);
  if (user.role === "TEACHER" && !(await tx.subject.findFirst({ where: { classId: student.classId, teacherId: user.userId }, select: { id: true } })) && !(await tx.class.findFirst({ where: { id: student.classId, classTeacherId: user.userId }, select: { id: true } }))) throw new ApiError("Not found.", 404);
  return student;
}

async function loadCase(tx: TxClient, user: AuthUser, caseId: string) {
  const row = await tx.learningTransferCase.findFirst({ where: { id: caseId, schoolId: user.schoolId } });
  if (!row) throw new ApiError("Not found.", 404);
  await learner(tx, user, row.studentId);
  return row;
}

type CaseRow = Awaited<ReturnType<typeof loadCase>>;
export function rights(row: Pick<CaseRow, "consentGrantedAt" | "consentRevokedAt" | "consentExpiresAt">, at = new Date()): "MISSING" | "REVOKED" | "EXPIRED" | "GRANTED" {
  if (row.consentRevokedAt) return "REVOKED";
  if (!row.consentGrantedAt) return "MISSING";
  if (row.consentExpiresAt && row.consentExpiresAt <= at) return "EXPIRED";
  return "GRANTED";
}
function requireRights(row: CaseRow, field?: (typeof TRANSFER_FIELDS)[number]) {
  const state = rights(row);
  if (state !== "GRANTED") throw new ApiError(state === "REVOKED" ? "The family withdrew consent for this transfer." : state === "EXPIRED" ? "The family's consent for this transfer has expired." : "The family has not yet consented to this transfer.", 403);
  if (field && !(row.consentScope as string[]).includes(field)) throw new ApiError("The family did not share this part of the record.", 403);
}

/** Stable content hash of the source, independent of file name and objective order. */
function sourceHash(source: z.infer<typeof importSchema>["source"]) {
  const objectives = [...source.objectives].sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256").update(JSON.stringify({ ...source, objectives })).digest("hex");
}

/**
 * Import or re-import. The same learner reference from the same institution is always one case: an
 * identical source returns it unchanged; a different version replaces the evidence and makes every
 * mapping and the bridge stale, so nothing reviewed against the old source is used silently.
 */
export async function importTransfer(user: AuthUser, raw: unknown) {
  assertStaff(user);
  const input = importSchema.parse(raw);
  if (new Set(input.source.objectives.map(o => o.id)).size !== input.source.objectives.length) throw new ApiError("Each source objective needs its own identifier.", 400);
  return schoolAiTransaction(user, async tx => {
    const student = await learner(tx, user, input.studentId);
    const hash = sourceHash(input.source);
    const key = { schoolId: user.schoolId, studentId: student.id, sourceInstitution: input.source.institution, sourceLearnerRef: input.source.learnerRef };
    const existing = await tx.learningTransferCase.findUnique({ where: { schoolId_studentId_sourceInstitution_sourceLearnerRef: key } });
    const data = { sourceCurriculumId: input.source.curriculumId, sourceCurriculumName: input.source.curriculumName, sourceVersion: input.source.version, sourceLanguage: input.source.language || null, sourceHash: hash, evidence: json({ objectives: input.source.objectives }) };
    if (existing?.sourceHash === hash) return { id: existing.id, replayed: true, stale: false };
    if (!existing) {
      const created = await tx.learningTransferCase.create({ data: { ...key, campusId: student.campusId, createdById: user.userId, ...data } });
      await tx.learningTransferMapping.createMany({ data: input.source.objectives.map(o => ({ schoolId: user.schoolId, caseId: created.id, sourceObjectiveId: o.id, sourceObjectiveVersion: o.version, sourceVersion: input.source.version })) });
      await writeAuditEvent(tx, user, { table: "learning_transfer_cases", recordId: created.id, action: "CREATE", campusId: student.campusId, after: { studentId: student.id, sourceVersion: input.source.version, objectives: input.source.objectives.length } });
      return { id: created.id, replayed: false, stale: false };
    }
    // A corrected or newer source: keep the case and its consent, but invalidate everything derived from it.
    await tx.learningTransferCase.update({ where: { id: existing.id }, data: { ...data, status: existing.status === "DRAFT" ? "DRAFT" : "STALE", version: { increment: 1 } } });
    await tx.learningTransferMapping.updateMany({ where: { caseId: existing.id }, data: { stale: true, version: { increment: 1 } } });
    for (const o of input.source.objectives) await tx.learningTransferMapping.upsert({ where: { caseId_sourceObjectiveId: { caseId: existing.id, sourceObjectiveId: o.id } }, update: { sourceObjectiveVersion: o.version, sourceVersion: input.source.version }, create: { schoolId: user.schoolId, caseId: existing.id, sourceObjectiveId: o.id, sourceObjectiveVersion: o.version, sourceVersion: input.source.version, stale: true } });
    if (existing.bridgePlanId) await tx.interventionPlan.updateMany({ where: { id: existing.bridgePlanId, schoolId: user.schoolId }, data: { staleReason: `The transfer source changed to version ${input.source.version}. Review the bridge plan again.`, staleSince: new Date() } });
    await writeAuditEvent(tx, user, { table: "learning_transfer_cases", recordId: existing.id, action: "UPDATE", campusId: existing.campusId, before: { sourceVersion: existing.sourceVersion }, after: { sourceVersion: input.source.version, stale: true } });
    return { id: existing.id, replayed: false, stale: true };
  });
}

/** Staff view. Without current consent the evidence is withheld: only the case shell and what is missing. */
export async function getTransfer(user: AuthUser, caseId: string) {
  assertStaff(user);
  return schoolAiTransaction(user, async tx => {
    const row = await loadCase(tx, user, caseId);
    const state = rights(row);
    const mappings = await tx.learningTransferMapping.findMany({ where: { caseId: row.id, schoolId: user.schoolId }, orderBy: { sourceObjectiveId: "asc" } });
    const destination = row.destinationRecordId ? await tx.schoolAiRecord.findFirst({ where: { id: row.destinationRecordId, schoolId: user.schoolId, campusId: row.campusId, kind: "CURRICULUM" }, select: { id: true, title: true, version: true, data: true } }) : null;
    const outcomes = destination ? curriculumDataSchema.safeParse(destination.data) : null;
    const curricula = await tx.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, campusId: row.campusId, kind: "CURRICULUM", status: "APPROVED" }, select: { id: true, title: true, version: true }, orderBy: { title: "asc" }, take: 50 });
    const scope = row.consentScope as string[];
    const evidence = (row.evidence as Evidence).objectives;
    const shared = state === "GRANTED";
    const missing = [...(row.sourceLanguage ? [] : ["LANGUAGE"]), ...(evidence.some(o => !o.work) ? ["WORK"] : [])];
    return {
      id: row.id, version: row.version, status: row.status, studentId: row.studentId, rights: state,
      consent: { fields: scope, grantedAt: row.consentGrantedAt, expiresAt: row.consentExpiresAt, revokedAt: row.consentRevokedAt },
      source: { institution: row.sourceInstitution, curriculumName: row.sourceCurriculumName, curriculumId: row.sourceCurriculumId, version: row.sourceVersion, language: row.sourceLanguage },
      missing, downloads: (row.downloads as unknown[]).length,
      destination: destination ? { id: destination.id, title: destination.title, version: destination.version, current: destination.version === row.destinationVersion } : null,
      outcomes: outcomes?.success ? outcomes.data.outcomes.filter(o => o.included).map(o => ({ id: o.id, title: o.title, code: o.code ?? null })) : [],
      curricula,
      objectives: shared ? evidence.map(o => {
        const mapping = mappings.find(m => m.sourceObjectiveId === o.id);
        return { id: o.id, version: o.version, title: o.title, work: scope.includes("work") ? o.work ?? null : null, result: scope.includes("results") ? o.result ?? null : null,
          mapping: mapping ? { decision: mapping.decision, targetOutcomeIds: mapping.targetOutcomeIds as string[], suggestion: mapping.suggestion, note: mapping.note, stale: mapping.stale, destinationVersion: mapping.destinationVersion, version: mapping.version } : null };
      }) : [],
      bridge: shared ? row.bridge : null, bridgePlanId: row.bridgePlanId,
    };
  });
}

export async function listTransfers(user: AuthUser, studentId: string) {
  assertStaff(user);
  return schoolAiTransaction(user, async tx => {
    await learner(tx, user, studentId);
    const rows = await tx.learningTransferCase.findMany({ where: { schoolId: user.schoolId, studentId }, orderBy: { createdAt: "desc" }, take: 20 });
    return rows.map(row => ({ id: row.id, institution: row.sourceInstitution, curriculumName: row.sourceCurriculumName, version: row.sourceVersion, status: row.status, rights: rights(row) }));
  });
}

/** Choose the destination curriculum explicitly; country or source never selects it. Suggestions follow. */
export async function setDestination(user: AuthUser, raw: unknown) {
  assertStaff(user);
  const input = destinationSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const row = await loadCase(tx, user, input.caseId);
    requireRights(row, "objectives");
    if (row.version !== input.version) throw new ApiError("This transfer changed. Reload it.", 409);
    const record = await tx.schoolAiRecord.findFirst({ where: { id: input.curriculumRecordId, schoolId: user.schoolId, campusId: row.campusId, kind: "CURRICULUM", status: "APPROVED" }, select: { id: true, version: true, data: true } });
    if (!record) throw new ApiError("Choose an approved curriculum on this campus.", 400);
    const outcomes = curriculumDataSchema.parse(record.data).outcomes.filter(o => o.included);
    for (const objective of (row.evidence as Evidence).objectives) {
      const source = words(`${objective.title} ${objective.work ?? ""}`);
      const scored = outcomes.map(o => ({ id: o.id, title: o.title, shared: [...words(`${o.title} ${o.description ?? ""}`)].filter(w => source.has(w)) })).filter(o => o.shared.length >= 2).sort((a, b) => b.shared.length - a.shared.length).slice(0, 3);
      const suggestion = scored.length ? { kind: "CANDIDATES", targets: scored.map(o => ({ id: o.id, sharedWords: o.shared.slice(0, 6) })) } : { kind: "NOT_COMPARABLE", targets: [] };
      // A new destination resets review: every mapping must be reviewed against this curriculum version.
      await tx.learningTransferMapping.updateMany({ where: { caseId: row.id, sourceObjectiveId: objective.id }, data: { suggestion: json(suggestion), destinationVersion: record.version, decision: "PROPOSED", targetOutcomeIds: [], stale: false, reviewedById: null, reviewedAt: null, version: { increment: 1 } } });
    }
    const updated = await tx.learningTransferCase.update({ where: { id: row.id }, data: { destinationRecordId: record.id, destinationVersion: record.version, status: "MAPPING", bridge: Prisma.DbNull, version: { increment: 1 } } });
    return { id: updated.id, version: updated.version };
  });
}

/** Teacher review is mandatory: accept (one or more targets), not comparable, or reject. */
export async function reviewMapping(user: AuthUser, raw: unknown) {
  assertStaff(user);
  const input = reviewSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const row = await loadCase(tx, user, input.caseId);
    requireRights(row, "objectives");
    if (!row.destinationRecordId) throw new ApiError("Choose the destination curriculum first.", 409);
    const record = await tx.schoolAiRecord.findFirstOrThrow({ where: { id: row.destinationRecordId, schoolId: user.schoolId }, select: { version: true, data: true } });
    if (record.version !== row.destinationVersion) throw new ApiError("The destination curriculum has a newer version. Choose it again to review against it.", 409);
    const known = new Set(curriculumDataSchema.parse(record.data).outcomes.map(o => o.id));
    if (input.decision === "ACCEPTED" && !input.targetOutcomeIds.length) throw new ApiError("Choose at least one destination objective, or mark it not comparable.", 400);
    if (input.decision !== "ACCEPTED" && input.targetOutcomeIds.length) throw new ApiError("Only an accepted mapping has destination objectives.", 400);
    if (input.targetOutcomeIds.some(o => !known.has(o))) throw new ApiError("Choose objectives from the destination curriculum.", 400);
    const updated = await tx.learningTransferMapping.updateMany({ where: { caseId: row.id, sourceObjectiveId: input.sourceObjectiveId, version: input.version }, data: { decision: input.decision, targetOutcomeIds: input.targetOutcomeIds, note: input.note ?? null, stale: false, destinationVersion: record.version, reviewedById: user.userId, reviewedAt: new Date(), version: { increment: 1 } } });
    if (updated.count !== 1) throw new ApiError("This mapping changed. Reload it before deciding.", 409);
    await tx.learningTransferCase.update({ where: { id: row.id }, data: { status: "MAPPING", version: { increment: 1 } } });
    await writeAuditEvent(tx, user, { table: "learning_transfer_mappings", recordId: `${row.id}:${input.sourceObjectiveId}`, action: "UPDATE", campusId: row.campusId, after: { decision: input.decision, targets: input.targetOutcomeIds.length } });
    return { decision: input.decision };
  });
}

/**
 * The bridge: confirmed prior evidence, gaps needing a diagnostic check (never an invented score), and a
 * draft learning action for the existing learning-action review. Every mapping must be reviewed and current.
 */
export async function createBridge(user: AuthUser, raw: unknown) {
  assertStaff(user);
  const input = bridgeSchema.parse(raw);
  const prepared = await schoolAiTransaction(user, async tx => {
    const row = await loadCase(tx, user, input.caseId);
    requireRights(row, "objectives");
    if (row.version !== input.version) throw new ApiError("This transfer changed. Reload it.", 409);
    if (!row.destinationRecordId) throw new ApiError("Choose the destination curriculum first.", 409);
    const mappings = await tx.learningTransferMapping.findMany({ where: { caseId: row.id, schoolId: user.schoolId } });
    if (mappings.some(m => m.decision === "PROPOSED" || m.stale)) throw new ApiError("Review every mapping against the current source before planning.", 409);
    const record = await tx.schoolAiRecord.findFirstOrThrow({ where: { id: row.destinationRecordId, schoolId: user.schoolId }, select: { title: true, version: true, data: true } });
    if (record.version !== row.destinationVersion) throw new ApiError("The destination curriculum has a newer version. Review against it first.", 409);
    const outcomes = curriculumDataSchema.parse(record.data).outcomes.filter(o => o.included);
    const evidence = (row.evidence as Evidence).objectives;
    const confirmed = mappings.filter(m => m.decision === "ACCEPTED" && evidence.find(o => o.id === m.sourceObjectiveId)?.work);
    const covered = new Set(confirmed.flatMap(m => m.targetOutcomeIds as string[]));
    const unevidenced = mappings.filter(m => m.decision === "ACCEPTED" && !evidence.find(o => o.id === m.sourceObjectiveId)?.work);
    const gaps = outcomes.filter(o => !covered.has(o.id)).map(o => ({ outcomeId: o.id, title: o.title, reason: unevidenced.some(m => (m.targetOutcomeIds as string[]).includes(o.id)) ? "MAPPED_WITHOUT_WORK" : "NO_PRIOR_EVIDENCE", proposal: "Short diagnostic check" }));
    const bridge = {
      sourceVersion: row.sourceVersion, destinationRecordId: row.destinationRecordId, destinationVersion: record.version, mappingVersions: mappings.map(m => ({ id: m.id, version: m.version })),
      confirmed: confirmed.map(m => ({ sourceObjectiveId: m.sourceObjectiveId, title: evidence.find(o => o.id === m.sourceObjectiveId)?.title ?? "", targetOutcomeIds: m.targetOutcomeIds })),
      notComparable: mappings.filter(m => m.decision === "NOT_COMPARABLE").map(m => m.sourceObjectiveId),
      gaps, createdAt: new Date().toISOString(), createdById: user.userId,
    };
    return { row, bridge, title: record.title };
  });
  // The learning action is drafted through its own owner (SKO-425), which checks the learner and staff again.
  const plan = await saveLearningAction(user, {
    version: 0, studentId: prepared.row.studentId, title: `Bridge plan: ${prepared.title}`.slice(0, 160),
    concern: `Transfer from ${prepared.row.sourceInstitution} (${prepared.row.sourceCurriculumName} ${prepared.row.sourceVersion}). ${prepared.bridge.confirmed.length} objectives confirmed from prior work; ${prepared.bridge.gaps.length} need a diagnostic check. No grade was converted and no placement was made.`.slice(0, 2000),
    evidenceState: "NEEDS_OBSERVATION",
    evidenceRefs: [{ kind: "OBSERVATION", refId: prepared.row.id.slice(0, 60), label: `Reviewed transfer mapping from ${prepared.row.sourceInstitution}`.slice(0, 500).padEnd(10, ".") }],
    ownerId: user.role === "TEACHER" || ["PRINCIPAL", "CAMPUS_ADMIN"].includes(user.role) ? user.userId : null,
    plannedActivity: prepared.bridge.gaps.length ? prepared.bridge.gaps.map(g => `Diagnostic check: ${g.title}`).join("\n").slice(0, 2000) : "Confirm the transferred objectives in class.",
    reviewDate: input.reviewDate,
  });
  return schoolAiTransaction(user, async tx => {
    const updated = await tx.learningTransferCase.updateMany({ where: { id: prepared.row.id, schoolId: user.schoolId, version: input.version }, data: { bridge: json({ ...prepared.bridge, planId: plan.id }), bridgePlanId: plan.id, status: "PLANNED", version: { increment: 1 } } });
    if (updated.count !== 1) throw new ApiError("This transfer changed while planning. Reload it.", 409);
    await writeAuditEvent(tx, user, { table: "learning_transfer_cases", recordId: prepared.row.id, action: "UPDATE", campusId: prepared.row.campusId, after: { bridgePlanId: plan.id, confirmed: prepared.bridge.confirmed.length, gaps: prepared.bridge.gaps.length } });
    return { planId: plan.id, confirmed: prepared.bridge.confirmed.length, gaps: prepared.bridge.gaps.length };
  });
}

/** Export of the reviewed mapping only. Consent and the caller's access are checked on every download. */
export async function exportTransfer(user: AuthUser, caseId: string) {
  assertStaff(user);
  return schoolAiTransaction(user, async tx => {
    const row = await loadCase(tx, user, caseId);
    requireRights(row, "objectives");
    const mappings = await tx.learningTransferMapping.findMany({ where: { caseId: row.id, schoolId: user.schoolId, decision: { in: ["ACCEPTED", "NOT_COMPARABLE"] }, stale: false } });
    const evidence = (row.evidence as Evidence).objectives;
    const downloads = [...(row.downloads as { at: string; byId: string }[]), { at: new Date().toISOString(), byId: user.userId }];
    await tx.learningTransferCase.update({ where: { id: row.id }, data: { downloads: json(downloads) } });
    await writeAuditEvent(tx, user, { table: "learning_transfer_cases", recordId: row.id, action: "UPDATE", campusId: row.campusId, after: { exported: true, download: downloads.length } });
    return {
      caseId: row.id, source: { institution: row.sourceInstitution, curriculum: row.sourceCurriculumName, version: row.sourceVersion },
      destination: { recordId: row.destinationRecordId, version: row.destinationVersion },
      mappings: mappings.map(m => ({ sourceObjectiveId: m.sourceObjectiveId, sourceObjectiveVersion: m.sourceObjectiveVersion, title: evidence.find(o => o.id === m.sourceObjectiveId)?.title ?? "", decision: m.decision, targetOutcomeIds: m.targetOutcomeIds, reviewedAt: m.reviewedAt })),
      consentExpiresAt: row.consentExpiresAt, exportedAt: downloads.at(-1)!.at,
    };
  });
}

// ─── Family side: a guardian with a current learning-records grant consents, chooses fields and expiry, or withdraws.

async function guardianCase(tx: TxClient, user: AuthUser, caseId: string) {
  if (user.role !== "PARENT") throw new ApiError("Only a guardian can decide on this transfer.", 403);
  const row = await tx.learningTransferCase.findFirst({ where: { id: caseId, schoolId: user.schoolId } });
  if (!row) throw new ApiError("Not found.", 404);
  const link = await tx.guardianRelationship.findFirst({ where: { ...liveGuardianRelationshipWhere(user.userId, "learningRecords", new Date(), user.schoolId), studentId: row.studentId }, select: { id: true } });
  if (!link) throw new ApiError("Not found.", 404);
  return row;
}

export async function listFamilyTransfers(user: AuthUser) {
  if (user.role !== "PARENT") throw new ApiError("Only a guardian can decide on this transfer.", 403);
  return schoolAiTransaction(user, async tx => {
    const links = await tx.guardianRelationship.findMany({ where: liveGuardianRelationshipWhere(user.userId, "learningRecords", new Date(), user.schoolId), select: { studentId: true, student: { select: { fullName: true } } } });
    const rows = await tx.learningTransferCase.findMany({ where: { schoolId: user.schoolId, studentId: { in: links.map(l => l.studentId) } }, orderBy: { createdAt: "desc" }, take: 20 });
    return rows.map(row => ({ id: row.id, child: links.find(l => l.studentId === row.studentId)?.student.fullName ?? "", institution: row.sourceInstitution, curriculumName: row.sourceCurriculumName, version: row.sourceVersion, objectives: (row.evidence as Evidence).objectives.length, rights: rights(row), fields: row.consentScope as string[], expiresAt: row.consentExpiresAt, downloads: (row.downloads as unknown[]).length }));
  });
}

export async function decideFamilyConsent(user: AuthUser, raw: unknown, decision: "GRANT" | "REVOKE") {
  return schoolAiTransaction(user, async tx => {
    if (decision === "REVOKE") {
      const { caseId } = z.object({ caseId: id }).strict().parse(raw);
      const row = await guardianCase(tx, user, caseId);
      await tx.learningTransferCase.update({ where: { id: row.id }, data: { consentRevokedAt: new Date(), version: { increment: 1 } } });
      await writeAuditEvent(tx, user, { table: "learning_transfer_cases", recordId: row.id, action: "REVOKE", campusId: row.campusId, after: { consent: "REVOKED" } });
      return { rights: "REVOKED" as const, downloadsBefore: (row.downloads as unknown[]).length };
    }
    const input = consentSchema.parse(raw);
    if (input.expiresOn <= today()) throw new ApiError("Choose an expiry date in the future.", 400);
    const row = await guardianCase(tx, user, input.caseId);
    await tx.learningTransferCase.update({ where: { id: row.id }, data: { consentGuardianId: user.userId, consentScope: [...new Set(input.fields)], consentGrantedAt: new Date(), consentExpiresAt: new Date(`${input.expiresOn}T23:59:59.000Z`), consentRevokedAt: null, version: { increment: 1 } } });
    await writeAuditEvent(tx, user, { table: "learning_transfer_cases", recordId: row.id, action: "GRANT", campusId: row.campusId, after: { consent: "GRANTED", fields: input.fields.join(","), expiresOn: input.expiresOn } });
    return { rights: "GRANTED" as const };
  });
}
