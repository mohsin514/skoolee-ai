import assert from "node:assert/strict";
import test from "node:test";
import { revisionDifferences, restoredRevisionData } from "../../src/lib/school-ai/revisions";
import { revisionCopy, revisionFieldLabel } from "../../src/lib/school-ai/revision-copy";

test("revision comparison ignores unchanged empty structures and identifies an exact answer-key edit", () => {
  const before = { questions: [{ id: "q1", prompt: "Compare integers", options: [], modelAnswer: "Old answer", rubric: [{ id: "r1", criterion: "Reasoning", marks: 1 }] }], missingInformation: [] };
  const after = structuredClone(before); after.questions[0].modelAnswer = "Reviewed answer";
  assert.deepEqual(revisionDifferences(before, after), [{ path: ["questions", 0, "modelAnswer"], before: "Old answer", after: "Reviewed answer", type: "changed" }]);
  assert.deepEqual(revisionDifferences(before, structuredClone(before)), []);
});

test("source comparisons keep exact text and label additions and removals without exposing storage routing", () => {
  const differences = revisionDifferences({ extractedText: "Line 1\nOld line", uncertainties: ["Unclear heading"], storageKey: "old-private-key" }, { extractedText: "Line 1\nReviewed line", uncertainties: [], storageKey: "new-private-key", sourcePages: [{ page: 1, text: "Reviewed line" }] });
  assert.equal(differences.find(item => item.path[0] === "extractedText")?.before, "Line 1\nOld line");
  assert.equal(differences.find(item => item.path[0] === "uncertainties")?.type, "removed");
  assert.equal(differences.find(item => item.path[0] === "sourcePages")?.type, "added");
  assert.equal(JSON.stringify(differences).includes("private-key"), false);
});

test("restoring source content preserves immutable original-file metadata and does not mutate either snapshot", () => {
  const current = { extractedText: "Latest", storageKey: "authenticated-original", sha256: "current-fingerprint", sourceLanguage: "ur", extractionModel: "trusted-model" };
  const previous = { extractedText: "Earlier", storageKey: "stale-routing", sha256: "stale-fingerprint", sourceLanguage: "en", sourcePages: [{ page: 1, text: "Earlier" }] };
  const result = restoredRevisionData("SOURCE", current, previous);
  assert.equal(result.extractedText, "Earlier"); assert.equal(result.storageKey, current.storageKey); assert.equal(result.sha256, current.sha256); assert.equal(result.sourceLanguage, "ur"); assert.equal(result.extractionModel, "trusted-model");
  (result.sourcePages as { text: string }[])[0].text = "Edited copy";
  assert.equal(previous.sourcePages[0].text, "Earlier"); assert.equal(current.extractedText, "Latest");
});

test("history controls and field paths are complete in English, Arabic and Urdu", () => {
  const english = revisionCopy("en");
  for (const language of ["ar", "ur"] as const) {
    const translated = revisionCopy(language);
    for (const key of Object.keys(english) as (keyof typeof english)[]) { assert.match(translated[key], /[\u0600-\u06ff]/); assert.deepEqual(translated[key].match(/\{\w+\}/g), english[key].match(/\{\w+\}/g)); }
    assert.match(revisionFieldLabel(["data", "questions", 0, "modelAnswer"], language), /[\u0600-\u06ff]/);
  }
});
