import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// SKAI-1887 (DB-01 Phase 3b): every class and enrollment belongs to a real academic cycle of its campus. A class
// created for a year the campus has not set up gets that year as a DRAFT cycle automatically (product decision
// 2026-11-13); an existing cycle is never changed; a cycle in use cannot be deleted or renumbered.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
const schoolId = `ay1887-${randomUUID()}`, campusId = randomUUID();
const code = async (run: () => Promise<unknown>) => (await run().then(() => null, (e: unknown) => e) as { code?: string } | null)?.code;

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Year School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Quetta", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Year Main", regId: campusId, city: "Quetta" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "Session 2026", academicYear: 2026, status: "ACTIVE" } });
});
after(async () => {
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("a class in a year the campus has not set up creates that year as a DRAFT cycle", async () => {
  const cls = await db.class.create({ data: { schoolId, campusId, name: "Ten", academicYear: 2027 }, include: { cycle: true } });
  assert.equal(cls.cycle.academicYear, 2027);
  assert.equal(cls.cycle.status, "DRAFT");
  assert.equal(cls.cycle.label, "2027-28");
  assert.equal(cls.cycle.schoolId, schoolId);
});

test("a class in an existing year uses that cycle and leaves it unchanged", async () => {
  const cls = await db.class.create({ data: { schoolId, campusId, name: "Eleven", academicYear: 2026 }, include: { cycle: true } });
  assert.equal(cls.cycle.label, "Session 2026");
  assert.equal(cls.cycle.status, "ACTIVE");
  assert.equal(await db.academicCycle.count({ where: { campusId, academicYear: 2026 } }), 1);
});

test("a student's enrollment sits in its class's cycle", async () => {
  const cls = await db.class.findFirstOrThrow({ where: { campusId, academicYear: 2026 } });
  const student = await db.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: "Synthetic Year Pupil", rollNo: "1", gender: "MALE", enrollmentDate: new Date("2026-04-01T00:00:00Z") } });
  const enrollment = await db.studentEnrollment.findFirstOrThrow({ where: { studentId: student.id }, include: { cycle: true } });
  assert.equal(enrollment.cycle.academicYear, 2026);
});

test("a cycle in use cannot be deleted, and its year cannot be renumbered under its classes", async () => {
  const cycle = await db.academicCycle.findUniqueOrThrow({ where: { campusId_academicYear: { campusId, academicYear: 2027 } } });
  assert.equal(await code(() => db.academicCycle.delete({ where: { id: cycle.id } })), "P2003");
  assert.equal(await code(() => db.academicCycle.update({ where: { id: cycle.id }, data: { academicYear: 2030 } })), "P2003");
  assert.equal((await db.academicCycle.findUniqueOrThrow({ where: { id: cycle.id } })).academicYear, 2027);
});
