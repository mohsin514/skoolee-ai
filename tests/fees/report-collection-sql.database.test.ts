import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1826: the collection report aggregates in SQL instead of loading every invoice and payment.
// Its totals must match the per-row rules it replaced (cancelled excluded, overdue only past due,
// enrollment class first), and its scope stays one school and the caller's campus. Two schools,
// two campuses and a denied role are covered.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");

type Who = { userId: string; schoolId: string; campusId: string | null; role: string };
let current: Who | null = null;
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => current } });
let GET: (req: NextRequest) => Promise<Response>;

const raw = new PrismaClient();
const schoolA = `col-a-${randomUUID()}`, schoolB = `col-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const classFour = randomUUID(), classFive = randomUUID(), classA2 = randomUUID(), classB = randomUUID();
const day = 86_400_000;
let seq = 0;

async function student(schoolId: string, campusId: string, classId: string) {
  const id = randomUUID();
  await raw.student.create({ data: { id, schoolId, campusId, classId, fullName: `Synthetic Pupil ${++seq}`, rollNo: `R-${seq}`, gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
  return id;
}
async function invoice(schoolId: string, campusId: string, studentId: string, o: { total: number; paid?: number; status?: string; dueInDays?: number; currency?: string; invoiceDate?: Date }) {
  const paid = o.paid ?? 0;
  return raw.invoice.create({ data: { schoolId, campusId, studentId, currency: o.currency ?? "PKR", status: (o.status ?? "PENDING") as "PENDING", invoiceDate: o.invoiceDate ?? new Date(), dueDate: new Date(Date.now() + (o.dueInDays ?? -3) * day), monthlyFee: o.total, subtotal: o.total, totalAmount: o.total, totalAmountPaid: paid, balanceDue: o.total - paid } });
}
async function payment(inv: { id: string; schoolId: string; campusId: string; studentId: string }, amount: number, paymentMethod: string) {
  await raw.payment.create({ data: { schoolId: inv.schoolId, campusId: inv.campusId, invoiceId: inv.id, studentId: inv.studentId, amount, paymentMethod, paymentDate: new Date(), receiptNo: `SYN-${randomUUID().slice(0, 8)}` } });
}

const report = async (who: Who, query = "") => {
  current = who;
  const res = await runWithTenantContext({ schoolId: who.schoolId, campusId: who.campusId ?? undefined, userId: who.userId, role: who.role as "ACCOUNTANT" }, () => GET(new NextRequest(`http://localhost/api/fees/reports/collection${query}`)));
  return { status: res.status, body: await res.json() };
};
const accountantA1: Who = { userId: randomUUID(), schoolId: schoolA, campusId: campusA1, role: "ACCOUNTANT" };

