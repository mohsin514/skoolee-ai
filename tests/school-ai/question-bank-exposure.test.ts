import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import type { TxClient } from "../../src/lib/db/prisma";
import type { WorkspacePermissionSnapshot } from "../../src/lib/school-ai/access";
import { bankReuseEligibility, exposureMatches, mergeBankReuseEligibility, type BankExposureFact } from "../../src/lib/school-ai/question-bank-exposure";
import { loadBankExposureFacts } from "../../src/lib/school-ai/question-bank-exposure-service";
import { prepareQuestionReuseInTransaction, validatePaperBankProvenance } from "../../src/lib/school-ai/question-bank-service";
import { assessmentFixture } from "./assessment-fixture";
import { questionBankExposureCopy } from "../../src/components/school-ai/question-bank-exposure-copy";

const now = new Date("2026-10-15T09:00:00.000Z"), future = new Date("2099-01-01T09:00:00.000Z"), past = new Date("2026-01-01T09:00:00.000Z");
const identity = { paperId: "source-paper", questionId: "q1" };
const fact = (overrides: Partial<BankExposureFact> = {}): BankExposureFact => ({ ...identity, itemGroupId: "q1", examDate: future, ...overrides });
const baseline = { identity, sourceArchived: false, sealedForm: false, activeExam: false, exposures: [] as BankExposureFact[], historyLimited: false, now };

test("no exposure evidence never becomes affirmative practice or sharing authorization", () => {
  const result = bankReuseEligibility(baseline);
  assert.equal(result.reuse, "NO_RECORDED_CONFLICT"); assert.equal(result.practice, "NOT_EVALUATED");
  assert.deepEqual(result.reasons, []); assert.equal(result.recordedExposureCount, 0);
  assert.equal(result.lastExposureAt, null); assert.equal(result.nextExposureAt, null);
});
test("future exposure blocks; past exposure is factual history without an invented retirement policy", () => {
  const result = bankReuseEligibility({ ...baseline, exposures: [fact({ examDate: past }), fact()] });
  assert.equal(result.reuse, "BLOCKED"); assert.deepEqual(result.reasons, ["FUTURE_EXPOSURE"]);
  assert.equal(result.lastExposureAt, past.toISOString()); assert.equal(result.nextExposureAt, future.toISOString());
  assert.equal(result.recordedExposureCount, 2);
  assert.equal(bankReuseEligibility({ ...baseline, exposures: [fact({ examDate: past })] }).reuse, "NO_RECORDED_CONFLICT");
});
test("bare q1 identity never inherits another paper's exposure but explicit shared groups do", () => {
  const unrelated = fact({ paperId: "unrelated-paper" });
  assert.equal(exposureMatches(identity, unrelated), false);
  assert.equal(bankReuseEligibility({ ...baseline, exposures: [unrelated] }).reuse, "NO_RECORDED_CONFLICT");
  assert.equal(exposureMatches({ ...identity, explicitItemGroupId: "q1" }, unrelated), true);
  assert.equal(exposureMatches(identity, fact({ questionId: "q2" })), false);
});
test("archive, sealed release, unfinished active exam and truncated history produce separate refusal reasons", () => {
  const result = bankReuseEligibility({ ...baseline, sourceArchived: true, sealedForm: true, activeExam: true, historyLimited: true });
  assert.deepEqual(result.reasons, ["SOURCE_ARCHIVED", "SEALED_FORM", "ACTIVE_EXAM", "HISTORY_LIMIT"]);
  assert.equal(result.practice, "NOT_EVALUATED");
});
test("origin restrictions survive copies without double-counting exposure history", () => {
  const own = bankReuseEligibility({ ...baseline, exposures: [fact({ examDate: past })] });
  const origin = bankReuseEligibility({ ...baseline, sealedForm: true, exposures: [fact()] });
  const combined = mergeBankReuseEligibility(own, origin);
  assert.equal(combined.reuse, "BLOCKED"); assert.deepEqual(combined.reasons, ["FUTURE_EXPOSURE", "SEALED_FORM"]);
  assert.equal(combined.recordedExposureCount, 1); assert.equal(combined.nextExposureAt, future.toISOString());
  assert.deepEqual(own.reasons, []);
});

