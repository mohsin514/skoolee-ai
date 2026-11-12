import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// SKAI-1844 (DB-01 Phase 1b): invoice numbers and guardian consent receipt codes are unique per school, so two
// schools can hold the same value while one school still cannot hold it twice.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
type Fixture = Awaited<ReturnType<typeof seedSchool>>;
let a: Fixture, b: Fixture;

async function seedSchool(label: string) {
  const schoolId = `bn1844-${label}-${randomUUID()}`, campusId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: `Synthetic ${label} School`, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: `${label} Main`, regId: campusId, city: "Lahore" } });
  const cls = await db.class.create({ data: { schoolId, campusId, name: "Six", academicYear: 2026 } });
  const student = await db.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: `Synthetic ${label} Pupil`, rollNo: "1", gender: "MALE", enrollmentDate: new Date("2026-04-01T00:00:00Z") } });
  const guardian = await db.user.create({ data: { schoolId, campusId, email: `${randomUUID()}@example.invalid`, password: "not-a-real-hash", fullName: `Synthetic ${label} Guardian`, role: "PARENT" } });
  return { schoolId, campusId, studentId: student.id, guardianId: guardian.id };
}

const day = new Date("2026-09-01T00:00:00Z");
const invoice = (s: Fixture, invoiceNumber: string) => db.invoice.create({ data: { schoolId: s.schoolId, campusId: s.campusId, studentId: s.studentId, invoiceNumber, invoiceDate: day, dueDate: day, monthlyFee: 100000, subtotal: 100000, totalAmount: 100000, balanceDue: 100000 } });
const consent = (s: Fixture, receiptCode: string) => db.guardianConsent.create({ data: { schoolId: s.schoolId, campusId: s.campusId, studentId: s.studentId, guardianUserId: s.guardianId, relationshipId: randomUUID(), guardianName: "Synthetic Guardian", choices: {}, noticeVersion: "v1", language: "en", receiptCode } });
const code = async (run: () => Promise<unknown>) => (await run().then(() => null, (e: unknown) => e) as { code?: string } | null)?.code;

before(async () => { a = await seedSchool("A"); b = await seedSchool("B"); });
after(async () => {
  for (const s of [a, b]) if (s) {
    await db.guardianConsent.deleteMany({ where: { schoolId: s.schoolId } }).catch(() => undefined);
    await db.school.delete({ where: { id: s.schoolId } }).catch(() => undefined);
  }
  await db.$disconnect();
});

test("two schools can issue the same invoice number; one school cannot issue it twice", async () => {
  // The generator's format: INV-{year}-{4 chars of the campus id}-{per-campus sequence}. Campuses in different
  // schools can share those 4 characters, which used to fail the second school's invoice run.
  const number = "INV-2026-ABCD-00001";
  await invoice(a, number);
  await invoice(b, number);
  assert.equal(await db.invoice.count({ where: { invoiceNumber: number } }), 2);
  assert.equal(await code(() => invoice(a, number)), "P2002");
});

test("two schools can hold the same consent receipt code; one school cannot hold it twice", async () => {
  const receipt = "GC-0A1B2C3D";
  await consent(a, receipt);
  await consent(b, receipt);
  assert.equal(await db.guardianConsent.count({ where: { receiptCode: receipt } }), 2);
  assert.equal(await code(() => consent(a, receipt)), "P2002");
});
