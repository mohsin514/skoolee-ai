import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { teacherSubjectScope } from "../../src/lib/academic/weighted-grade-scope";
import { computeWeightedGrade, defaultWeightConfig, restrictContextToSubjects, type WeightedGradeContext } from "../../src/lib/academic/grade-calculator";

// SKAI-2019: weighted-grade reads follow the /api/marks allocation rule.
const cls = {
  classTeacherId: "class-teacher",
  subjects: [{ id: "math", teacherId: "t1" }, { id: "gk", teacherId: "t2" }, { id: "urdu", teacherId: "t1" }],
};

test("class teacher sees every subject, a subject teacher only their own, others nothing", () => {
  assert.equal(teacherSubjectScope(cls, "class-teacher"), null);
  assert.deepEqual(teacherSubjectScope(cls, "t1"), ["math", "urdu"]);
  assert.deepEqual(teacherSubjectScope(cls, "t2"), ["gk"]);
  assert.equal(teacherSubjectScope(cls, "outsider"), undefined);
});

test("a restricted context leaves other subjects out of the breakdown and the overall", () => {
  const ctx: WeightedGradeContext = {
    config: defaultWeightConfig(),
    subjects: [{ id: "math", name: "Math", totalMarks: 100 }, { id: "gk", name: "General Knowledge", totalMarks: 100 }],
    exams: [{ id: "e1", title: "Mid", examType: "MID_TERM", totalMarks: 100, subjectId: null }],
  };
  const marks = [
    { examId: "e1", subjectId: "math", marksObtained: 90, isAbsent: false, isExempt: false },
    { examId: "e1", subjectId: "gk", marksObtained: 10, isAbsent: false, isExempt: false },
  ];
  const student = { id: "s1", fullName: "Pupil" };
  const all = computeWeightedGrade(student, ctx, marks);
  const own = computeWeightedGrade(student, restrictContextToSubjects(ctx, ["math"]), marks);
  assert.ok(all.subjectBreakdown.some((s) => s.subjectId === "gk"));
  assert.deepEqual(own.subjectBreakdown.map((s) => s.subjectId), ["math"]);
  assert.notEqual(own.overallPercentage, all.overallPercentage);
  assert.equal(restrictContextToSubjects(ctx, null), ctx);
});

test("all three routes apply the scope before reading grades", () => {
  for (const [file, call] of [
    ["src/app/api/calculated-grades/route.ts", "calculateWeightedGradeForClass("],
    ["src/app/api/grade-config/weighted-result/route.ts", "calculateWeightedGradeForClass("],
  ] as const) {
    const src = readFileSync(file, "utf8");
    const gate = src.indexOf("weightedGradeSubjectScope(");
    assert.ok(gate > 0, file);
    assert.ok(gate < src.indexOf(call, gate), file);
  }
  const avg = readFileSync("src/app/api/grade-config/weighted-result/class-averages/route.ts", "utf8");
  assert.match(avg, /teacherSubjectScope\(c, user\.userId\)/);
});
