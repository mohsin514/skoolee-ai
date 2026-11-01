import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { runAsUser } from "../../src/lib/db/tenant-context";

// SKAI-1433: an exempt paper is not an attempted score. Like an absent paper it leaves both the class and
// subject average numerators and denominators. Runs on the isolated local database only.
const local = "postgresql://postgres@127.0.0.1:55433/postgres";
if (process.env.DATABASE_URL !== local) throw new Error("Use only the isolated local marks database.");

const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
const state: { user: Record<string, unknown> | null } = { user: null };
let GET: (req: never) => Promise<Response>;

const db = new PrismaClient({ datasourceUrl: local });
const tag = `marks-${randomUUID()}`;
const schoolA = `${tag}-a`, schoolB = `${tag}-b`;
type Fx = { campusA: string; campusB: string; classA: string; examA: string; subjectS1: string; subjectS2: string; teacherS1: string; teacherS2: string; admin: string; teacherOther: string; schoolBAdmin: string; schoolBCampus: string; s1: string; s2: string; s3: string; s4: string };
const fx = {} as Fx;

async function seed() {
  const campusA = randomUUID(), campusB = randomUUID(), campusBB = randomUUID();
  fx.campusA = campusA; fx.campusB = campusB; fx.schoolBCampus = campusBB;
  await db.school.createMany({ data: [
    { id: schoolA, name: "QA-01 A", slug: schoolA, regId: schoolA, contactEmail: `${schoolA}@example.invalid`, city: "Test", status: "ACTIVE" },
    { id: schoolB, name: "QA-01 B", slug: schoolB, regId: schoolB, contactEmail: `${schoolB}@example.invalid`, city: "Test", status: "ACTIVE" },
  ] });
  await db.campus.createMany({ data: [
    { id: campusA, schoolId: schoolA, name: "A campus 1", regId: campusA, city: "Test" },
    { id: campusB, schoolId: schoolA, name: "A campus 2", regId: campusB, city: "Test" },
    { id: campusBB, schoolId: schoolB, name: "B campus", regId: campusBB, city: "Test" },
  ] });
  const classA = randomUUID(), examA = randomUUID(), s1 = randomUUID(), s2 = randomUUID(), s3 = randomUUID(), s4 = randomUUID();
  Object.assign(fx, { classA, examA, s1, s2, s3, s4 });
  fx.subjectS1 = randomUUID(); fx.subjectS2 = randomUUID();
  fx.teacherS1 = randomUUID(); fx.teacherS2 = randomUUID(); fx.admin = randomUUID(); fx.teacherOther = randomUUID(); fx.schoolBAdmin = randomUUID();
  const userRow = (id: string, schoolId: string, campusId: string, role: string) => ({ id, schoolId, campusId, email: `${id}@example.invalid`, fullName: `Synthetic ${role}`, role: role as never });
  await db.user.createMany({ data: [
    userRow(fx.teacherS1, schoolA, campusA, "TEACHER"),
    userRow(fx.teacherS2, schoolA, campusA, "TEACHER"),
    userRow(fx.teacherOther, schoolA, campusA, "TEACHER"),
    userRow(fx.admin, schoolA, campusA, "CAMPUS_ADMIN"),
    userRow(fx.schoolBAdmin, schoolB, campusBB, "CAMPUS_ADMIN"),
  ] });
  await db.class.create({ data: { id: classA, schoolId: schoolA, campusId: campusA, name: "Grade 8", academicYear: 2026 } });
  await db.subject.createMany({ data: [
    { id: fx.subjectS1, schoolId: schoolA, campusId: campusA, classId: classA, name: "Mathematics", totalMarks: 100, teacherId: fx.teacherS1 },
    { id: fx.subjectS2, schoolId: schoolA, campusId: campusA, classId: classA, name: "Science", totalMarks: 100, teacherId: fx.teacherS2 },
  ] });
  await db.student.createMany({ data: [s1, s2, s3, s4].map((id, i) => ({ id, schoolId: schoolA, campusId: campusA, classId: classA, fullName: `Synthetic pupil ${i + 1}`, rollNo: String(i + 1), gender: "MALE" as never })) });
  await db.exam.create({ data: { id: examA, schoolId: schoolA, campusId: campusA, classId: classA, title: "Term 1", term: "T1", academicYear: 2026 } });
}

