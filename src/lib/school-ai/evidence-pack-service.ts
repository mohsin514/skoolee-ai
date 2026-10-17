import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import type { TxClient } from "@/lib/db/prisma";
import { buildManifest, canonicalJson, packArchive, redactProtectedKeys, verifyManifest, type EvidenceFile, type EvidenceGap, type EvidenceRecordRef, type IntegrityManifest } from "./evidence-pack";
import { scopedAssignment, staffExamAccess } from "./exam-service";
import { assertStudioAction, recordStudioAction } from "./studio-access";
import { schoolAiTransaction } from "./transaction";

// SKO-408 R19: one export with the complete chain of an assessment or of one attempt, its
// Integrity_Manifest and an audit of who produced and downloaded it. The pack is frozen when it is
// produced — the stored files are what every later download serves — so later activity (a new
// appeal, a regrade) never makes an existing manifest disagree with its files.

export const evidencePackRequestSchema = z.strictObject({
  scope: z.enum(["ASSESSMENT", "ATTEMPT"]).default("ASSESSMENT"),
  attemptId: z.string().min(1).max(120).optional(),
  includeKeys: z.boolean().default(false),
  includeCapture: z.boolean().default(false),
  captureReason: z.string().trim().min(10).max(500).optional(),
});

/** Accumulates the pack's files, record references and gaps, redacting keys unless they are included. */
function collector(includeKeys: boolean) {
  const files: EvidenceFile[] = [], records: EvidenceRecordRef[] = [], gaps: EvidenceGap[] = [];
  let keysRemoved = 0;
  return {
    files, records, gaps,
    keysRemoved: () => keysRemoved,
    add(path: string, value: unknown, refs: EvidenceRecordRef[] = []) {
      const shaped = includeKeys ? value : (() => { const result = redactProtectedKeys(value); keysRemoved += result.removed; return result.value; })();
      files.push({ path, content: canonicalJson(shaped) });
      records.push(...refs);
    },
    gap(entry: EvidenceGap) { gaps.push(entry); },
  };
}

/** The revision of a record as it stood for this assessment: the named version, else the latest at or before `asOf`. */
async function revisionOf(tx: TxClient, schoolId: string, recordId: string, version: number | null, asOf: Date) {
  return tx.schoolAiRevision.findFirst({
    where: { schoolId, recordId, ...(version !== null ? { version } : { createdAt: { lte: asOf } }) },
    orderBy: { version: "desc" },
    select: { recordId: true, version: true, action: true, title: true, status: true, data: true, actorId: true, createdAt: true },
  });
}

