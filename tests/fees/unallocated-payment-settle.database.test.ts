import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { recordPayment } from "../../src/lib/fees/payment";

// SKAI-2091: a seeded PARTIAL invoice whose earlier payment has no payment_allocations row must settle to PAID
// when the remaining balance is collected, and the demo seed must write the allocation rows.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only an isolated local PostgreSQL.");
const raw = new PrismaClient();
const schoolId = `unalloc-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID();
let studentId = "", invoiceId = "";

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Unallocated", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Main", regId: campusId, city: "Lahore" } });
  await raw.user.create({ data: { id: userId, email: `${randomUUID()}@example.invalid`, password: "x", fullName: "Synthetic Accountant", role: "ACCOUNTANT" as never, schoolId, campusId, isActive: true } });
  const cls = await raw.class.create({ data: { schoolId, campusId, name: "Grade 5", academicYear: 2026 } });
  studentId = (await raw.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: "Synthetic Pupil", rollNo: "R-1", gender: "MALE" } })).id;
  const invoice = await raw.invoice.create({ data: { schoolId, campusId, studentId, invoiceNumber: `INV-${randomUUID()}`, invoiceDate: new Date(), dueDate: new Date(), monthlyFee: 4600, subtotal: 4600, totalAmount: 4600, totalAmountPaid: 2300, balanceDue: 2300, status: "PARTIAL", generatedAt: new Date() } });
  invoiceId = invoice.id;
  // Seed-style payment: no allocation row.
  await raw.payment.create({ data: { schoolId, campusId, invoiceId, studentId, amount: 2300, paymentDate: new Date(), paymentMethod: "CASH", receiptNo: `RCP-${randomUUID()}`, recordedBy: userId } });
});

after(async () => {
  await raw.paymentAllocation.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await raw.payment.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await raw.invoice.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await raw.$disconnect(); await prisma.$disconnect();
});

test("collecting the remaining balance on a seeded PARTIAL invoice settles it PAID", async () => {
  await runWithTenantContext({ schoolId, campusId, userId, role: "ACCOUNTANT" }, () => prisma.$transaction(tx => recordPayment(tx, { campusId, invoiceId, studentId, amount: 2300, paymentDate: new Date(), paymentMethod: "CASH", recordedBy: userId })));
  const invoice = await raw.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  assert.deepEqual([invoice.status, invoice.totalAmountPaid, invoice.balanceDue], ["PAID", 4600, 0]);
});

test("the demo seed allocates every payment it creates", () => {
  const seed = readFileSync("prisma/seed.ts", "utf8");
  assert.match(seed, /INSERT INTO payment_allocations[\s\S]*NOT EXISTS \(SELECT 1 FROM payment_allocations/);
});
