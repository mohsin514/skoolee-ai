import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { errorResponse, isForeignKeyViolation, LINKED_RECORDS_CONFLICT } from "../../src/lib/api/scope";

// SKAI-1805 (DB-01 Phase 0a): deleting a campus, exam, subject, invoice or an original payment must not take
// payments, marks or report cards with it. A whole-school purge still cascades, and stays inside its school.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
type Fixture = Awaited<ReturnType<typeof seedSchool>>;
let a: Fixture, b: Fixture;

async function seedSchool(label: string) {
  const schoolId = `rc1805-${label}-${randomUUID()}`, campusId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: `Synthetic ${label} School`, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: `${label} Main`, regId: campusId, city: "Lahore" } });
  const cls = await db.class.create({ data: { schoolId, campusId, name: "Five", academicYear: 2026 } });
  const student = await db.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: `Synthetic ${label} Pupil`, rollNo: "1", gender: "FEMALE", enrollmentDate: new Date("2026-04-01T00:00:00Z") } });
  const subject = await db.subject.create({ data: { schoolId, campusId, classId: cls.id, name: "Mathematics" } });
  const exam = await db.exam.create({ data: { schoolId, campusId, classId: cls.id, title: "Mid-term", term: "Term 1", academicYear: 2026 } });
  const mark = await db.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId: student.id, subjectId: subject.id, marksObtained: 71 } });
  const reportCard = await db.reportCard.create({ data: { schoolId, campusId, studentId: student.id, examId: exam.id } });
  const day = new Date("2026-09-01T00:00:00Z");
  const invoice = await db.invoice.create({ data: { schoolId, campusId, studentId: student.id, invoiceDate: day, dueDate: day, monthlyFee: 500000, subtotal: 500000, totalAmount: 500000, balanceDue: 0 } });
  const payment = await db.payment.create({ data: { schoolId, campusId, invoiceId: invoice.id, studentId: student.id, amount: 500000, paymentDate: day, paymentMethod: "CASH" } });
  const reversal = await db.payment.create({ data: { schoolId, campusId, invoiceId: invoice.id, studentId: student.id, amount: -500000, paymentDate: day, paymentMethod: "CASH", reversalOfId: payment.id } });
  return { schoolId, campusId, classId: cls.id, subject, exam, mark, reportCard, invoice, payment, reversal };
}

async function refused(run: () => Promise<unknown>, { anyRefusal = false } = {}) {
  const error = await run().then(() => null, (e: unknown) => e);
  assert.ok(error, "the delete should have been refused");
  if (anyRefusal) return;
  assert.ok(isForeignKeyViolation(error), `expected a foreign key refusal (P2003), got ${String((error as { code?: string })?.code ?? error)}`);
}

before(async () => { a = await seedSchool("A"); b = await seedSchool("B"); });
after(async () => {
  for (const s of [a, b]) if (s) await db.school.delete({ where: { id: s.schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("an exam or subject with marks and report cards cannot be deleted; the records stay", async () => {
  await refused(() => db.exam.delete({ where: { id: a.exam.id } }));
  await refused(() => db.subject.delete({ where: { id: a.subject.id } }));
  assert.equal(await db.mark.count({ where: { id: a.mark.id } }), 1);
  assert.equal(await db.reportCard.count({ where: { id: a.reportCard.id } }), 1);
});

test("an invoice with payments and an original payment with a reversal cannot be deleted", async () => {
  await refused(() => db.invoice.delete({ where: { id: a.invoice.id } }));
  // Issued payments are also guarded by a trigger, which may fire before the reversal foreign key.
  await refused(() => db.payment.delete({ where: { id: a.payment.id } }), { anyRefusal: true });
  assert.equal(await db.payment.count({ where: { invoiceId: a.invoice.id } }), 2);
});

test("a campus with money or grade records cannot be deleted on its own", async () => {
  await refused(() => db.campus.delete({ where: { id: a.campusId } }));
  assert.equal(await db.invoice.count({ where: { campusId: a.campusId } }), 1);
  assert.equal(await db.mark.count({ where: { campusId: a.campusId } }), 1);
});

test("an exam with no marks or report cards still deletes", async () => {
  const empty = await db.exam.create({ data: { schoolId: a.schoolId, campusId: a.campusId, classId: a.classId, title: "Unused quiz", term: "Term 1", academicYear: 2026 } });
  await db.exam.delete({ where: { id: empty.id } });
  assert.equal(await db.exam.count({ where: { id: empty.id } }), 0);
});

test("purging a whole school still cascades through its records and leaves the other school untouched", async () => {
  await db.school.delete({ where: { id: a.schoolId } });
  assert.equal(await db.payment.count({ where: { schoolId: a.schoolId } }), 0);
  assert.equal(await db.mark.count({ where: { schoolId: a.schoolId } }), 0);
  assert.equal(await db.payment.count({ where: { schoolId: b.schoolId } }), 2);
  assert.equal(await db.mark.count({ where: { schoolId: b.schoolId } }), 1);
  assert.equal(await db.reportCard.count({ where: { schoolId: b.schoolId } }), 1);
});

test("a refused delete reaches the reader as a 409 they can act on, not a 500", async () => {
  const refusal = await db.exam.delete({ where: { id: b.exam.id } }).then(() => null, (e: unknown) => e);
  const response = errorResponse(refusal, "[exams] DELETE failed");
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: LINKED_RECORDS_CONFLICT, code: "LINKED_RECORDS" });
});
