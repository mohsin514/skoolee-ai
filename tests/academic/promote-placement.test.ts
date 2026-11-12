import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1401: promote paths reject foreign/unknown IDs with 404 and enforce placement invariants.
const source = readFileSync("src/app/api/academic-year/route.ts", "utf8");
const promote = source.slice(source.indexOf('if (action === "promote")'), source.indexOf('if (action === "bulk-promote")'));
const bulk = source.slice(source.indexOf('if (action === "bulk-promote")'));

test("single promote 404s foreign or unknown students and classes instead of skipping", () => {
  assert.doesNotMatch(promote, /continue;/);
  assert.match(promote, /where: \{ id: studentId, schoolId: user\.schoolId, campusId \}/);
  assert.match(promote, /where: \{ id: targetClassId, schoolId: user\.schoolId, campusId \}/);
  assert.match(promote, /throw new ApiError\("Student not found", 404\)/);
  assert.match(promote, /throw new ApiError\("Class not found", 404\)/);
});

test("both paths require an active, later-year target class with room", () => {
  assert.match(promote, /assertPromotionPlacement\(targetClass, student\.class\.academicYear\)/);
  assert.match(promote, /Target class is full/);
  assert.match(bulk, /assertPromotionPlacement\(toClass, fromClass\.academicYear\)/);
  assert.match(bulk, /Target class is full/);
  assert.match(bulk, /where: \{ classId: fromClassId, schoolId: user\.schoolId, campusId \}/);
  assert.match(source, /if \(target\.status !== "ACTIVE"\)/);
  assert.match(source, /if \(target\.academicYear <= sourceYear\)/);
});
