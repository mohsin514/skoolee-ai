import { test } from "node:test";
import assert from "node:assert/strict";
import { copyPreviousIntoDrafts, hasMarks, previousDates } from "@/lib/attendance/copy-previous";

const blank = { status: null, arrivalTime: "", departureTime: "" };

test("fills only unmarked pupils and never overwrites a mark already made", () => {
  const drafts = { a: { ...blank }, b: { ...blank, status: "ABSENT" }, c: { ...blank } };
  const out = copyPreviousIntoDrafts(drafts, [
    { studentId: "a", status: "LATE", arrivalTime: "08:20", departureTime: null },
    { studentId: "b", status: "PRESENT", arrivalTime: null, departureTime: null },
  ]);
  assert.deepEqual(out.drafts.a, { status: "LATE", arrivalTime: "08:20", departureTime: "" });
  assert.equal(out.drafts.b.status, "ABSENT");
  assert.equal(out.drafts.c.status, null);
  assert.equal(out.copied, 1);
  assert.equal(out.skipped, 1);
});

test("pupils absent from the earlier register (new enrolment) or unmarked there stay unmarked", () => {
  const out = copyPreviousIntoDrafts({ x: { ...blank } }, [{ studentId: "x", status: null, arrivalTime: null, departureTime: null }, { studentId: "y", status: "PRESENT", arrivalTime: null, departureTime: null }]);
  assert.equal(out.drafts.x.status, null);
  assert.equal(out.copied, 0);
  assert.equal("y" in out.drafts, false);
});

test("a second copy is a no-op, so a repeated click has no duplicate effect", () => {
  const first = copyPreviousIntoDrafts({ a: { ...blank } }, [{ studentId: "a", status: "PRESENT", arrivalTime: null, departureTime: null }]);
  const second = copyPreviousIntoDrafts(first.drafts, [{ studentId: "a", status: "ABSENT", arrivalTime: null, departureTime: null }]);
  assert.equal(second.copied, 0);
  assert.equal(second.drafts.a.status, "PRESENT");
});

test("looks back newest first across a month boundary, and rejects bad dates", () => {
  assert.deepEqual(previousDates("2026-11-02", 3), ["2026-11-01", "2026-10-31", "2026-10-30"]);
  assert.deepEqual(previousDates("not-a-date"), []);
  assert.equal(hasMarks([{ studentId: "a", status: null, arrivalTime: null, departureTime: null }]), false);
});
