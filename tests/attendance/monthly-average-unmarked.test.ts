import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

// SKAI-223: pupils with no marks this month are left out of the class average and the at-risk list.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/attendance/monthly/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

function fixture(records: Array<{ studentId: string; status: string }>, students: Array<{ id: string; fullName: string; rollNo: string; profileImageUrl: null }>, classSchoolId = "school-a") {
  const db = {
    class: { findFirst: async ({ where }: any) => (where.campus.schoolId === classSchoolId ? { id: "class-a", name: "Grade 5", section: "A" } : null) },
    attendance: { findMany: async () => records.map((r) => ({ ...r, date: new Date("2026-11-10T12:00:00Z") })) },
    student: { findMany: async () => students },
  };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/api/scope") return {
      requireAuthUser: async () => ({ role: "TEACHER", schoolId: "school-a", campusId: "campus-a", id: "teacher-a" }),
      canManageOperations: () => true, canMarkAttendance: () => true, resolveCampusId: async () => "campus-a",
      ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
      errorResponse: (error: any) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    };
    if (id === "@/lib/attendance") return { ruleRate: (rows: Array<{ status: string }>) => (rows.length ? 100 : 0) };
    if (id === "@/lib/attendance/rule") return { attendanceRuleFor: async () => ({}) };
    if (id === "@/lib/students/roster-status") return { rosterStatusWhere: () => ({}) };
    return require(id);
  });
  return (qs: string) => mod.exports.GET(new Request(`http://qa.test/api/attendance/monthly?classId=class-a&month=2026-11&${qs}`));
}

const roster = [
  { id: "p1", fullName: "Marked Pupil", rollNo: "1", profileImageUrl: null },
  { id: "p2", fullName: "Unmarked One", rollNo: "2", profileImageUrl: null },
  { id: "p3", fullName: "Unmarked Two", rollNo: "3", profileImageUrl: null },
];

test("unmarked pupils do not drag the class average down or get flagged at risk", async () => {
  const body = await (await fixture([{ studentId: "p1", status: "PRESENT" }], roster)("")).json();
  assert.equal(body.classAveragePercentage, 100);
  assert.deepEqual(body.atRiskStudents, []);
  const unmarked = body.students.filter((s: any) => s.studentId !== "p1");
  assert.ok(unmarked.every((s: any) => s.marked === false));
  assert.equal(body.students.find((s: any) => s.studentId === "p1").marked, true);
});

test("a class with no marks at all reports a zero average without flagging anyone", async () => {
  const body = await (await fixture([], roster)("")).json();
  assert.equal(body.classAveragePercentage, 0);
  assert.deepEqual(body.atRiskStudents, []);
});

test("a class outside the teacher's school is denied (SKAI-223)", async () => {
  const res = await fixture([], roster, "school-b")("");
  assert.equal(res.status, 403);
});
