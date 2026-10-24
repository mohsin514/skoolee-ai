import test from "node:test";
import assert from "node:assert/strict";
import { schoolAICopy, interpolateAI } from "../../src/lib/school-ai/copy";
import { readSetupDraft, setupQuestions, setupReadiness, validateSetupAnswer } from "../../src/lib/school-ai/onboarding";

test("new schools avoid migration questions while import and migration retain them", () => {
  assert.equal(setupQuestions({ path: "new", answers: {} }).some(question => question.key === "migrationSource"), false);
  for (const path of ["import", "migrate"] as const) assert.equal(setupQuestions({ path, answers: {} }).some(question => question.key === "migrationSource"), true);
});

test("adaptive setup asks only relevant outcome questions and never duplicates staff", () => {
  const keys = (firstOutcome: string) => setupQuestions({ path: "new", answers: { firstOutcome } }).map(question => question.key);
  assert.ok(keys("exams").includes("curriculum"));
  assert.ok(keys("exams").includes("assessmentPolicy"));
  assert.ok(!keys("exams").includes("feePolicy"));
  assert.ok(keys("fees").includes("feePolicy"));
  assert.ok(!keys("fees").includes("curriculum"));
  assert.ok(keys("timetable").includes("resources"));
  assert.ok(keys("records").includes("students"));
  assert.equal(keys("complete").filter(key => key === "staff").length, 1);
  assert.equal(new Set(keys("complete")).size, keys("complete").length);
});

test("setup validates real dates, boundaries and IANA time zones", () => {
  assert.equal(validateSetupAnswer("endDate", "2026-01-01", { startDate: "2026-02-01" }), "dateError");
  assert.equal(validateSetupAnswer("startDate", "2026-02-30", {}), "dateError");
  assert.equal(validateSetupAnswer("startDate", "2028-02-29", {}), undefined);
  assert.equal(validateSetupAnswer("timezone", "Asia/Karachi", {}), undefined);
  assert.equal(validateSetupAnswer("timezone", "Mars/School", {}), "timezoneError");
  assert.equal(validateSetupAnswer("schoolName", "  ", {}), "required");
});

test("readiness exposes missing information rather than a fabricated completion percentage", () => {
  const groups = setupReadiness({ schoolName: "Example", country: "Pakistan", timezone: "Asia/Karachi", campuses: "One", firstOutcome: "exams" });
  assert.deepEqual(groups.find(group => group.label === "profile")?.missing, []);
  assert.deepEqual(groups.find(group => group.label === "exams")?.missing, ["curriculum", "assessmentPolicy"]);
  assert.ok(groups.find(group => group.label === "academics")?.missing.includes("startDate"));
  assert.ok(setupReadiness({ timezone: "not-a-zone" })[0].missing.includes("timezone"));
});

test("draft restoration keeps only bounded, known answers", () => {
  const restored = readSetupDraft({ path: "migrate", answers: { schoolName: "x".repeat(5000), schoolSecret: "no", grades: 12 }, currentQuestion: "schoolSecret", step: "broken", confirmedKeys: ["schoolName", "schoolSecret"] });
  assert.equal(restored.answers.schoolName?.length, 4000);
  assert.equal("schoolSecret" in restored.answers, false);
  assert.equal(restored.answers.grades, undefined);
  assert.deepEqual(restored.confirmedKeys, ["schoolName"]);
  assert.equal(restored.currentQuestion, undefined);
  assert.equal(restored.step, "profile");
});

test("all shared AI interface copy is complete in English, Arabic and Urdu", () => {
  const english = schoolAICopy("en");
  for (const language of ["en", "ar", "ur"] as const) {
    const copy = schoolAICopy(language);
    assert.deepEqual(Object.keys(copy), Object.keys(english));
    for (const [key, text] of Object.entries(copy)) {
      assert.ok(text.trim(), `${language}:${key} is empty`);
      if (language !== "en") assert.match(text, /[\u0600-\u06ff]/u, `${language}:${key} is not translated`);
    }
    assert.equal(interpolateAI(copy.questionOf, { current: 2, total: 10 }).includes("{"), false);
  }
});
