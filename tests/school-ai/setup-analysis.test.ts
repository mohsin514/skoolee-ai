import { test } from "node:test";
import assert from "node:assert/strict";
import { setupAnalysisInput, validateSetupAnalysis, reconcileSetupAnalysis } from "../../src/lib/school-ai/setup-analysis";
import { resolveRosterClass } from "../../src/lib/imports/roster-class";
const evidence = [{ id: "answer", text: "We start on 1 August 2026 and teach Grade 1 A." }];
test("AI normalization retains exact evidence and valid typed facts", () => {
 const result = validateSetupAnalysis({ answers: [{ key: "startDate", value: "2026-08-01", evidenceId: "answer", quote: "1 August 2026" }], questions: ["When does the session end?"] }, evidence);
 assert.equal(result.answers[0].value, "2026-08-01");
});
test("AI cannot cite absent documents, fabricate quotations, repeat keys or invent actions", () => {
 const answer = { key: "startDate", value: "2026-08-01", evidenceId: "answer", quote: "1 August 2026" };
 for (const invalid of [{ ...answer, evidenceId: "another-school" }, { ...answer, quote: "August 2027" }, { ...answer, value: "2026-02-31" }, { ...answer, key: "execute" }]) assert.throws(() => validateSetupAnalysis({ answers: [invalid], questions: [] }, evidence));
 assert.throws(() => validateSetupAnalysis({ answers: [answer, answer], questions: [] }, evidence));
 assert.equal(setupAnalysisInput.safeParse({ campusId: "campus", language: "en", text: "", sources: [] }).success, false);
});
test("multi-class rosters resolve exact destinations and reject ambiguity rather than defaulting", () => {
 const classes = [{ id: "a", name: "Grade 1", section: "A" }, { id: "b", name: "Grade 1", section: "B" }, { id: "c", name: "Grade 2", section: null }];
 assert.equal(resolveRosterClass(classes, " Grade 1 ", "b", "a"), "b");
 assert.equal(resolveRosterClass(classes, "Grade 1", "", "a"), "");
 assert.equal(resolveRosterClass(classes, "Grade 9", "A", "a"), "");
 assert.equal(resolveRosterClass(classes, "", "B", "a"), "");
 assert.equal(resolveRosterClass(classes, "", "", "a"), "a");
});

test("unsupported suggestions are excluded while supported answers survive", () => {
 const result = reconcileSetupAnalysis({ answers: [
  { key: "startDate", value: "2026-08-01", evidenceId: "answer", quote: "1 August 2026" },
  { key: "grades", value: "Grade 9", evidenceId: "answer", quote: "Grade 9" },
 ], questions: [] }, evidence, "en");
 assert.deepEqual(result.answers.map(answer => answer.key), ["startDate"]);
 assert.equal(result.questions.length, 1);
});
