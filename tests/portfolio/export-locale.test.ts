import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPortfolioExport } from "@/lib/portfolio/export-html";

const entry = {
  title: "Fractions", goal: { code: "M1", title: "Add fractions" }, status: "APPROVED", reflection: "I improved", teacherComment: "Well done",
  earlier: { title: "Quiz 1", version: 1, assignmentVersion: 1, rubricVersion: 1, receiptCode: "R1", submittedAt: "2026-10-01T10:00:00Z", text: "1/2", file: null, feedback: null },
  later: null, comparison: { comparable: false },
};
const now = new Date("2026-11-05T12:00:00Z");

// SKAI-1754: the export follows the account display language and direction.
test("Arabic export is RTL with Arabic labels and Arabic-locale dates", () => {
  const html = renderPortfolioExport({ title: null, learner: "Learner A", entries: [entry] }, "ar", now);
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /ملف التعلم/);
  assert.doesNotMatch(html, /Learning portfolio|Earlier work|Reflection|Teacher comment/);
  assert.match(html, new RegExp(new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(now)));
});

test("Urdu export is RTL with Urdu labels", () => {
  const html = renderPortfolioExport({ title: null, learner: "Learner A", entries: [entry] }, "ur", now);
  assert.match(html, /<html lang="ur" dir="rtl">/);
  assert.doesNotMatch(html, /Earlier work|Later work|Only reviewed entries/);
});

test("English export keeps the existing English copy and escapes learner content", () => {
  const html = renderPortfolioExport({ title: "Shared <b>", learner: "A&B", entries: [entry] }, "en", now);
  assert.match(html, /<html lang="en" dir="ltr">/);
  assert.match(html, /Earlier work: Quiz 1/);
  assert.match(html, /Later work/);
  assert.match(html, /Shared &lt;b&gt;/);
  assert.match(html, /A&amp;B/);
});
