import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { request as playwrightRequest, type APIRequestContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-389 on the isolated database and app: history can never be removed by a cascading delete, the
// archive APIs preview and preserve it, restore resolves a reused roll number with a new current
// identifier without touching history, and invoice cancellation refuses money already recorded.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DELETION_TEST_APP || "http://localhost:3107";
const db = new PrismaClient(), password = "SyntheticDeletion389!";
const schoolId = `del389-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), otherClassId = randomUUID();
const adminId = randomUUID(), adminEmail = `${randomUUID()}@example.invalid`;
const pupil = randomUUID(), invoiceId = randomUUID(), paidInvoiceId = randomUUID();
let api: APIRequestContext;

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Juniper School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Juniper Main", regId: campusId, city: "Riyadh" } });
  await db.user.create({ data: { id: adminId, email: adminEmail, password: await bcrypt.hash(password, 12), fullName: "Synthetic juniper admin", role: "CAMPUS_ADMIN", schoolId, campusId, isActive: true, onboardingComplete: true } });
  for (const [id, name] of [[classId, "Seven"], [otherClassId, "Eight"]]) await db.class.create({ data: { id, schoolId, campusId, name, section: "A", academicYear: 2026 } });
  await db.student.create({ data: { id: pupil, schoolId, campusId, classId, fullName: "Synthetic Pupil One", rollNo: "R-01", admissionNo: "ADM-01", gender: "FEMALE", enrollmentDate: new Date("2026-04-01Z") } });
  const subject = await db.subject.create({ data: { schoolId, campusId, classId, name: "Science" } });
  const exam = await db.exam.create({ data: { schoolId, campusId, classId, title: "Synthetic mid-term", term: "1", academicYear: 2026, status: "PUBLISHED" } });
  await db.mark.create({ data: { schoolId, campusId, studentId: pupil, examId: exam.id, subjectId: subject.id, marksObtained: 86 } });
  await db.attendance.create({ data: { schoolId, campusId, classId, studentId: pupil, date: new Date("2026-08-01Z"), status: "PRESENT" } });
  for (const [id, number] of [[invoiceId, "SYN-389-OPEN"], [paidInvoiceId, "SYN-389-PART"]]) await db.invoice.create({ data: { id, schoolId, campusId, studentId: pupil, invoiceDate: new Date("2026-08-01Z"), dueDate: new Date("2026-08-30Z"), currency: "SAR", invoiceNumber: number, monthlyFee: 100000, subtotal: 100000, totalAmount: 100000, balanceDue: 100000 } });
  await db.payment.create({ data: { schoolId, campusId, studentId: pupil, invoiceId: paidInvoiceId, currency: "SAR", amount: 40000, paymentDate: new Date("2026-08-05Z"), paymentMethod: "CASH", receiptNo: `SYN-${randomUUID()}` } });
  await db.invoice.update({ where: { id: paidInvoiceId }, data: { totalAmountPaid: 40000, balanceDue: 60000, status: "PARTIAL" } });
  await db.authAttempt.deleteMany({});
  api = await playwrightRequest.newContext({ baseURL: base });
  assert.equal((await api.post("/api/auth/login", { data: { email: adminEmail, password } })).status(), 200);
  const { secret } = await (await api.post("/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await api.post("/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await api.post("/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
});
after(async () => { await api?.dispose(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

const history = async () => ({ marks: await db.mark.count({ where: { studentId: pupil } }), attendance: await db.attendance.count({ where: { studentId: pupil } }), invoices: await db.invoice.count({ where: { studentId: pupil } }), payments: await db.payment.count({ where: { studentId: pupil } }) });

test("the database refuses a hard delete of a pupil or class that still has history", async () => {
  const before = await history();
  await assert.rejects(() => db.student.delete({ where: { id: pupil } }), /Foreign key constraint|P2003|violates foreign key/i);
  await assert.rejects(() => db.class.delete({ where: { id: classId } }), /Foreign key constraint|P2003|violates foreign key|P2014/i);
  assert.deepEqual(await history(), before, "nothing cascaded away");
});

test("deleting a class with enrolled pupils through the API is refused and its pupils' history stays", async () => {
  const preview = await (await api.delete(`/api/classes?id=${classId}&preview=true`)).json();
  assert.ok(Number(preview.dependencies?.students) >= 1);
  const response = await api.delete(`/api/classes?id=${classId}`, { data: { reason: "Synthetic attempt" } });
  assert.equal(response.status(), 409);
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: classId } })).archivedAt, null);
  assert.deepEqual(await history(), { marks: 1, attendance: 1, invoices: 2, payments: 1 });
});

test("archiving a pupil previews history, keeps it, frees the roll number, and a repeat changes nothing", async () => {
  const preview = await (await api.delete(`/api/students?id=${pupil}&preview=true`)).json();
  assert.deepEqual([preview.permanentDeletion, preview.dependencies.marks, preview.dependencies.invoices, preview.dependencies.payments], ["blocked", 1, 2, 1]);
  assert.equal((await api.delete(`/api/students?id=${pupil}`, { data: { reason: "Synthetic term end" } })).status(), 200);
  const repeat = await (await api.delete(`/api/students?id=${pupil}`, { data: { reason: "Synthetic term end" } })).json();
  assert.equal(repeat.alreadyArchived, true);
  assert.equal(await db.auditLog.count({ where: { tableName: "student", recordId: pupil } }), 1, "the repeat wrote no second audit entry");
  assert.deepEqual(await history(), { marks: 1, attendance: 1, invoices: 2, payments: 1 });
  // Another pupil takes the freed roll number.
  await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Pupil Two", rollNo: "R-01", gender: "MALE", enrollmentDate: new Date("2026-09-01Z") } });
});

test("restore explains a reused roll number, then restores with a new current roll number and unchanged history", async () => {
  const conflict = await api.patch("/api/students", { data: { action: "restore", id: pupil } });
  assert.equal(conflict.status(), 409);
  assert.deepEqual((await conflict.json()).conflict, { rollNo: true, admissionNo: false });
  assert.ok((await db.student.findUniqueOrThrow({ where: { id: pupil } })).archivedAt, "nothing changed on conflict");
  const restored = await api.patch("/api/students", { data: { action: "restore", id: pupil, rollNo: "R-01B" } });
  assert.equal(restored.status(), 200, await restored.text());
  assert.deepEqual(await restored.json(), { success: true, restored: true, rollNo: "R-01B", admissionNo: "ADM-01" });
  const row = await db.student.findUniqueOrThrow({ where: { id: pupil } });
  assert.deepEqual([row.archivedAt, row.status, row.rollNo], [null, "active", "R-01B"]);
  const again = await (await api.patch("/api/students", { data: { action: "restore", id: pupil, rollNo: "R-01C" } })).json();
  assert.deepEqual([again.restored, again.alreadyActive], [false, true], "a repeated restore is a no-op");
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: pupil } })).rollNo, "R-01B");
  const periods = await db.studentEnrollment.findMany({ where: { studentId: pupil }, orderBy: { startDate: "asc" }, select: { rollNo: true, status: true, endDate: true } });
  assert.deepEqual(periods.map(period => [period.rollNo, period.status, Boolean(period.endDate)]), [["R-01", "ENDED", true], ["R-01B", "ACTIVE", false]], "the earlier enrollment keeps its original roll number");
  assert.deepEqual(await history(), { marks: 1, attendance: 1, invoices: 2, payments: 1 });
});

test("an invoice with money recorded cannot be cancelled; an open one cancels once and cannot be reopened", async () => {
  const refused = await api.patch(`/api/fees/invoices/${paidInvoiceId}`, { data: { status: "CANCELLED" } });
  assert.equal(refused.status(), 409);
  assert.match((await refused.json()).error, /payments recorded/);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: paidInvoiceId } })).status, "PARTIAL");
  assert.equal((await api.patch(`/api/fees/invoices/${invoiceId}`, { data: { status: "CANCELLED" } })).status(), 200);
  const repeat = await (await api.patch(`/api/fees/invoices/${invoiceId}`, { data: { status: "CANCELLED" } })).json();
  assert.equal(repeat.unchanged, true);
  assert.equal(await db.auditLog.count({ where: { tableName: "invoice", recordId: invoiceId } }), 1);
  assert.equal((await api.patch(`/api/fees/invoices/${invoiceId}`, { data: { status: "OVERDUE" } })).status(), 409, "a cancelled invoice is not reopened");
});

test("a whole-school delete still removes everything in one statement", async () => {
  const scratch = `del389-scratch-${randomUUID()}`, c = randomUUID(), k = randomUUID(), s = randomUUID();
  await db.school.create({ data: { id: scratch, name: "Synthetic scratch", slug: scratch, regId: scratch, contactEmail: `${scratch}@example.invalid`, city: "Riyadh", status: "ACTIVE" } });
  await db.campus.create({ data: { id: c, schoolId: scratch, name: "Scratch", regId: c, city: "Riyadh" } });
  await db.class.create({ data: { id: k, schoolId: scratch, campusId: c, name: "One", academicYear: 2026 } });
  await db.student.create({ data: { id: s, schoolId: scratch, campusId: c, classId: k, fullName: "Scratch pupil", rollNo: "1", gender: "MALE", enrollmentDate: new Date("2026-01-01Z") } });
  await db.attendance.create({ data: { schoolId: scratch, campusId: c, classId: k, studentId: s, date: new Date("2026-08-01Z"), status: "PRESENT" } });
  await db.school.delete({ where: { id: scratch } });
  assert.equal(await db.student.count({ where: { schoolId: scratch } }), 0);
});

test("a bulk archive reports each pupil's outcome, including ones already archived", async () => {
  const fresh = await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Bulk Pupil", rollNo: "R-77", gender: "FEMALE", enrollmentDate: new Date("2026-04-01Z") } });
  const first = await (await api.patch("/api/students", { data: { ids: [fresh.id], status: "archived" } })).json();
  assert.deepEqual([first.updated, first.unchanged], [1, 0]);
  const again = await (await api.patch("/api/students", { data: { ids: [fresh.id], status: "archived" } })).json();
  assert.deepEqual(again.outcomes, [{ id: fresh.id, outcome: "unchanged" }]);
  assert.deepEqual([again.updated, again.unchanged], [0, 1]);
});
