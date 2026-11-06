import { test } from "node:test";
import assert from "node:assert/strict";
import { currentClassTeacherId, currentSubjectTeacherId } from "../../src/lib/academic/allocation-version";

// SKAI-209: the campus console loads subjects with a nested `teacher` and no `teacherId` scalar. The stale-save
// guard must still send the teacher the editor saw, or every back-dated change to a staffed subject 409s.
test("the expected subject teacher is read from the nested teacher when the scalar is not loaded", () => {
  const classes = [{ id: "c1", classTeacherId: "t1", subjects: [{ id: "s1", teacher: { id: "t1" } }, { id: "s2", teacher: null }, { id: "s3", teacherId: "t3" }] }];
  assert.equal(currentSubjectTeacherId(classes, "s1"), "t1");
  assert.equal(currentSubjectTeacherId(classes, "s2"), null);
  assert.equal(currentSubjectTeacherId(classes, "s3"), "t3");
  assert.equal(currentSubjectTeacherId(classes, "missing"), undefined);
});

test("the expected class teacher is read from the nested class teacher when the scalar is not loaded", () => {
  assert.equal(currentClassTeacherId([{ id: "c1", classTeacher: { id: "t1" } }], "c1"), "t1");
  assert.equal(currentClassTeacherId([{ id: "c1", classTeacherId: null, classTeacher: null }], "c1"), null);
  assert.equal(currentClassTeacherId([], "c1"), undefined);
});
