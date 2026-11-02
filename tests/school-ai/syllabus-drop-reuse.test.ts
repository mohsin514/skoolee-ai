import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { studioSyllabusCopy } from "../../src/lib/school-ai/exam-studio-copy-syllabus";

const drop = readFileSync("src/components/school-ai/exam-studio/syllabus-drop.tsx", "utf8");
const service = readFileSync("src/lib/school-ai/teaching-progress-service.ts", "utf8");

test("SKAI-772: the Syllabus Drop offers phone handoff, library and same-as-last-year", () => {
  assert.match(drop, /<PhoneCaptureButton scope=\{\{ campusId, subjectId, classId, documentKind: "syllabus", language \}\} \/>/);
  for (const action of ["upload", "paste", "phone-check", "last-year", "library"]) assert.ok(drop.includes(`data-drop-action="${action}"`), action);
});

test("SKAI-772: a reused syllabus is copied into this class's own source and checked as usual", () => {
  const reuse = drop.slice(drop.indexOf("const reuseSource"), drop.indexOf("const checkPhone"));
  assert.match(reuse, /kind: "SOURCE"/);
  assert.match(reuse, /documentKind: "syllabus"/);
  assert.match(reuse, /subjectId, classId/);
  assert.match(reuse, /toSource\(result\.record\)/, "goes through the same text check before any approval");
  assert.doesNotMatch(reuse, /action: "approve"/);
});

test("SKAI-772: the library excludes this class's own syllabus and empty sources; last year needs an earlier approved year", () => {
  assert.match(drop, /!\(row\.data\.subjectId === subjectId && row\.data\.classId === classId\)/);
  assert.match(drop, /row\.status === "APPROVED" && row\.data\.academicYear && row\.data\.academicYear < academicYearNow\(\)/);
});

test("SKAI-772: the Teaching Line view carries the class campus for the phone capture scope", () => {
  assert.equal((service.match(/campusId: subject\.campusId, className/g) ?? []).length, 2);
});

test("SKAI-772: new copy exists in English, Arabic and Urdu", () => {
  const keys = ["reuseTitle", "lastYear", "libraryLabel", "libraryHint", "libraryEmpty", "useLibrary", "phoneTitle", "phoneCheck", "phoneNone"] as const;
  for (const language of ["en", "ar", "ur"] as const) {
    const copy = studioSyllabusCopy(language) as Record<string, string>;
    for (const name of keys) assert.ok(copy[name]?.trim(), `${language}.${name}`);
  }
  assert.notEqual(studioSyllabusCopy("ar").useLibrary, studioSyllabusCopy("en").useLibrary);
});
