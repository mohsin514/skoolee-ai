import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentFixture } from "./assessment-fixture";
import { revisedDraftFrom, paperDataSchema } from "../../src/lib/school-ai/assessment";
import { preparePaperContentWrite } from "../../src/lib/school-ai/item-review";

const actor = { actorId: "teacher-1", at: "2026-10-23T08:00:00.000Z" };

test("a revised draft of a reviewed, rehearsed, form-set, requested paper saves as a new record", () => {
  const { paper } = assessmentFixture();
  const reviewed = paperDataSchema.parse({
    ...paper, slotId: "slot-1", formSet: { id: "set-1", label: "A", blueprintHash: "a".repeat(64) }, itemGroupIds: { [paper.questions[0].id]: "group-1" },
    staleness: { rehearsalValid: true, rehearsalId: "rehearsal-1" },
    questions: paper.questions.map(question => ({ ...question, review: { state: "APPROVED", itemRevision: 1, approvedBy: { actorId: "hod-1", at: actor.at, itemRevision: 1 }, invalidated: [], history: [{ state: "APPROVED", actorId: "hod-1", at: actor.at }] } })),
  });
  assert.throws(() => preparePaperContentWrite(null, reviewed, actor), "the old clone carried review history into a new record");
  const draft = revisedDraftFrom(reviewed);
  assert.doesNotThrow(() => preparePaperContentWrite(null, draft, actor));
  assert.equal(draft.formSet, undefined); assert.equal(draft.itemGroupIds, undefined); assert.equal(draft.staleness, undefined); assert.equal(draft.slotId, undefined);
  assert.ok(draft.questions.every(question => question.review === undefined));
  assert.deepEqual(draft.questions.map(question => question.prompt), reviewed.questions.map(question => question.prompt));
});

test("Safe Exam Browser: every sitting of a profile serves the same file, starting at the exams list", async () => {
  const { profileConfigFile } = await import("../../src/lib/school-ai/secure-browser-service");
  const profile = { allowedResources: ["https://cdn.example.org/"] };
  const a = profileConfigFile(profile, "https://school.example.org/");
  const b = profileConfigFile(profile, "https://school.example.org");
  assert.equal(a, b, "byte-identical, so one registered Config Key admits every sitting");
  assert.match(a, /<key>startURL<\/key><string>https:\/\/school\.example\.org\/ai\/exams<\/string>/);
  assert.doesNotMatch(a, /\/ai\/exams\/[a-z0-9-]{8,}/i, "no per-exam start URL");
});

test("a sealed snapshot edited after sealing no longer verifies, so it cannot be printed", async () => {
  const { contentHash, contentHashPrefix, verifyContentHash } = await import("../../src/lib/school-ai/release");
  const { paper } = assessmentFixture();
  const seal = contentHash(paper);
  const ok = verifyContentHash(paper, seal);
  assert.equal(ok.matches, true);
  if (ok.matches) assert.equal(ok.prefix, contentHashPrefix(seal), "the printed footer prefix is the sitting's stored prefix");
  const edited = { ...paper, questions: paper.questions.map((question, index) => index === 0 ? { ...question, prompt: `${question.prompt} (edited)` } : question) };
  const bad = verifyContentHash(edited, seal);
  assert.equal(bad.matches, false);
  if (!bad.matches) assert.notEqual(bad.recomputedPrefix, bad.storedPrefix);
});
