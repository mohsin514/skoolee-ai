import assert from "node:assert/strict";
import { test } from "node:test";
import type { SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import type { TxClient } from "../../src/lib/db/prisma";
import { paperDataSchema, validatePaperApproval, type PaperData } from "../../src/lib/school-ai/assessment";
import { preparePaperContentWrite } from "../../src/lib/school-ai/item-review";
import { updateWorkspaceRecordInTransaction } from "../../src/lib/school-ai/repository";
import type { WorkspacePermissionSnapshot } from "../../src/lib/school-ai/access";
import { assessmentFixture } from "./assessment-fixture";

const originalAt = "2026-01-01T08:00:00.000Z";
const actor = { actorId: "author-now", at: "2026-10-15T09:00:00.000Z" };
function reviewed(): PaperData {
  const { paper } = assessmentFixture();
  return { ...paper, staleness: { rehearsalValid: true, rehearsalId: "rehearsal-1" }, questions: paper.questions.map(question => ({
    ...question, review: { state: "APPROVED", itemRevision: 3, approvedBy: { actorId: "prior-approver", at: originalAt, itemRevision: 3 }, invalidated: [], history: [{ state: "APPROVED", actorId: "prior-approver", at: originalAt }] },
  })) };
}
function frozen<T>(value: T): T {
  if (value && typeof value === "object") Object.values(value).forEach(frozen);
  return Object.freeze(value);
}

test("normal save invalidates an edited key, rubric and prompt once with server actor/time", () => {
  const previous = frozen(reviewed()), incoming = structuredClone(previous);
  Object.assign(incoming.questions[0], { prompt: "What is 3 + 3?", correctOptionId: "a2", modelAnswer: "Six.", rubric: [{ id: "r1", criterion: "Selects six", marks: 2 }] });
  const saved = preparePaperContentWrite(previous, incoming, actor);
  const review = saved.questions[0].review!;
  assert.equal(review.state, "CHANGED_AFTER_APPROVAL"); assert.equal(review.itemRevision, 4);
  assert.deepEqual(review.approvedBy, previous.questions[0].review!.approvedBy);
  assert(review.invalidated.some(entry => entry.artifact === "KEY"));
  assert(review.invalidated.some(entry => entry.artifact === "RUBRIC"));
  assert(review.invalidated.every(entry => entry.actorId === actor.actorId && entry.at === actor.at));
  assert.equal(review.history.at(-1)?.actorId, actor.actorId);
  assert.equal(saved.staleness?.rehearsalValid, false); assert.equal(saved.staleness?.rehearsalId, "rehearsal-1");
  assert.deepEqual(saved.questions[1], previous.questions[1]);
  assert.equal(previous.questions[0].review!.state, "APPROVED");
  assert.equal(incoming.questions[0].review!.state, "APPROVED", "input payload and issued snapshots are unchanged");
  paperDataSchema.parse(saved);
});

test("omitted metadata cannot erase review, invalidation or rehearsal history", () => {
  const previous = reviewed(), incoming = structuredClone(previous);
  incoming.questions.forEach(question => { delete question.review; }); delete incoming.staleness;
  assert.deepEqual(preparePaperContentWrite(previous, incoming, actor), previous);
  incoming.questions[0].prompt = "An edited premise";
  const saved = preparePaperContentWrite(previous, incoming, actor);
  assert.equal(saved.questions[0].review!.state, "CHANGED_AFTER_APPROVAL");
  const stripped = structuredClone(saved); stripped.questions.forEach(question => { delete question.review; }); delete stripped.staleness;
  assert.deepEqual(preparePaperContentWrite(saved, stripped, actor), saved);
});

test("content saves reject fabricated approvals, reviewer identity, history and rehearsal results", () => {
  const previous = reviewed();
  const attempts: Array<(paper: PaperData) => void> = [
    paper => { paper.questions[0].review!.approvedBy!.actorId = "invented-approver"; },
    paper => { paper.questions[0].review!.history = []; },
    paper => { paper.questions[0].review!.itemRevision++; },
    paper => { paper.staleness!.rehearsalId = "invented-rehearsal"; },
  ];
  for (const change of attempts) {
    const incoming = structuredClone(previous); change(incoming);
    assert.throws(() => preparePaperContentWrite(previous, incoming, actor), { status: 403 });
  }
  const legacy = assessmentFixture().paper, forged = structuredClone(legacy); forged.questions[0].review = previous.questions[0].review;
  assert.throws(() => preparePaperContentWrite(legacy, forged, actor), { status: 403 });
  assert.throws(() => preparePaperContentWrite(null, previous, actor), { status: 403 });
  delete forged.questions[0].review; forged.staleness = { rehearsalValid: true, rehearsalId: "fake" };
  assert.throws(() => preparePaperContentWrite(null, forged, actor), { status: 403 });
});

test("a legacy paper remains compatible with normal authoring and paper approval", () => {
  const { paper, curriculum } = assessmentFixture();
  const incoming = structuredClone(paper); incoming.questions[0].prompt = "Select the total of two and two.";
  const saved = preparePaperContentWrite(paper, incoming, actor);
  assert.deepEqual(saved, incoming); assert.equal(saved.staleness, undefined);
  assert(saved.questions.every(question => question.review === undefined));
  assert.deepEqual(validatePaperApproval(saved, curriculum), []);
  assert.deepEqual(preparePaperContentWrite(null, incoming, actor), incoming);
});

test("changing item identity or deleting all reviewed items cannot restore legacy eligibility", () => {
  const previous = reviewed(), incoming = structuredClone(previous);
  incoming.questions = incoming.questions.map(question => { const { review: _old, ...content } = question; return { ...content, id: `${question.id}-new` }; });
  const saved = preparePaperContentWrite(previous, incoming, actor);
  assert(saved.questions.every(question => question.review?.state === "DRAFT" && question.review.itemRevision === 1));
  assert(validatePaperApproval(saved, assessmentFixture().curriculum).some(issue => issue.includes("Approve every item")));
  assert.equal(saved.staleness?.rehearsalValid, false);
});

test("reordering and plan changes invalidate rehearsal while retaining unchanged item decisions", () => {
  for (const change of [
    (paper: PaperData) => { paper.questions.reverse(); },
    (paper: PaperData) => { paper.blueprint.durationMinutes++; },
    (paper: PaperData) => { paper.resources = [{ id: "reference", title: "Table", content: "An approved reference", approved: true }]; },
  ]) {
    const previous = reviewed(), incoming = structuredClone(previous); change(incoming);
    const saved = preparePaperContentWrite(previous, incoming, actor);
    assert.equal(saved.staleness?.rehearsalValid, false);
    for (const question of saved.questions) assert.deepEqual(question.review, previous.questions.find(row => row.id === question.id)!.review);
  }
});

test("curriculum, language, question type and section changes invalidate the relevant review", () => {
  const previous = reviewed();
  const curriculum = preparePaperContentWrite(previous, { ...previous, curriculumVersion: 2 }, actor);
  assert(curriculum.questions.every(question => question.review?.state === "NEEDS_SOURCE"));
  const translated = preparePaperContentWrite(previous, { ...previous, language: "ar" }, actor);
  assert(translated.questions.every(question => question.review?.state === "CHANGED_AFTER_APPROVAL"));
  for (const change of [{ type: "MULTIPLE_CHOICE" as const }, { sectionId: "new-section" }]) {
    const incoming = structuredClone(previous); Object.assign(incoming.questions[0], change);
    assert.equal(preparePaperContentWrite(previous, incoming, actor).questions[0].review?.state, "CHANGED_AFTER_APPROVAL");
  }
});

test("duplicate IDs cannot alias an existing item's review authority", () => {
  const previous = reviewed(), incoming = structuredClone(previous);
  incoming.questions.push({ ...incoming.questions[0], prompt: "Different content under an approved ID" });
  assert.throws(() => preparePaperContentWrite(previous, incoming, actor), { status: 422 });
});

// In-memory transaction adapter: these tests execute the real repository service, not a database.
const user: AuthUser = { userId: actor.actorId, role: "ADMIN", schoolId: "school-a", campusId: "campus-a", email: "synthetic@example.invalid" };
const permissions: WorkspacePermissionSnapshot = new Map(["ai", "exams"].map(module => [module, { canView: true, canAdd: true, canEdit: true, canDelete: true }])) as WorkspacePermissionSnapshot;
function transactionFixture(paper: PaperData) {
  const common = { schoolId: user.schoolId, campusId: user.campusId, subjectId: paper.subjectId, classId: paper.classId, status: "APPROVED", version: 3, createdById: "prior-author", updatedById: "prior-approver", createdAt: new Date(originalAt), updatedAt: new Date(originalAt) };
  let stored = { ...common, id: "paper-1", kind: "PAPER", title: "Original", data: structuredClone(paper) } as unknown as SchoolAiRecord;
  const curriculum = { ...common, id: paper.curriculumId, kind: "CURRICULUM", version: paper.curriculumVersion, data: assessmentFixture().curriculum };
  const revisions: unknown[] = [], audits: unknown[] = [];
  let writes = 0;
  const tx = {
    schoolAiRecord: {
      findFirst: async ({ where }: { where: { id: string } }) => where.id === stored.id ? stored : where.id === curriculum.id ? curriculum : null,
      updateMany: async ({ where, data }: { where: { version: number }; data: Record<string, unknown> }) => {
        if (where.version !== stored.version) return { count: 0 };
        writes++; stored = { ...stored, ...data, version: stored.version + 1 } as SchoolAiRecord; return { count: 1 };
      },
      findFirstOrThrow: async () => stored,
    },
    subject: { findFirst: async () => ({ id: paper.subjectId }) },
    schoolAiRevision: { create: async ({ data }: { data: unknown }) => { revisions.push(data); return data; } },
    auditLog: { create: async ({ data }: { data: unknown }) => { audits.push(data); return data; } },
  } as unknown as TxClient;
  return { tx, revisions, audits, writes: () => writes };
}

test("repository normal save persists derived invalidation with a revision and audit", async () => {
  const previous = frozen(reviewed()), incoming = structuredClone(previous); incoming.questions[0].prompt = "Updated premise";
  const f = transactionFixture(previous), earliest = Date.now();
  const result = await updateWorkspaceRecordInTransaction(user, "paper-1", { version: 3, action: "save", data: incoming }, f.tx, permissions);
  const saved = paperDataSchema.parse(result.data);
  assert.equal(result.status, "DRAFT"); assert.equal(result.version, 4);
  assert.equal(saved.questions[0].review?.state, "CHANGED_AFTER_APPROVAL");
  assert.equal(saved.questions[0].review?.invalidated[0].actorId, user.userId);
  assert(Date.parse(saved.questions[0].review!.invalidated[0].at) >= earliest);
  assert.equal(f.writes(), 1); assert.equal(f.revisions.length, 1); assert.equal(f.audits.length, 1);
  assert.deepEqual((f.revisions[0] as { data: unknown }).data, saved);
  assert.equal(previous.questions[0].review!.state, "APPROVED");
});

test("repository rejects forged review metadata without any persistence", async () => {
  const previous = reviewed(), incoming = structuredClone(previous); incoming.questions[0].review!.approvedBy!.actorId = user.userId;
  const f = transactionFixture(previous);
  await assert.rejects(() => updateWorkspaceRecordInTransaction(user, "paper-1", { version: 3, action: "save", data: incoming }, f.tx, permissions), { status: 403, code: "PAPER_REVIEW_AUTHORITY" });
  assert.equal(f.writes(), 0); assert.equal(f.revisions.length, 0); assert.equal(f.audits.length, 0);
});

test("repository preserves current review on title-only saves and rejects stale record versions", async () => {
  const previous = reviewed(), f = transactionFixture(previous);
  const result = await updateWorkspaceRecordInTransaction(user, "paper-1", { version: 3, title: "Renamed", action: "save" }, f.tx, permissions);
  assert.deepEqual(result.data, previous);
  await assert.rejects(() => updateWorkspaceRecordInTransaction(user, "paper-1", { version: 3, title: "Stale title", action: "save" }, f.tx, permissions), { status: 409 });
  assert.equal(f.writes(), 1);
});