// This adapter runs the real service boundary without connecting to a database.
const user: AuthUser = { userId: "author", schoolId: "school-a", campusId: "campus-a", role: "ADMIN", email: "synthetic@example.invalid", accessVersion: 4 };
const permissions = new Map(["ai", "exams"].map(module => [module, { canView: true, canAdd: true, canEdit: true, canDelete: true }])) as WorkspacePermissionSnapshot;
function fixture() {
  const { paper, curriculum } = assessmentFixture();
  const source = { id: identity.paperId, kind: "PAPER", schoolId: user.schoolId, campusId: user.campusId!, status: "APPROVED", version: 2, data: paper, createdById: user.userId };
  const target = { ...source, id: paper.curriculumId, kind: "CURRICULUM", version: paper.curriculumVersion, data: curriculum };
  const sourceRevision = { recordId: source.id, version: 2, status: "APPROVED", schoolId: user.schoolId, campusId: user.campusId, data: structuredClone(paper), title: "Approved source", createdAt: past };
  const curriculumRevision = { ...sourceRevision, recordId: target.id, version: paper.curriculumVersion, data: curriculum };
  const state = { actorActive: true, accessVersion: 4, subjectAllowed: true, examsAllowed: true, sealed: false, activeExam: false, exposures: [] as BankExposureFact[], records: [source, target], revisions: [sourceRevision, curriculumRevision], calls: [] as Array<{ model: string; query: unknown }> };
  const tx = {
    user: { findFirst: async () => state.actorActive ? { accessVersion: state.accessVersion } : null },
    rolePermission: { findMany: async () => ["ai", "exams"].map(module => ({ module, canView: module !== "exams" || state.examsAllowed, canAdd: true, canEdit: true, canDelete: true })) },
    subject: { findFirst: async () => state.subjectAllowed ? { id: paper.subjectId } : null },
    schoolAiRecord: { findFirst: async ({ where }: { where: Record<string, unknown> }) => state.records.find(record => record.id === where.id && record.schoolId === where.schoolId && (!where.campusId || record.campusId === where.campusId) && (!where.status || record.status === where.status) && (!where.version || record.version === where.version) && (!where.createdById || record.createdById === where.createdById)) ?? null },
    schoolAiRevision: { findFirst: async ({ where }: { where: Record<string, unknown> }) => state.revisions.find(revision => revision.recordId === where.recordId && revision.version === where.version && revision.schoolId === where.schoolId && revision.campusId === where.campusId) ?? null },
    schoolAiExposureEntry: { findMany: async (query: unknown) => { state.calls.push({ model: "exposure", query }); return state.exposures; } },
    schoolAiExamFormRelease: { findFirst: async (query: unknown) => { state.calls.push({ model: "release", query }); return state.sealed ? { id: "sealed" } : null; } },
    schoolAiExamAssignment: { findFirst: async (query: unknown) => { state.calls.push({ model: "assignment", query }); return state.activeExam ? { id: "assigned" } : null; } },
  } as unknown as TxClient;
  const input = { source: { paperId: source.id, paperVersion: 2, questionId: "q1" }, paper: { ...structuredClone(paper), questions: [] }, sectionId: paper.questions[0].sectionId, mappings: [{ sourceOutcomeId: "outcome-1", targetOutcomeId: "outcome-1" }], alignmentConfirmed: true };
  return { state, tx, input, source, sourceRevision, paper };
}

