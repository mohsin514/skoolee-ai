import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { request as playwrightRequest, type APIRequestContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-432 / SKO-475 on the isolated database and app: a manual collection replays to its original
// receipt under the same key and conflicts on a changed request; concurrent issuance never repeats a
// receipt number; and a provider confirmation replayed concurrently settles once.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.FEES_TEST_APP || "http://localhost:3107";
const db = new PrismaClient(), password = "SyntheticCollect432!";
const schoolId = `col432-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), adminEmail = `${randomUUID()}@example.invalid`;
const students: string[] = [];
let api: APIRequestContext;

const invoice = (studentId: string, amount = 100000, currency = "PKR") => db.invoice.create({ data: { schoolId, campusId, studentId, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-10-01Z"), currency, invoiceNumber: `SYN-432-${randomUUID().slice(0, 8)}`, monthlyFee: amount, subtotal: amount, totalAmount: amount, balanceDue: amount } });
const collect = (body: Record<string, unknown>) => api.post(`${base}/api/fees/collect`, { data: { paymentMethod: "CASH", paymentDate: "2026-10-10", ...body } });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Banyan School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Multan", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Banyan Main", regId: campusId, city: "Multan" } });
  await db.user.create({ data: { email: adminEmail, password: await bcrypt.hash(password, 12), fullName: "Synthetic bursar", role: "CAMPUS_ADMIN", schoolId, campusId, isActive: true, onboardingComplete: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Four", academicYear: 2026 } });
  for (let i = 0; i < 22; i++) { const id = randomUUID(); students.push(id); await db.student.create({ data: { id, schoolId, campusId, classId, fullName: `Synthetic Pupil ${i}`, rollNo: `B-${i}`, gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } }); }
  await db.authAttempt.deleteMany({});
  api = await playwrightRequest.newContext({ baseURL: base });
  assert.equal((await api.post("/api/auth/login", { data: { email: adminEmail, password } })).status(), 200);
  const { secret } = await (await api.post("/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await api.post("/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await api.post("/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
});
after(async () => { await api?.dispose(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("a manual collection without an operation key is refused", async () => {
  const inv = await invoice(students[0]);
  assert.equal((await collect({ studentId: students[0], invoiceId: inv.id, amount: 1000 })).status(), 400);
  assert.equal(await db.payment.count({ where: { invoiceId: inv.id } }), 0);
});

test("a retried collection replays its original receipt; a changed request under the same key conflicts", async () => {
  const inv = await invoice(students[1]), key = randomUUID();
  const first = await collect({ studentId: students[1], invoiceId: inv.id, amount: 40000, idempotencyKey: key });
  assert.equal(first.status(), 201);
  const receipt = (await first.json()).data.receiptNumber;
  const again = await collect({ studentId: students[1], invoiceId: inv.id, amount: 40000, idempotencyKey: key });
  assert.equal(again.status(), 200);
  assert.deepEqual([(await again.json()).data.replayed, (await again.json()).data.receiptNumber], [true, receipt]);
  const changed = await collect({ studentId: students[1], invoiceId: inv.id, amount: 45000, idempotencyKey: key });
  assert.equal(changed.status(), 409);
  const payments = await db.payment.findMany({ where: { invoiceId: inv.id }, select: { id: true } });
  assert.equal(payments.length, 1);
  assert.equal(await db.paymentAllocation.count({ where: { paymentId: payments[0].id } }), 1);
  assert.equal(await db.ledgerEntry.count({ where: { paymentId: payments[0].id } }), 1);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).balanceDue, 60000);
  assert.equal(await db.auditLog.count({ where: { tableName: "payment", recordId: payments[0].id } }), 1, "one audit entry, committed with the payment");
});

test("five concurrent retries with the same key post one payment and all answer with its receipt", async () => {
  const inv = await invoice(students[2]), key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 5 }, () => collect({ studentId: students[2], invoiceId: inv.id, amount: 25000, idempotencyKey: key })));
  const receipts = await Promise.all(responses.map(async response => (await response.json()).data?.receiptNumber));
  assert.deepEqual(responses.map(r => r.status()).filter(s => s >= 400), []);
  assert.equal(new Set(receipts).size, 1);
  assert.equal(await db.payment.count({ where: { invoiceId: inv.id } }), 1);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).balanceDue, 75000);
});

test("twenty simultaneous collections on different invoices get twenty distinct receipt numbers", async () => {
  const invoices = await Promise.all(students.slice(2, 22).map(student => invoice(student, 50000)));
  const responses = await Promise.all(invoices.map(inv => collect({ studentId: inv.studentId, invoiceId: inv.id, amount: 50000, idempotencyKey: randomUUID() })));
  assert.deepEqual(responses.map(r => r.status()), Array(20).fill(201));
  const receipts = (await db.payment.findMany({ where: { campusId }, select: { receiptNo: true } })).map(p => p.receiptNo);
  assert.equal(new Set(receipts).size, receipts.length, "no receipt number repeats in the campus");
  for (const inv of invoices) assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).balanceDue, 0);
});

test("the sequence restarts per year across the year boundary", async () => {
  const late = await invoice(students[0], 100000), early = await invoice(students[0], 100000);
  const december = await (await collect({ studentId: students[0], invoiceId: late.id, amount: 1000, paymentDate: "2026-12-31", idempotencyKey: randomUUID() })).json();
  const january = await (await collect({ studentId: students[0], invoiceId: early.id, amount: 1000, paymentDate: "2027-01-01", idempotencyKey: randomUUID() })).json();
  assert.match(december.data.receiptNumber, /^RCP-2026-/);
  assert.match(january.data.receiptNumber, /^RCP-2027-.*-00001$/);
});

test("a provider confirmation replayed ten times at once settles one payment and one ledger entry", async () => {
  const inv = await invoice(students[3], 70000);
  const orderRef = `SKLFEE-SYN${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  await db.onlinePaymentOrder.create({ data: { schoolId, campusId, invoiceId: inv.id, studentId: students[3], amount: 70000, orderRef } });
  const results = await Promise.all(Array.from({ length: 10 }, () => api.post(`${base}/api/safepay/simulate`, { data: { orderRef } })));
  assert.deepEqual(results.map(r => r.status()).filter(s => s !== 200), []);
  const payments = await db.payment.findMany({ where: { invoiceId: inv.id }, select: { id: true } });
  assert.equal(payments.length, 1);
  assert.equal(await db.ledgerEntry.count({ where: { paymentId: payments[0].id } }), 1);
  assert.equal((await db.onlinePaymentOrder.findUniqueOrThrow({ where: { orderRef } })).status, "COMPLETED");
});
