import assert from "node:assert/strict";
import test from "node:test";
import { bulkMarksSchema, markEntrySchema } from "@/lib/validators/schemas";

const entry = (extra: Record<string, unknown>) => ({
  examId: "e1",
  entries: [{ studentId: "s1", subjectId: "sub1", marksObtained: 40, ...extra }],
});

test("SKAI-1995: the string \"false\" is read as false, not true", () => {
  const parsed = bulkMarksSchema.safeParse(entry({ isAbsent: "false", isExempt: "false" }));
  assert.ok(parsed.success);
  assert.equal(parsed.data.entries[0].isAbsent, false);
  assert.equal(parsed.data.entries[0].isExempt, false);
});

test("SKAI-1995: real booleans and \"true\" still work; other strings are rejected", () => {
  const ok = bulkMarksSchema.safeParse(entry({ isAbsent: true, isExempt: "true" }));
  assert.ok(ok.success);
  assert.equal(ok.data.entries[0].isAbsent, true);
  assert.equal(ok.data.entries[0].isExempt, true);
  assert.equal(bulkMarksSchema.safeParse(entry({ isExempt: "0" })).success, false);
  assert.equal(bulkMarksSchema.safeParse(entry({ isAbsent: 1 })).success, false);
});

test("SKAI-1995: null, blank and non-numeric marks are rejected, not stored as 0", () => {
  for (const bad of [null, "", "  ", "abc", undefined, -1]) {
    assert.equal(bulkMarksSchema.safeParse(entry({ marksObtained: bad })).success, false, String(bad));
  }
  assert.equal(
    markEntrySchema.safeParse({ studentId: "s", subjectId: "x", examId: "e", marksObtained: null }).success,
    false,
  );
});

test("SKAI-1995: numeric marks and numeric strings are accepted", () => {
  for (const good of [0, 55, "55", 12.5]) {
    assert.ok(bulkMarksSchema.safeParse(entry({ marksObtained: good })).success, String(good));
  }
});