async function gather(tx: TxClient, user: AuthUser, assignmentId: string, attemptId: string | null, input: { includeKeys: boolean; includeCapture: boolean }) {
  const { assignment, student } = await scopedAssignment(user, assignmentId, tx);
  if (student) throw new ApiError("Exam unavailable.", 404);
  const pack = collector(input.includeKeys);
  const schoolId = user.schoolId, campusId = assignment.campusId;
  const fence = { schoolId, campusId };

  // Approved paper revision: items, keys, rubrics, blueprint and coverage section (R19.1).
  const paper = await revisionOf(tx, schoolId, assignment.paperId, assignment.paperVersion, assignment.createdAt);
  if (paper) pack.add("records/paper.json", paper, [{ type: "paper", id: paper.recordId, version: paper.version }]);
  else pack.gap({ type: "paper", id: assignment.paperId, version: assignment.paperVersion, reason: "approved paper revision not found" });
  const paperData = (paper?.data ?? {}) as { curriculumId?: string; curriculumVersion?: number };
  if (paperData.curriculumId) {
    const curriculum = await revisionOf(tx, schoolId, paperData.curriculumId, paperData.curriculumVersion ?? null, assignment.createdAt);
    if (curriculum) pack.add("records/source-curriculum.json", curriculum, [{ type: "curriculum", id: curriculum.recordId, version: curriculum.version }]);
    else pack.gap({ type: "curriculum", id: paperData.curriculumId, version: paperData.curriculumVersion ?? null, reason: "approved source revision not found" });
  }

  // Released form(s) with their Content_Hash, and the brief they were built from.
  if (assignment.formSetId) {
    const formSet = await tx.schoolAiExamFormSet.findFirst({ where: { id: assignment.formSetId, ...fence } });
    if (formSet) {
      pack.add("release/form-set.json", formSet, [{ type: "form_set", id: formSet.id, version: formSet.version }]);
      if (formSet.briefRecordId) {
        const brief = await revisionOf(tx, schoolId, formSet.briefRecordId, null, assignment.createdAt);
        if (brief) pack.add("records/brief.json", brief, [{ type: "brief", id: brief.recordId, version: brief.version }]);
        else pack.gap({ type: "brief", id: formSet.briefRecordId, version: null, reason: "brief revision not found" });
      }
    } else pack.gap({ type: "form_set", id: assignment.formSetId, version: null, reason: "form set not found" });
    const releases = await tx.schoolAiExamFormRelease.findMany({ where: { formSetId: assignment.formSetId, ...fence }, orderBy: { releasedAt: "asc" } });
    pack.add("release/form-releases.json", releases, releases.map(row => ({ type: "form_release", id: row.id, version: row.paperVersion })));
  }
  if (assignment.rehearsalId) {
    const rehearsal = await tx.schoolAiRehearsal.findFirst({ where: { id: assignment.rehearsalId, ...fence } });
    if (rehearsal) pack.add("release/rehearsal.json", rehearsal, [{ type: "rehearsal", id: rehearsal.id, version: rehearsal.paperVersion }]);
    else pack.gap({ type: "rehearsal", id: assignment.rehearsalId, version: null, reason: "rehearsal record not found" });
  }

  // Assignment, accommodations, Delivery_Policy and the release of results.
  const { paperSnapshot, ...assignmentRow } = assignment as typeof assignment & { paperSnapshot: unknown };
  pack.add("assignment.json", { ...assignmentRow, contentHash: assignment.contentHash, deliveryPolicy: assignment.proctorPolicy, released: { at: assignment.resultsReleasedAt, by: assignment.resultsReleasedById } }, [{ type: "assignment", id: assignment.id, version: assignment.version }]);
  pack.add("release/candidate-paper-snapshot.json", paperSnapshot);
  if (assignment.secureProfileId) {
    const profile = await revisionOf(tx, schoolId, assignment.secureProfileId, assignment.secureProfileVersion ?? null, assignment.createdAt);
    if (profile) pack.add("records/delivery-policy.json", profile, [{ type: "delivery_policy", id: profile.recordId, version: profile.version }]);
    else pack.gap({ type: "delivery_policy", id: assignment.secureProfileId, version: assignment.secureProfileVersion ?? null, reason: "delivery policy revision not found" });
  }

  // Attempts with receipts, moderation, result versions, integrity signals, sessions and appeals.
  const attemptWhere = { assignmentId, ...fence, ...(attemptId ? { id: attemptId } : {}) };
  const attempts = await tx.schoolAiExamAttempt.findMany({ where: attemptWhere, orderBy: { startedAt: "asc" } });
  if (attemptId && !attempts.length) throw new ApiError("Attempt unavailable.", 404);
  for (const attempt of attempts) {
    pack.add(`attempts/${attempt.id}.json`, { ...attempt, receipt: { submittedAt: attempt.submittedAt, sequence: attempt.sequence, status: attempt.status } }, [{ type: "attempt", id: attempt.id, version: attempt.sequence }]);
  }
  const attemptIds = attempts.map(row => row.id);
  const scopedToAttempts = { ...fence, assignmentId, ...(attemptId ? { attemptId: { in: attemptIds } } : {}) };
  const [results, signals, appeals, pauses, sessions] = await Promise.all([
    tx.schoolAiExamResultRevision.findMany({ where: scopedToAttempts, orderBy: [{ attemptId: "asc" }, { version: "asc" }] }),
    tx.schoolAiExamIntegrityEvent.findMany({ where: scopedToAttempts, orderBy: { receivedAt: "asc" } }),
    tx.schoolAiExamAppeal.findMany({ where: scopedToAttempts, orderBy: { createdAt: "asc" } }),
    tx.schoolAiExamPause.findMany({ where: scopedToAttempts, orderBy: { startedAt: "asc" } }),
    tx.schoolAiProctorSession.findMany({ where: { ...fence, assignmentId, ...(attemptId ? { attemptId: { in: attemptIds } } : {}) } }),
  ]);
  pack.add("results/result-versions.json", results, results.map(row => ({ type: "result_version", id: row.id, version: row.version })));
  pack.add("integrity/signals.json", signals, signals.map(row => ({ type: "integrity_signal", id: row.id, version: row.version })));
  pack.add("appeals.json", appeals, appeals.map(row => ({ type: "appeal", id: row.id, version: row.version })));
  pack.add("delivery/pauses.json", pauses, pauses.map(row => ({ type: "pause", id: row.id, version: null })));
  pack.add("delivery/admission-sessions.json", sessions, sessions.map(row => ({ type: "admission_session", id: row.id, version: null })));
  if (!attemptId) {
    const [remedies, clarifications] = await Promise.all([
      tx.schoolAiExamRemedy.findMany({ where: { ...fence, assignmentId }, orderBy: { createdAt: "asc" } }),
      tx.schoolAiExamClarification.findMany({ where: { ...fence, assignmentId }, orderBy: { version: "asc" } }),
    ]);
    pack.add("delivery/remedies.json", remedies, remedies.map(row => ({ type: "remedy", id: row.id, version: null })));
    pack.add("delivery/clarifications.json", clarifications, clarifications.map(row => ({ type: "clarification", id: row.id, version: row.version })));
  }

  // R19.7: capture recordings stay out unless separately authorized; when they are, the pack
  // references each recording by its checksum and storage key rather than embedding media.
  if (input.includeCapture) {
    const clips = await tx.schoolAiProctorClip.findMany({ where: { ...fence, sessionId: { in: sessions.map(row => row.id) }, deletedAt: null }, select: { id: true, sessionId: true, sequence: true, checksum: true, mimeType: true, bytes: true, storageKey: true, createdAt: true } });
    pack.add("capture/recordings.json", clips, clips.map(row => ({ type: "capture_recording", id: row.id, version: row.sequence })));
  }
  return { assignment, pack };
}

