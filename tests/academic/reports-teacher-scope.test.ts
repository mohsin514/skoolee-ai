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

test("detail GET denies an unassigned teacher before marks or grades are read", () => {
  const src = readFileSync("src/app/api/reports/[id]/detail/route.ts", "utf8");
  const deny = src.indexOf('user.role === "TEACHER" && !teachesExamClass(reportCard.exam.class, user.userId)');
  assert.ok(deny > 0, "detail route must check the teacher is assigned to the exam class");
  assert.ok(deny < src.indexOf("prisma.mark"), "deny must run before marks are read");
  assert.match(src.slice(deny, deny + 200), /status: 403/);
  assert.match(src, /classTeacherId: true/);
  assert.match(src, /subjects: \{ select: \{ teacherId: true \} \}/);
});

test("SKAI-2087: only report-card seats read report cards (list, detail and staff PDF download)", async () => {
  const { canViewReportCards } = await import("../../src/lib/academic/report-card-access");
  for (const role of ["TEACHER", "PRINCIPAL", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"]) assert.equal(canViewReportCards(role), true, role);
  for (const role of ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "PARENT", "STUDENT"]) assert.equal(canViewReportCards(role), false, role);

  const list = readFileSync("src/app/api/reports/route.ts", "utf8");
  const get = list.slice(list.indexOf("export async function GET"));
  const gate = get.indexOf("!canViewReportCards(user.role)");
  assert.ok(gate > 0 && gate < get.indexOf("prisma.reportCard.findMany"));
  assert.match(get.slice(gate, gate + 150), /status: 403/);

  const dl = readFileSync("src/app/api/reports/download/route.ts", "utf8");
  const dget = dl.slice(dl.indexOf("export async function GET"));
  assert.ok(dget.indexOf("!canViewReportCards(user.role)") > dget.indexOf("assertSharedModuleRead"));
  assert.ok(dget.indexOf("!canViewReportCards(user.role)") < dget.indexOf("return await download("));
});
