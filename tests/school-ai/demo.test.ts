import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSchoolAiDemo } from "../../src/lib/school-ai/demo";
import { curriculumDataSchema, paperDataSchema, validateCurriculumApproval, validatePaperApproval } from "../../src/lib/school-ai/assessment";

test("every sample paper has valid source evidence, coverage, answers and rubric totals", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    const sample = buildSchoolAiDemo({ workflow: "paper", language });
    const curriculum = curriculumDataSchema.parse(sample.curriculum);
    const paper = paperDataSchema.parse(sample.paper);
    assert.deepEqual(validateCurriculumApproval(curriculum), []);
    assert.deepEqual(validatePaperApproval(paper, curriculum), []);
    assert.equal(paper.blueprint.totalMarks, 4);
    assert.equal(paper.questions.length, 2);
    assert.equal(paper.language, language);
    assert.equal(paper.generation.kind, "MANUAL");
    assert.equal(paper.generation.generatedAt, null);
    assert.equal(sample.mode, "demo");
    assert.equal(sample.tokensUsed, 0);
    assert.match(sample.model, /^demo:/);
    assert.ok(sample.notice.length > 30);
    assert.match(curriculum.classId, /^demo-/);
    assert.match(curriculum.subjectId, /^demo-/);
  }
});

test("assistant samples match the requested workflow without copying personal input into fixtures", () => {
  const cases = [
    ["prepare an announcement for synthetic-person@example.invalid", /announcement draft/i],
    ["create a timetable", /sample timetable/i],
    ["generate fee invoices", /sample fee workflow/i],
    ["take attendance", /sample attendance/i],
    ["setup a new school", /sample school setup/i],
  ] as const;
  for (const [message, expected] of cases) {
    const sample = buildSchoolAiDemo({ workflow: "assistant", language: "en", message });
    assert.match(sample.reply, expected);
    assert.equal(JSON.stringify(sample).includes("synthetic-person@example.invalid"), false);
  }
  assert.ok(buildSchoolAiDemo({ workflow: "assistant", language: "en", message: "Prepare an exam paper" }).paper);
  assert.ok(buildSchoolAiDemo({ workflow: "assistant", language: "en", message: "Show curriculum" }).curriculum);
});

test("editing one prototype does not alter the next sample or its cited source", () => {
  const edited = buildSchoolAiDemo({ workflow: "paper", language: "en" });
  edited.paper!.questions[0].modelAnswer = "local edit";
  edited.curriculum!.sources[0].excerpt = "local edit";
  const fresh = buildSchoolAiDemo({ workflow: "paper", language: "en" });
  assert.notEqual(fresh.paper!.questions[0].modelAnswer, "local edit");
  assert.deepEqual(validatePaperApproval(fresh.paper!, fresh.curriculum!), []);
});
