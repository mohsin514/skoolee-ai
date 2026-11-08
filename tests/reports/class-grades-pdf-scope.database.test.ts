import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { NextRequest } from "next/server";

// SKAI-1649: a teacher downloads final-grade PDFs only for classes they lead or teach. Campus and
// school leaders keep their broader scope. Two schools and two campuses are covered.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");

type Who = { userId: string; schoolId: string; campusId: string | null; role: string };
let current: Who | null = null;
const generated: string[] = [];
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => current } });
mock.module("@/lib/billing/response", { namedExports: { billingAccessResponse: async () => null } });
mock.module("@/lib/pdf", { namedExports: { generateClassGradesPdf: async (classId: string) => { generated.push(classId); return Buffer.from("%PDF-1.4 synthetic"); } } });
let GET: (req: NextRequest) => Promise<Response>;

const raw = new PrismaClient();
const schoolA = `pdf-a-${randomUUID()}`, schoolB = `pdf-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const teacherClassTeacher = randomUUID(), teacherSubject = randomUUID(), campusAdminA1 = randomUUID(), principalB1 = randomUUID();
const classA = randomUUID(), classSubjectA = randomUUID(), classB = randomUUID(), classOtherCampus = randomUUID(), classOtherSchool = randomUUID();

const fetchPdf = (classId: string) => {
  const who = current!;
  return runWithTenantContext({ schoolId: who.schoolId, campusId: who.campusId!, userId: who.userId, role: who.role as "TEACHER" }, () => GET(new NextRequest(`http://localhost/api/reports/class-grades-pdf?classId=${classId}`)));
};

before(async () => {
  ({ GET } = await import("../../src/app/api/reports/class-grades-pdf/route"));
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic PDF school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  for (const [schoolId, campusId] of [[schoolA, campusA1], [schoolA, campusA2], [schoolB, campusB1]]) await raw.campus.create({ data: { id: campusId, schoolId, name: `Synthetic ${campusId.slice(0, 4)}`, regId: campusId, city: "Riyadh" } });
  const users = [
    { id: teacherClassTeacher, schoolId: schoolA, campusId: campusA1, role: "TEACHER" },
    { id: teacherSubject, schoolId: schoolA, campusId: campusA1, role: "TEACHER" },
    { id: campusAdminA1, schoolId: schoolA, campusId: campusA1, role: "CAMPUS_ADMIN" },
    { id: principalB1, schoolId: schoolB, campusId: campusB1, role: "PRINCIPAL" },
  ];
  for (const u of users) await raw.user.create({ data: { id: u.id, schoolId: u.schoolId, campusId: u.campusId, role: u.role as "TEACHER", email: `${u.id}@example.invalid`, fullName: `Synthetic ${u.role}`, onboardingComplete: true } });
  const classes = [
    { id: classA, schoolId: schoolA, campusId: campusA1, name: "Synthetic A", classTeacherId: teacherClassTeacher },
    { id: classSubjectA, schoolId: schoolA, campusId: campusA1, name: "Synthetic A2", classTeacherId: null },
    { id: classB, schoolId: schoolA, campusId: campusA1, name: "Synthetic B", classTeacherId: null },
    { id: classOtherCampus, schoolId: schoolA, campusId: campusA2, name: "Synthetic C", classTeacherId: null },
    { id: classOtherSchool, schoolId: schoolB, campusId: campusB1, name: "Synthetic D", classTeacherId: null },
  ];
  for (const c of classes) await raw.class.create({ data: { ...c, academicYear: 2027 } });
  // The subject teacher teaches one subject in the second class only.
  await raw.subject.create({ data: { schoolId: schoolA, campusId: campusA1, classId: classSubjectA, name: "Maths", teacherId: teacherSubject } });
});
after(async () => {
  await raw.subject.deleteMany({ where: { schoolId: { in: [schoolA, schoolB] } } });
  await raw.class.deleteMany({ where: { schoolId: { in: [schoolA, schoolB] } } });
  await raw.user.deleteMany({ where: { schoolId: { in: [schoolA, schoolB] } } });
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
});

test("a teacher downloads grades for the class they lead, or a subject they teach", async () => {
  current = { userId: teacherClassTeacher, schoolId: schoolA, campusId: campusA1, role: "TEACHER" };
  generated.length = 0;
  assert.equal((await fetchPdf(classA)).status, 200);
  current = { userId: teacherSubject, schoolId: schoolA, campusId: campusA1, role: "TEACHER" };
  assert.equal((await fetchPdf(classSubjectA)).status, 200);
  assert.deepEqual(generated, [classA, classSubjectA]);
});

test("a teacher assigned to Class A gets 403 with no learner data for an unassigned class on the same campus", async () => {
  current = { userId: teacherClassTeacher, schoolId: schoolA, campusId: campusA1, role: "TEACHER" };
  generated.length = 0;
  const response = await fetchPdf(classB);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("content-type")?.includes("pdf"), false);
  assert.deepEqual(generated, [], "the roster is never rendered");
  assert.match(JSON.stringify(await response.json()), /outside your classes/);
});

test("a teacher is refused a class on another campus of the same school", async () => {
  current = { userId: teacherClassTeacher, schoolId: schoolA, campusId: campusA1, role: "TEACHER" };
  generated.length = 0;
  // The campus-scoped query hides the other campus (404); a 403 from the campus fence is equally a refusal.
  assert.ok([403, 404].includes((await fetchPdf(classOtherCampus)).status));
  assert.deepEqual(generated, []);
});

test("campus leaders keep their broader scope on the same campus", async () => {
  current = { userId: campusAdminA1, schoolId: schoolA, campusId: campusA1, role: "CAMPUS_ADMIN" };
  generated.length = 0;
  assert.equal((await fetchPdf(classB)).status, 200, "a campus admin reads every class on the campus");
  assert.deepEqual(generated, [classB]);
});

test("a principal in another school cannot reach these classes", async () => {
  current = { userId: principalB1, schoolId: schoolB, campusId: campusB1, role: "PRINCIPAL" };
  generated.length = 0;
  assert.equal((await fetchPdf(classA)).status, 404, "the class is not in this school");
  assert.deepEqual(generated, []);
  assert.equal((await fetchPdf(classOtherSchool)).status, 200, "the principal reads their own school's class");
});
