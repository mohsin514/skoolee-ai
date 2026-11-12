import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// SKAI-1853 (DB-01 Phase 3a): where an enrollment and an attendance register sit (class, campus) is a real
// foreign key pinned to the row's school, and a class or campus with that history cannot be deleted on its own.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
type Fixture = Awaited<ReturnType<typeof seedSchool>>;
let a: Fixture, b: Fixture;

async function seedSchool(label: string) {
  const schoolId = `ep1853-${label}-${randomUUID()}`, campusId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: `Synthetic ${label} School`, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Multan", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: `${label} Main`, regId: campusId, city: "Multan" } });
  const cls = await db.class.create({ data: { schoolId, campusId, name: `Nine-${label}`, academicYear: 2026 } });
  // Creating a student also creates its enrollment (database trigger).
  const student = await db.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: `Synthetic ${label} Pupil`, rollNo: "1", gender: "FEMALE", enrollmentDate: new Date("2026-04-01T00:00:00Z") } });
  return { schoolId, campusId, classId: cls.id, studentId: student.id };
}

const code = async (run: () => Promise<unknown>) => (await run().then(() => null, (e: unknown) => e) as { code?: string } | null)?.code;

before(async () => { a = await seedSchool("A"); b = await seedSchool("B"); });
after(async () => {
  for (const s of [a, b]) if (s) await db.school.delete({ where: { id: s.schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("each student's enrollment points at its own school's class and campus", async () => {
  const enrollment = await db.studentEnrollment.findFirstOrThrow({ where: { studentId: a.studentId }, include: { class: true, campus: true } });
  assert.equal(enrollment.class.id, a.classId);
  assert.equal(enrollment.campus.schoolId, a.schoolId);
});

test("an attendance register cannot name another school's class or campus, or a class that does not exist", async () => {
  const register = (classId: string, campusId: string) => db.attendanceRegister.create({ data: { schoolId: a.schoolId, campusId, classId, date: new Date("2026-09-01T00:00:00Z") } });
  assert.equal(await code(() => register(b.classId, a.campusId)), "P2003");
  assert.equal(await code(() => register(a.classId, b.campusId)), "P2003");
  assert.equal(await code(() => register(randomUUID(), a.campusId)), "P2003");
});

test("a class with enrollment history cannot be deleted on its own; a whole-school purge still works", async () => {
  // A past class whose only link is a historical enrollment row (no students sit in it now).
  const past = await db.class.create({ data: { schoolId: a.schoolId, campusId: a.campusId, name: "Eight-past", academicYear: 2025 } });
  await db.studentEnrollment.create({ data: { schoolId: a.schoolId, studentId: a.studentId, campusId: a.campusId, classId: past.id, campusName: "A Main", className: "Eight-past", curriculum: "National", academicYear: 2025, rollNo: "1", startDate: new Date("2025-04-01T00:00:00Z"), endDate: new Date("2026-03-31T00:00:00Z"), origin: "LEGACY_TEST" } });
  assert.equal(await code(() => db.class.delete({ where: { id: past.id } })), "P2003");
  assert.equal(await db.studentEnrollment.count({ where: { classId: past.id } }), 1);
  await db.school.delete({ where: { id: a.schoolId } });
  assert.equal(await db.studentEnrollment.count({ where: { schoolId: a.schoolId } }), 0);
  assert.equal(await db.studentEnrollment.count({ where: { schoolId: b.schoolId } }), 1);
});
