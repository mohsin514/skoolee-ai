import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCandidatePaperHtml } from "../../src/lib/school-ai/paper-print";
import { assessmentFixture } from "./assessment-fixture";

test("print uses the candidate projection and excludes every restricted answer/provenance field", () => {
  const { paper } = assessmentFixture();
  paper.questions[0].modelAnswer = "SECRET MODEL ANSWER";
  paper.questions[0].rubric[0].criterion = "SECRET RUBRIC";
  paper.questions[0].sourceRefs[0].excerpt = "SECRET SOURCE";
  paper.questions[0].bankMetadata = { tags: ["SECRET BANK"], difficulty: "EASY" };
  const html = buildCandidatePaperHtml(paper, 12);
  for (const forbidden of ["SECRET", "correctOptionId", "modelAnswer", "sourceRefs", "bankMetadata", "curriculumId"]) assert.ok(!html.includes(forbidden));
  const text = html.replace(/<[^>]+>/g, "");
  for (const question of paper.questions) assert.ok(text.includes(question.prompt));
  assert.match(html, /Approved version: 12/);
  assert.match(html, /Answer <b>1<\/b> of 2/);
  assert.equal((html.match(/data-question-number=/g) ?? []).length, paper.questions.length);
});

test("print escapes hostile fields and never makes remote asset or script references", () => {
  const { paper } = assessmentFixture();
  paper.blueprint.title = '<script>alert("x")</script>';
  paper.questions[0].prompt = '<img src="https://example.invalid/secret">';
  paper.questions[0].options[0].text = '</li><iframe src="/api/private"></iframe>';
  const html = buildCandidatePaperHtml(paper, 1);
  assert.ok(!/<script|<iframe|<img| onload=/i.test(html));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /default-src 'none'/);
  assert.throws(() => buildCandidatePaperHtml(paper, 0), /INVALID_APPROVED_PAPER_VERSION/);
});

test("long prompts remain flowable and all supported languages have candidate-only localized headers", () => {
  for (const [language, label] of [["en", "Candidate paper"], ["ar", "ورقة الطالب"], ["ur", "طالب علم کا پرچہ"]] as const) {
    const { paper } = assessmentFixture(); paper.language = language;
    paper.questions[0].prompt = "Long question with useful text. ".repeat(100);
    const html = buildCandidatePaperHtml(paper, 2);
    assert.match(html, new RegExp(`lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"`));
    assert.ok(html.includes(label));
    assert.match(html, /<article class="question" data-question-number="1">/);
    assert.match(html, /@bottom-center/);
  }
});
