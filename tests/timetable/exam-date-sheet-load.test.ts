import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFamilyExamSheet } from "../../src/components/timetable/exam-sheet-load";

// SKAI-1419: a failed family exam date sheet load is an error, never the legitimate "no exams" result.
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("a non-2xx response fails the load instead of showing no exams", async () => {
  await assert.rejects(() => loadFamilyExamSheet("t", async () => json(500, { success: false, error: "Server error" })));
  await assert.rejects(() => loadFamilyExamSheet("t", async () => json(401, { success: false, error: "Link expired" })));
});

test("an unsuccessful payload fails the load even on a 200", async () => {
  await assert.rejects(() => loadFamilyExamSheet("t", async () => json(200, { success: false })));
  await assert.rejects(() => loadFamilyExamSheet("t", async () => json(200, { success: true })), "a success with no data is not an empty sheet");
});

test("a non-JSON failure fails the load", async () => {
  await assert.rejects(() => loadFamilyExamSheet("t", async () => new Response("<html>", { status: 502 })));
});

test("a legitimately empty list is a real empty result, not a failure", async () => {
  const sheet = await loadFamilyExamSheet("t", async () => json(200, { success: true, data: { exams: [], schedules: {} } }));
  assert.deepEqual(sheet, { exams: [], schedules: {} });
});

test("a successful payload returns the exams and their papers", async () => {
  const exam = { id: "e1", title: "Midterm" };
  const sheet = await loadFamilyExamSheet("t", async () => json(200, { success: true, data: { exams: [exam], schedules: { e1: [] } } }));
  assert.deepEqual(sheet, { exams: [exam], schedules: { e1: [] } });
});