test("real reuse service accepts a scoped reviewed copy without mutating source or issued snapshots", async () => {
  const f = fixture(), before = JSON.stringify([f.source, f.sourceRevision]);
  const copied = await prepareQuestionReuseInTransaction(user, f.input, f.tx, now);
  assert.equal(copied.paper.questions.length, 1); assert.equal(copied.paper.questions[0].reusedFrom?.paperId, identity.paperId);
  assert.equal(JSON.stringify([f.source, f.sourceRevision]), before); assert.equal(f.input.paper.questions.length, 0);
  assert(f.state.calls.every(call => !/create|update|delete/.test(call.model)));
});
test("each recorded restriction blocks direct reuse API service with a specific repair code", async () => {
  for (const [reason, change] of [
    ["FUTURE_EXPOSURE", (f: ReturnType<typeof fixture>) => { f.state.exposures = [fact()]; }],
    ["SEALED_FORM", (f: ReturnType<typeof fixture>) => { f.state.sealed = true; }],
    ["ACTIVE_EXAM", (f: ReturnType<typeof fixture>) => { f.state.activeExam = true; }],
    ["SOURCE_ARCHIVED", (f: ReturnType<typeof fixture>) => { f.source.status = "ARCHIVED"; }],
    ["HISTORY_LIMIT", (f: ReturnType<typeof fixture>) => { f.state.exposures = Array.from({ length: 501 }, () => fact({ examDate: past })); }],
  ] as const) {
    const f = fixture(); change(f);
    await assert.rejects(() => prepareQuestionReuseInTransaction(user, f.input, f.tx, now), { status: 409, code: `BANK_REUSE_${reason}` });
    assert.equal(f.input.paper.questions.length, 0);
  }
});
test("save validation rechecks a restriction added after a successful insertion preview", async () => {
  const f = fixture(), copied = await prepareQuestionReuseInTransaction(user, f.input, f.tx, now);
  f.state.exposures = [fact()];
  await assert.rejects(() => validatePaperBankProvenance(user, copied.paper, user.campusId!, f.tx, permissions), { status: 409, code: "BANK_REUSE_FUTURE_EXPOSURE" });
  f.state.exposures = []; f.source.status = "ARCHIVED";
  await assert.rejects(() => validatePaperBankProvenance(user, copied.paper, user.campusId!, f.tx, permissions), { status: 409, code: "BANK_REUSE_SOURCE_ARCHIVED" });
  assert.equal(f.sourceRevision.data.questions[0].prompt, f.paper.questions[0].prompt);
});
test("server refuses revoked membership, grants and subject assignment before returning any source", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.state.actorActive = false; },
    (f: ReturnType<typeof fixture>) => { f.state.accessVersion++; },
    (f: ReturnType<typeof fixture>) => { f.state.subjectAllowed = false; },
    (f: ReturnType<typeof fixture>) => { f.state.examsAllowed = false; },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(() => prepareQuestionReuseInTransaction(user, f.input, f.tx, now), { status: 403 });
    assert.equal(f.state.calls.length, 0);
  }
  const f = fixture();
  await assert.rejects(() => prepareQuestionReuseInTransaction({ ...user, role: "STUDENT" }, f.input, f.tx, now), { status: 403 });
  await assert.rejects(() => prepareQuestionReuseInTransaction({ ...user, campusId: "other-campus" }, f.input, f.tx, now), { status: 404 });
});
test("exposure reads bind tenant/campus, cross-version paper identity and explicit groups without fetching learner data", async () => {
  const f = fixture(); f.paper.itemGroupIds = { q1: "group-a" }; f.paper.formSet = { id: "forms", label: "A", blueprintHash: "a".repeat(64) };
  await loadBankExposureFacts(f.tx, user.schoolId, { paperId: identity.paperId, campusId: user.campusId!, paper: f.paper, sourceStatus: "APPROVED" }, now);
  for (const call of f.state.calls) {
    const query = call.query as { where: Record<string, unknown>; select: Record<string, boolean> };
    assert.equal(query.where.schoolId, user.schoolId); assert.equal(query.where.campusId, user.campusId);
    assert.equal(query.select.cohortIds, undefined); assert.equal(query.select.paperSnapshot, undefined); assert.equal(query.select.studentIds, undefined);
  }
  const exposure = f.state.calls.find(call => call.model === "exposure")!.query as { where: { OR: unknown[] }; take: number };
  assert.deepEqual(exposure.where.OR, [{ paperId: identity.paperId }, { itemGroupId: { in: ["group-a"] } }]); assert.equal(exposure.take, 501);
  const active = f.state.calls.find(call => call.model === "assignment")!.query as { where: { status: string; endsAt: { gt: Date } } };
  assert.equal(active.where.status, "ACTIVE"); assert.equal(active.where.endsAt.gt, now);
});
test("source lineage cannot launder a future restriction through an intermediate approved paper", async () => {
  const f = fixture();
  const original = structuredClone(f.source); original.id = "original";
  const originalRevision = structuredClone(f.sourceRevision); originalRevision.recordId = original.id;
  f.state.records.push(original); f.state.revisions.push(originalRevision);
  f.sourceRevision.data.questions[0].reusedFrom = { paperId: original.id, paperVersion: 2, questionId: "q1", curriculumId: f.paper.curriculumId, curriculumVersion: f.paper.curriculumVersion };
  f.state.exposures = [fact({ paperId: original.id })];
  await assert.rejects(() => prepareQuestionReuseInTransaction(user, f.input, f.tx, now), { status: 409, code: "BANK_REUSE_FUTURE_EXPOSURE" });
  originalRevision.data.questions[0].reusedFrom = { paperId: f.source.id, paperVersion: 2, questionId: "q1", curriculumId: f.paper.curriculumId, curriculumVersion: f.paper.curriculumVersion };
  await assert.rejects(() => prepareQuestionReuseInTransaction(user, f.input, f.tx, now), { status: 409, code: "BANK_LINEAGE_UNAVAILABLE" });
});
test("every factual refusal and practice limitation has EN, AR and UR copy", () => {
  for (const locale of ["en", "ar", "ur"] as const) {
    const copy = questionBankExposureCopy(locale);
    assert.equal(Object.keys(copy.reasons).length, 5); assert(Object.values(copy.reasons).every(Boolean)); assert(copy.practice && copy.repair);
  }
});