before(async () => {
  ({ GET } = await import("../../src/app/api/fees/reports/collection/route"));
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic Fees school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Multan", status: "ACTIVE", plan: "PRO" } });
  for (const [schoolId, campusId] of [[schoolA, campusA1], [schoolA, campusA2], [schoolB, campusB1]]) await raw.campus.create({ data: { id: campusId, schoolId, name: `Synthetic ${campusId.slice(0, 4)}`, regId: campusId, city: "Multan" } });
  for (const [id, schoolId, campusId, name, section] of [[classFour, schoolA, campusA1, "Four", "B"], [classFive, schoolA, campusA1, "Five", null], [classA2, schoolA, campusA2, "Six", null], [classB, schoolB, campusB1, "Seven", null]] as const) {
    await raw.class.create({ data: { id, schoolId, campusId, name, section, academicYear: 2026 } });
  }

  // Campus A1, class Four B: pending past due, part paid past due, pending not yet due, paid, cancelled, and a USD invoice.
  const [p1, p2, p3] = [await student(schoolA, campusA1, classFour), await student(schoolA, campusA1, classFour), await student(schoolA, campusA1, classFour)];
  await invoice(schoolA, campusA1, p1, { total: 10000 });
  const partPaid = await invoice(schoolA, campusA1, p1, { total: 10000, paid: 4000, status: "PARTIAL", dueInDays: -1 });
  await invoice(schoolA, campusA1, p2, { total: 10000, dueInDays: 20 });
  const paid = await invoice(schoolA, campusA1, p3, { total: 10000, paid: 10000, status: "PAID" });
  await invoice(schoolA, campusA1, p2, { total: 99999, status: "CANCELLED" });
  const usd = await invoice(schoolA, campusA1, p3, { total: 5000, currency: "USD" });
  await payment(partPaid, 4000, "CASH");
  await payment(paid, 6000, "BANK_TRANSFER");
  await payment(paid, 4000, "CASH");
  await payment(usd, 777, "CASH");

  // A pupil billed while in Five, then moved to Four B by an enrollment review: that invoice stays under Five.
  const moved = await student(schoolA, campusA1, classFive);
  await invoice(schoolA, campusA1, moved, { total: 8000, paid: 8000, status: "PAID", invoiceDate: new Date("2026-05-01Z") });
  await raw.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.enrollment_reviewed', ${moved}, true)`;
    await tx.studentEnrollment.update({ where: { id: `initial-${moved}` }, data: { endDate: new Date("2026-06-01Z"), status: "COMPLETED" } });
    await tx.studentEnrollment.create({ data: { schoolId: schoolA, studentId: moved, campusId: campusA1, classId: classFour, campusName: "Synthetic", className: "Four B", curriculum: "Unspecified", academicYear: 2026, rollNo: "M-1", startDate: new Date("2026-06-01Z") } });
    await tx.student.update({ where: { id: moved }, data: { classId: classFour } });
  });

  // Campus A2 and school B rows must stay out of an A1 report.
  const a2 = await invoice(schoolA, campusA2, await student(schoolA, campusA2, classA2), { total: 50000, paid: 50000, status: "PAID" });
  await payment(a2, 50000, "CHEQUE");
  const b = await invoice(schoolB, campusB1, await student(schoolB, campusB1, classB), { total: 70000, paid: 30000, status: "PARTIAL" });
  await payment(b, 30000, "CASH");
});
// Issued payments are immutable, so the synthetic schools are removed as a whole (cascade), as the other fee database tests do.
after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } }).catch(() => undefined);
  await raw.$disconnect();
});

test("class totals exclude cancelled invoices, count overdue only past due, and group by the billed enrollment", async () => {
  const { status, body } = await report(accountantA1, "?currency=PKR");
  assert.equal(status, 200);
  assert.deepEqual(body.data.byClass, [
    { currency: "PKR", className: "Four B", totalStudents: 3, totalDue: 40000, totalPaid: 14000, totalOverdue: 16000, collectionRate: 35 },
    { currency: "PKR", className: "Five", totalStudents: 1, totalDue: 8000, totalPaid: 8000, totalOverdue: 0, collectionRate: 100 },
  ]);
});

test("method totals are per currency and campus, sorted by amount, with counts and shares", async () => {
  const { body } = await report(accountantA1, "?currency=PKR");
  assert.deepEqual(body.data.byMethod, [
    { currency: "PKR", method: "CASH", count: 2, total: 8000, percentage: 57 },
    { currency: "PKR", method: "BANK_TRANSFER", count: 1, total: 6000, percentage: 43 },
  ]);
  const usd = await report(accountantA1, "?currency=USD");
  assert.deepEqual(usd.body.data.byMethod, [{ currency: "USD", method: "CASH", count: 1, total: 777, percentage: 100 }]);
});

test("a school-wide caller sees both of its campuses; another school sees only its own rows", async () => {
  const wide = await report({ userId: randomUUID(), schoolId: schoolA, campusId: null, role: "SUPER_ADMIN" }, "?currency=PKR");
  assert.equal(wide.status, 200);
  assert.deepEqual(wide.body.data.byClass.map((row: { className: string }) => row.className).sort(), ["Five", "Four B", "Six"]);
  assert.equal(wide.body.data.byMethod.reduce((sum: number, row: { total: number }) => sum + row.total, 0), 64000);

  const other = await report({ userId: randomUUID(), schoolId: schoolB, campusId: campusB1, role: "ACCOUNTANT" }, "?currency=PKR");
  assert.deepEqual(other.body.data.byClass, [{ currency: "PKR", className: "Seven", totalStudents: 1, totalDue: 70000, totalPaid: 30000, totalOverdue: 40000, collectionRate: 43 }]);
  assert.deepEqual(other.body.data.byMethod, [{ currency: "PKR", method: "CASH", count: 1, total: 30000, percentage: 100 }]);
});

test("a campus account cannot read another campus, and a family role is denied", async () => {
  assert.equal((await report(accountantA1, `?currency=PKR&campusId=${campusA2}`)).status, 403);
  assert.equal((await report({ userId: randomUUID(), schoolId: schoolA, campusId: campusA1, role: "PARENT" }, "?currency=PKR")).status, 403);
});
