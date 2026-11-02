import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { teachesExamClass } from "../../src/lib/academic/teaches-exam-class";

const cls = { classTeacherId: "class-teacher", subjects: [{ teacherId: "subject-teacher" }, { teacherId: null }] };

test("class and subject teachers are assigned; others are not", () => {
  assert.equal(teachesExamClass(cls, "class-teacher"), true);
  assert.equal(teachesExamClass(cls, "subject-teacher"), true);
  assert.equal(teachesExamClass(cls, "teacher-t"), false);
  assert.equal(teachesExamClass({ classTeacherId: null, subjects: [] }, "teacher-t"), false);
});

test("GET denies an unassigned teacher before report cards or guardian contacts are read", () => {
  const src = readFileSync("src/app/api/reports/route.ts", "utf8");
  const get = src.slice(src.indexOf("export async function GET"));
  const deny = get.indexOf('user.role === "TEACHER" && !teachesExamClass(exam.class, user.userId)');
  assert.ok(deny > 0);
  assert.ok(deny < get.indexOf("prisma.reportCard.findMany"));
  assert.match(get.slice(deny, deny + 200), /status: 403/);
});
