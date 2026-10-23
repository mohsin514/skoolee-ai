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

test("conformance report: marks, duration, taught coverage, review and language against the office's request", async () => {
  const { conformanceReport, conformanceBlocking, signatureHolds } = await import("../../src/lib/school-ai/moderation");
  const { paper, curriculum } = assessmentFixture();
  const request = { totalMarks: paper.blueprint.totalMarks, durationMinutes: paper.blueprint.durationMinutes, languages: [paper.language] };
  const report = conformanceReport({ paper, request, curriculum });
  const byCode = Object.fromEntries(report.map(check => [check.code, check]));
  assert.equal(byCode.MARKS_MATCH_REQUEST.ok, true);
  assert.equal(byCode.DURATION_MATCHES_REQUEST.ok, true);
  assert.equal(byCode.ITEMS_REVIEWED.ok, false, "fixture items carry no review yet");
  const wrong = conformanceReport({ paper, request: { ...request, totalMarks: request.totalMarks + 10, languages: ["ar"] }, curriculum });
  assert.deepEqual(conformanceBlocking(wrong).map(check => check.code).filter(code => code !== "ITEMS_REVIEWED" && code !== "WITHIN_TAUGHT").sort(), ["LANGUAGE_REQUESTED", "MARKS_MATCH_REQUEST"]);
  assert.equal(signatureHolds({ decision: "SIGNED", contentHash: "h1" }, "h1"), true);
  assert.equal(signatureHolds({ decision: "SIGNED", contentHash: "h1" }, "h2"), false, "any content change after signing undoes it");
  assert.equal(signatureHolds({ decision: "RETURNED", contentHash: "h1" }, "h1"), false);
  assert.equal(signatureHolds(null, "h1"), false);
});

test("rehearsal 2.0: empty option text blocks; a clean fixture passes the new checks", async () => {
  const { automatedRehearsal } = await import("../../src/lib/school-ai/exam-release-service");
  const { paper } = assessmentFixture();
  assert.deepEqual(automatedRehearsal(paper).map(result => result.check), []);
  const choiceIndex = paper.questions.findIndex(question => question.options.length >= 2);
  const broken = { ...paper, questions: paper.questions.map((question, index) => index === choiceIndex ? { ...question, options: question.options.map((option, at) => at === 1 ? { ...option, text: " " } : option) } : question) };
  const results = automatedRehearsal(broken);
  assert.deepEqual(results.map(result => [result.check, result.severity]), [["OPTION_TEXT_EMPTY", "BLOCKING"]]);
});

test("taught-after-sitting: an outcome taught after the sitting date, or never, is flagged per section", async () => {
  const { taughtAfterSitting } = await import("../../src/lib/school-ai/teaching-progress");
  const curriculum = { outcomes: [{ id: "o1", taught: true }, { id: "o2", taught: false }, { id: "o3", taught: false }] } as never;
  const rows = [{ outcomeId: "o2", taughtOn: "2026-11-05" }];
  assert.deepEqual(taughtAfterSitting(["o1", "o2", "o3"], curriculum, rows, "2026-11-01"), ["o2", "o3"]);
  assert.deepEqual(taughtAfterSitting(["o1", "o2"], curriculum, rows, "2026-11-10"), []);
});

test("uploaded paper: numbered questions, options, marks and an answer key become a draft paper whose marks add up", async () => {
  const { readPaperText, paperFromReading } = await import("../../src/lib/school-ai/paper-upload");
  const text = [
    "Grade 7 Science Mid-term",
    "1. Which gas do plants take in? [1]",
    "a) Oxygen", "b) Carbon dioxide", "c) Nitrogen",
    "2) Name two things a plant needs for photosynthesis. (2 marks)",
    "Q3. Explain how water moves through a plant. 5 marks",
    "٤. Define diffusion.",
    "Answers:", "1. b", "2. Light and water", "3. Through the xylem from roots to leaves", "9. stray",
  ].join("\n");
  const reading = readPaperText(text);
  assert.deepEqual(reading.questions.map(question => [question.number, question.marks, question.options.length]), [[1, 1, 3], [2, 2, 0], [3, 5, 0], [4, 1, 0]]);
  assert.deepEqual(reading.warnings.map(warning => warning.code).sort(), ["KEY_NOT_MATCHED", "MARKS_NOT_STATED"]);
  const paper = paperFromReading(reading, { curriculumId: "c1", curriculumVersion: 2, subjectId: "s1", classId: "k1", language: "en", title: "Mid-term", durationMinutes: 60, now: "2026-10-23T08:00:00.000Z", slotId: "slot-1", examType: "MID_TERM" });
  const { paperDataSchema } = await import("../../src/lib/school-ai/assessment");
  assert.ok(paperDataSchema.safeParse(paper).success);
  assert.equal(paper.generation.kind, "UPLOADED");
  assert.equal(paper.questions.find(question => question.id === "q1")!.correctOptionId, "q1-b");
  assert.equal(paper.questions.find(question => question.id === "q3")!.type, "EXTENDED_TEXT");
  assert.equal(paper.blueprint.totalMarks, 9);
  assert.equal(paper.blueprint.sections.reduce((sum, section) => sum + section.answerCount * section.marksPerQuestion, 0), 9, "blueprint marks add up");
});
