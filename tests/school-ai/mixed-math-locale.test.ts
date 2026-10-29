// SKAI-1013 [D2-07]: EN/UR/AR candidate papers keep mathematics in authored order and meaning.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "@playwright/test";
import { buildCandidatePaperHtml } from "../../src/lib/school-ai/paper-print";
import { mathSegments, mathAwareHtml } from "../../src/lib/school-ai/math-direction";
import { parseNumericAnswer, scoreObjectiveResponses } from "../../src/lib/school-ai/exam";
import type { AssessmentLocale } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// Synthetic prompts only: no curriculum facts are encoded here.
const prompts: Record<AssessmentLocale, string> = {
  en: "Solve: 3 + 4 = 7 and -5 + 2 = ?",
  ur: "حل کریں: 3 + 4 = 7 اور -5 + 2 = ? ہے",
  ar: "احسب: 3 + 4 = 7 و -5 + 2 = ? ثم اكتب الناتج",
};

test("expressions are isolated, words and lone numbers are not, and text round-trips exactly", () => {
  for (const prompt of Object.values(prompts)) assert.equal(mathSegments(prompt).map(s => s.text).join(""), prompt);
  assert.deepEqual(mathSegments(prompts.ur).filter(s => s.math).map(s => s.text), ["3 + 4 = 7", "-5 + 2 = ?"]);
  assert.deepEqual(mathSegments("Question 12 from the 2026 edition").filter(s => s.math), []);
  assert.deepEqual(mathSegments("اشرح ٣ + ٤").filter(s => s.math), [], "Arabic-Indic notation is left for native review, never re-ordered");
  assert.equal(mathAwareHtml("x < 2 & y > 1"), '<bdi class="math" dir="ltr">x &lt; 2</bdi> &amp; <bdi class="math" dir="ltr">y &gt; 1</bdi>');
  assert.ok(!mathAwareHtml("<script>1+1</script>").includes("<script"));
});

test("every locale prints prompts and choices with LTR-isolated maths, no lost characters and unchanged order", () => {
  for (const language of ["en", "ur", "ar"] as const) {
    const { paper } = assessmentFixture(); paper.language = language;
    paper.questions[0].prompt = prompts[language];
    paper.questions[0].options = [{ id: "a1", text: "1/2 + 1/4" }, { id: "a2", text: "3/4" }];
    const html = buildCandidatePaperHtml(paper, 3);
    assert.match(html, /<bdi class="math" dir="ltr">3 \+ 4 = 7<\/bdi>/);
    assert.match(html, /<bdi class="math" dir="ltr">1\/2 \+ 1\/4<\/bdi>/);
    assert.match(html, /\.math \{ unicode-bidi: isolate; direction: ltr;/);
    const text = html.replace(/<[^>]+>/g, "");
    assert.ok(text.includes(prompts[language]), `${language}: prompt text unchanged`);
    assert.ok(text.indexOf("3 + 4 = 7") < text.indexOf("1/2 + 1/4"), "question/choice order preserved");
  }
});

test("numeric answers from RTL keyboards keep their meaning and marks", () => {
  for (const raw of ["-5", "−5", "‏-5", "؜−5‎", "-٥", "-۵"]) assert.equal(parseNumericAnswer(raw), -5, JSON.stringify(raw));
  assert.equal(parseNumericAnswer("٣٫٥"), 3.5);
  assert.equal(parseNumericAnswer("5-"), null, "a visually mirrored sign is never silently accepted");
  const { paper } = assessmentFixture();
  paper.questions[0] = { ...paper.questions[0], type: "NUMERIC", options: [], correctOptionId: null, numericKey: { value: -5, tolerance: 0 } };
  assert.equal(scoreObjectiveResponses(paper, { q1: "‏−5" }).questions[0].marks, paper.questions[0].marks);
});

let browser: Browser | null = null;
after(async () => { await browser?.close(); });

test("rendered RTL papers show expressions left-to-right in authored order and survive 200% text (Chromium)", async () => {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 900 } });
  for (const language of ["ur", "ar"] as const) {
    const { paper } = assessmentFixture(); paper.language = language;
    paper.questions[0].prompt = prompts[language];
    await page.setContent(buildCandidatePaperHtml(paper, 1));
    const xs = await page.evaluate(() => {
      const node = document.querySelector(".prompt bdi.math")!.firstChild!, text = node.textContent!, out: number[] = [];
      for (let i = 0; i < text.length; i++) { if (text[i] === " ") continue; const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1); out.push(range.getBoundingClientRect().left); }
      return out;
    });
    assert.equal(xs.length, 5);
    assert.ok(xs.every((x, i) => i === 0 || x > xs[i - 1]), `${language}: glyphs must run left to right, got ${xs.join(",")}`);
    assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
    await page.addStyleTag({ content: "body{font-size:22pt}" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${language}: no horizontal clipping at 200% text`);
  }
});
