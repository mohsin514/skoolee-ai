import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentFixture } from "./assessment-fixture";
import { paperSittingCompletion, totalScriptMarks } from "../../src/lib/school-ai/paper-sitting";

test("paper marks require complete sections and respect optional-answer limits", () => {
  const { paper } = assessmentFixture();
  assert.equal(totalScriptMarks(paper, { q1: 2, q3: 3 }), 5);
  assert.equal(totalScriptMarks(paper, { q2: 0, q3: 0 }), 0, "zero is an explicit unattempted required answer");
  const incomplete: Array<Record<string, number>> = [{}, { q1: 2 }, { q1: 2, q2: 2, q3: 3 }];
  for (const marks of incomplete) assert.throws(() => totalScriptMarks(paper, marks), /enter marks for exactly/);
  assert.throws(() => totalScriptMarks(paper, { q1: 3, q3: 3 }), /out of 2/);
  assert.throws(() => totalScriptMarks(paper, { q1: 2, q3: 3, unknown: 0 }), /not in the paper/);
  assert.throws(() => totalScriptMarks(paper, { q1: NaN, q3: 3 }), /out of 2/);
});

test("paper completion accounts for every section, missing attendance and absentees", () => {
  const present = { attendance: "PRESENT", marked: true };
  const absent = { attendance: "ABSENT", marked: false };
  assert.deepEqual(paperSittingCompletion([]), { attendanceComplete: false, marksComplete: false });
  assert.deepEqual(paperSittingCompletion([[present], []]), { attendanceComplete: false, marksComplete: false });
  assert.deepEqual(paperSittingCompletion([[present], [{ attendance: null, marked: true }]]), { attendanceComplete: false, marksComplete: false });
  assert.deepEqual(paperSittingCompletion([[present], [{ attendance: "PRESENT", marked: false }]]), { attendanceComplete: true, marksComplete: false });
  assert.deepEqual(paperSittingCompletion([[present, absent], [present]]), { attendanceComplete: true, marksComplete: true });
});
