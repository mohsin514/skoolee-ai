// SKAI-2047: "Request papers" must reject impossible, past and post-sitting due dates with a 400 instead of a 500 or a silent overwrite.
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPaperDueWindow, patchSlotInput, requestPapersInput } from "../../src/lib/school-ai/paper-slot-service";

test("impossible calendar days are rejected by the schema", () => {
  for (const dueOn of ["2026-13-45", "2026-99-99", "2026-02-30", "2027-02-29"]) {
    const result = requestPapersInput.safeParse({ dueOn });
    assert.equal(result.success, false, dueOn);
    assert.equal(requestPapersInput.safeParse({ overrides: [{ subjectName: "Maths", gradeName: "Grade 5", dueOn }] }).success, false, `override ${dueOn}`);
    assert.equal(patchSlotInput.safeParse({ version: 1, dueOn }).success, false, `patch ${dueOn}`);
  }
});

test("real calendar days pass the schema", () => {
  for (const dueOn of ["2026-12-01", "2028-02-29"]) assert.equal(requestPapersInput.safeParse({ dueOn }).success, true, dueOn);
});

test("a due date before today or on/after the first sitting is a 400", () => {
  for (const dueOn of ["2019-05-05", "2026-11-14", "2026-12-08", "2026-12-09"]) {
    assert.throws(() => assertPaperDueWindow(dueOn, "2026-12-08", "2026-11-15"), (error: { status?: number }) => error.status === 400, dueOn);
  }
});

test("today and the day before the first sitting are accepted, and no date is accepted", () => {
  assertPaperDueWindow("2026-11-15", "2026-12-08", "2026-11-15");
  assertPaperDueWindow("2026-12-07", "2026-12-08", "2026-11-15");
  assertPaperDueWindow(undefined, "2026-12-08", "2026-11-15");
});