/** R19.1–R19.11: produce, verify, store and audit a pack. Returns its id and manifest. */
export async function produceEvidencePack(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = evidencePackRequestSchema.parse(raw ?? {});
  if (input.scope === "ATTEMPT" && !input.attemptId) throw new ApiError("Choose the attempt to export.", 400);
  if (input.includeCapture && !input.captureReason) throw new ApiError("Give a reason for including capture recordings.", 400);
  return schoolAiTransaction(user, async tx => {
    const { assignment } = await scopedAssignment(user, assignmentId, tx);
    await staffExamAccess(user, assignment, "view", tx);
    const context = { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, classId: assignment.classId };
    const role = await assertStudioAction(user, "EXPORT_EVIDENCE_PACK", context, undefined, tx);
    // R19.5, R19.7: keys and recordings each need their own right, checked separately.
    if (input.includeKeys) await assertStudioAction(user, "READ_PROTECTED_KEY", context, undefined, tx);
    if (input.includeCapture) await assertStudioAction(user, "READ_CAPTURE", context, undefined, tx);
    const { pack } = await gather(tx, user, assignmentId, input.scope === "ATTEMPT" ? input.attemptId! : null, input);
    const generatedAt = new Date();
    const manifest: IntegrityManifest = buildManifest({ generatedAt: generatedAt.toISOString(), scope: { kind: input.scope, id: input.scope === "ATTEMPT" ? input.attemptId! : assignmentId, schoolId: user.schoolId, campusId: assignment.campusId }, includedKeys: input.includeKeys, includedCapture: input.includeCapture, files: pack.files, records: pack.records, gaps: pack.gaps });
    const problems = verifyManifest(manifest, pack.files);
    if (problems.length) throw new ApiError(`The evidence pack failed its own verification: ${problems.join("; ")}`, 500);
    const stored = await tx.schoolAiEvidencePack.create({ data: {
      schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, scopeKind: input.scope, scopeId: manifest.scope.id, manifest: manifest as never, files: pack.files as never,
      includedKeys: input.includeKeys, includedCapture: input.includeCapture, captureReason: input.includeCapture ? input.captureReason! : null, requestedById: user.userId, requestedAt: generatedAt,
    } });
    await recordStudioAction(tx, user, { action: "EXPORT_EVIDENCE_PACK", role, targetId: stored.id, targetVersion: 1, at: generatedAt, campusId: assignment.campusId });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "school_ai_evidence_packs", recordId: stored.id, newValue: {
      event: "evidence_pack.produced", scope: manifest.scope, includedKeys: input.includeKeys, includedCapture: input.includeCapture, captureReason: input.includeCapture ? input.captureReason : undefined,
      records: manifest.records, gaps: manifest.gaps, keysRedacted: input.includeKeys ? 0 : pack.keysRemoved(), at: generatedAt.toISOString(),
    } as never } });
    return { packId: stored.id, manifest };
  });
}

