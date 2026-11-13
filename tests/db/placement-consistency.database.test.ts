import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// SKAI-1888 (DB-01 Phase 3c): a student's class, campus and roll number always match their open enrollment.
// The check runs at commit, so a transaction may update the student and the enrollment in either order.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
const schoolId = `pc1888-${randomUUID()}`, campusId = randomUUID();
let classA: string, classB: string;

const refusal = async (run: () => Promise<unknown>) => {
  const error = await run().then(() => null, (e: unknown) => e);
  assert.ok(error, "the transaction should have been refused at commit");
  assert.match(String((error as Error).message), /open enrollment|placement/);
};

async function newStudent(rollNo: string) {
  return db.student.create({ data: { schoolId, campusId, classId: classA, fullName: `Synthetic Placement ${rollNo}`, rollNo, gender: "FEMALE", enrollmentDate: new Date("2026-04-01T00:00:00Z") } });
}
const openEnrollment = (studentId: string) => db.studentEnrollment.findFirstOrThrow({ where: { studentId, endDate: null } });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Placement School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Hyderabad", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Placement Main", regId: campusId, city: "Hyderabad" } });
  classA = (await db.class.create({ data: { schoolId, campusId, name: "Twelve", section: "A", academicYear: 2026 } })).id;
  classB = (await db.class.create({ data: { schoolId, campusId, name: "Twelve", section: "B", academicYear: 2026 } })).id;
});
after(async () => {
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("a new student and the enrollment the database opens for them agree", async () => {
  const s = await newStudent("1");
  const e = await openEnrollment(s.id);
  assert.deepEqual([e.classId, e.campusId, e.rollNo], [s.classId, s.campusId, s.rollNo]);
});

test("moving a student's class without moving the enrollment is refused at commit", async () => {
  const s = await newStudent("2");
  await refusal(() => db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.enrollment_reviewed', ${s.id}, true)`;
    await tx.student.update({ where: { id: s.id }, data: { classId: classB } });
  }));
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: s.id } })).classId, classA, "rolled back");
});

test("a transfer that updates both sides commits, whichever is written first", async () => {
  for (const studentFirst of [true, false]) {
    const s = await newStudent(studentFirst ? "3" : "4");
    const from = await openEnrollment(s.id);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.enrollment_reviewed', ${s.id}, true)`;
      const moveStudent = () => tx.student.update({ where: { id: s.id }, data: { classId: classB } });
      const moveEnrollment = async () => {
        await tx.studentEnrollment.update({ where: { id: from.id }, data: { endDate: new Date("2026-09-01T00:00:00Z"), status: "ENDED" } });
        await tx.studentEnrollment.create({ data: { schoolId, studentId: s.id, campusId, classId: classB, campusName: "Placement Main", className: "Twelve B", curriculum: "National", academicYear: 2026, rollNo: s.rollNo, startDate: new Date("2026-09-01T00:00:00Z"), origin: "TRANSFER" } });
      };
      if (studentFirst) { await moveStudent(); await moveEnrollment(); } else { await moveEnrollment(); await moveStudent(); }
    });
    assert.equal((await openEnrollment(s.id)).classId, classB);
  }
});

test("closing an active student's enrollment without withdrawing or archiving them is refused", async () => {
  const s = await newStudent("5");
  const open = await openEnrollment(s.id);
  await refusal(() => db.studentEnrollment.update({ where: { id: open.id }, data: { endDate: new Date("2026-09-01T00:00:00Z"), status: "ENDED" } }));
  assert.equal((await openEnrollment(s.id)).id, open.id, "still open");
});

test("an administrative archive keeps the open enrollment, and restore still works", async () => {
  const s = await newStudent("6");
  await db.student.update({ where: { id: s.id }, data: { status: "archived", archivedAt: new Date() } });
  assert.equal((await openEnrollment(s.id)).classId, classA);
  await db.student.update({ where: { id: s.id }, data: { status: "active", archivedAt: null } });
});