// Marks for one subject: pupil 1 scored 80/100 and pupil 2 is exempt (the two-row example in the ticket).
async function markRow(subjectId: string, studentId: string, data: { marksObtained: number; isAbsent?: boolean; isExempt?: boolean }) {
  await db.mark.create({ data: { schoolId: schoolA, campusId: fx.campusA, examId: fx.examA, subjectId, studentId, marksObtained: data.marksObtained, isAbsent: data.isAbsent ?? false, isExempt: data.isExempt ?? false, grade: null } });
}

async function getAnalytics(user: { userId: string; role: string; schoolId: string; campusId: string | null; email: string }) {
  state.user = user;
  return runAsUser({ schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: user.role }, async () => {
    const res = await GET(new Request(`http://localhost/api/marks?examId=${fx.examA}`) as never);
    return { status: res.status, body: await res.json() };
  });
}

const asUser = (id: string, role: string, schoolId: string, campusId: string) => ({ userId: id, role, schoolId, campusId, email: `${id}@example.invalid` });

before(async () => {
  const real = await import(src("lib/auth.ts"));
  mock.module(src("lib/auth.ts"), { namedExports: { ...real, getAuthUser: async () => state.user } });
  GET = (await import(src("app/api/marks/route.ts"))).GET;
  await seed();
});
// Rows are keyed by a unique tag on a disposable local database, so they are left in place for inspection.
after(async () => { await db.$disconnect(); });

test("two-row example: one 80/100 and one exempt pupil average 80% for class and subject", async () => {
  await markRow(fx.subjectS1, fx.s1, { marksObtained: 80 });
  await markRow(fx.subjectS1, fx.s2, { marksObtained: 0, isExempt: true });
  const { status, body } = await getAnalytics(asUser(fx.admin, "CAMPUS_ADMIN", schoolA, fx.campusA));
  assert.equal(status, 200);
  assert.equal(body.analytics.classAverage, 80);
  assert.equal(body.analytics.subjectAverages.find((s: { subjectId: string }) => s.subjectId === fx.subjectS1).average, 80);
  assert.equal(body.analytics.subjectAverages.find((s: { subjectId: string }) => s.subjectId === fx.subjectS1).entries, 1);
});

test("absent and exempt papers in the same subject are both excluded from the average", async () => {
  await markRow(fx.subjectS2, fx.s1, { marksObtained: 60 });
  await markRow(fx.subjectS2, fx.s2, { marksObtained: 0, isAbsent: true });
  await markRow(fx.subjectS2, fx.s3, { marksObtained: 0, isExempt: true });
  await markRow(fx.subjectS2, fx.s4, { marksObtained: 40 });
  const { body } = await getAnalytics(asUser(fx.admin, "CAMPUS_ADMIN", schoolA, fx.campusA));
  const science = body.analytics.subjectAverages.find((s: { subjectId: string }) => s.subjectId === fx.subjectS2);
  assert.equal(science.average, 50, "(60 + 40) / 2 across the two scored papers");
  assert.equal(science.entries, 2);
});

test("teacher scoped to a subject sees only that subject's exempt-aware average", async () => {
  const { status, body } = await getAnalytics(asUser(fx.teacherS1, "TEACHER", schoolA, fx.campusA));
  assert.equal(status, 200);
  assert.equal(body.analytics.subjectAverages.length, 1);
  assert.equal(body.analytics.subjectAverages[0].average, 80);
});

test("a teacher with no assignment to this exam's subjects is refused", async () => {
  const { status } = await getAnalytics(asUser(fx.teacherOther, "TEACHER", schoolA, fx.campusA));
  assert.equal(status, 403);
});

test("another campus of the same school cannot read the exam analytics", async () => {
  const { status, body } = await getAnalytics(asUser(fx.admin, "CAMPUS_ADMIN", schoolA, fx.campusB));
  assert.ok(status === 403 || status === 404, `denied, got ${status}`);
  assert.equal(body.analytics, undefined);
});

test("a second school's admin cannot read this school's exam analytics", async () => {
  const { status, body } = await getAnalytics(asUser(fx.schoolBAdmin, "CAMPUS_ADMIN", schoolB, fx.schoolBCampus));
  assert.ok(status === 403 || status === 404, `denied, got ${status}`);
  assert.equal(body.analytics, undefined);
});