/** Packs for one assessment, newest first, with who produced and last downloaded each. */
export async function listEvidencePacks(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async tx => {
    const { assignment } = await scopedAssignment(user, assignmentId, tx);
    await staffExamAccess(user, assignment, "view", tx);
    await assertStudioAction(user, "EXPORT_EVIDENCE_PACK", { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, classId: assignment.classId }, undefined, tx);
    const rows = await tx.schoolAiEvidencePack.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId }, orderBy: { requestedAt: "desc" }, take: 20, select: { id: true, scopeKind: true, scopeId: true, includedKeys: true, includedCapture: true, requestedById: true, requestedAt: true, downloadedAt: true, manifest: true } });
    return rows.map(row => { const manifest = row.manifest as unknown as IntegrityManifest; return { ...row, manifest: undefined, files: manifest.files.length, records: manifest.records.length, gaps: manifest.gaps }; });
  });
}

/** R19.8: the stored pack as a ZIP; access re-checked and the download audited. */
export async function downloadEvidencePack(user: AuthUser, assignmentId: string, packId: string) {
  return schoolAiTransaction(user, async tx => {
    const { assignment } = await scopedAssignment(user, assignmentId, tx);
    await staffExamAccess(user, assignment, "view", tx);
    const context = { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, classId: assignment.classId };
    const role = await assertStudioAction(user, "EXPORT_EVIDENCE_PACK", context, undefined, tx);
    const pack = await tx.schoolAiEvidencePack.findFirst({ where: { id: packId, schoolId: user.schoolId, campusId: assignment.campusId, assignmentId } });
    if (!pack) throw new ApiError("Evidence pack unavailable.", 404);
    // A pack with keys or recordings is served only to someone who may read them today.
    if (pack.includedKeys) await assertStudioAction(user, "READ_PROTECTED_KEY", context, undefined, tx);
    if (pack.includedCapture) await assertStudioAction(user, "READ_CAPTURE", context, undefined, tx);
    const manifest = pack.manifest as unknown as IntegrityManifest, files = pack.files as unknown as EvidenceFile[];
    const problems = verifyManifest(manifest, files);
    if (problems.length) throw new ApiError("This evidence pack no longer matches its manifest.", 409);
    const at = new Date();
    await tx.schoolAiEvidencePack.update({ where: { id: pack.id }, data: { downloadedAt: at } });
    await recordStudioAction(tx, user, { action: "EXPORT_EVIDENCE_PACK", role, targetId: pack.id, targetVersion: 1, at, campusId: assignment.campusId });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "school_ai_evidence_packs", recordId: pack.id, newValue: { event: "evidence_pack.downloaded", scope: manifest.scope, records: manifest.records.length, includedKeys: pack.includedKeys, includedCapture: pack.includedCapture, at: at.toISOString() } as never } });
    return { filename: `evidence-pack-${manifest.scope.kind.toLowerCase()}-${manifest.scope.id}-${manifest.generatedAt.slice(0, 10)}.zip`, archive: packArchive(manifest, files) };
  });
}
