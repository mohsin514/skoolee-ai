import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1864: the fee overview groups its by-class breakdown in SQL instead of per student plus a student
// lookup. The totals must match the rules it replaced (cancelled excluded, one currency, grouped by the
// student's current class), and its scope stays one school and the caller's campus. Two schools, two
// campuses and a denied role are covered.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");

type Who = { userId: string; schoolId: string; campusId: string | null; role: string };
let current: Who | null = null;
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => current } });
let GET: (req: NextRequest) => Promise<Response>;

const raw = new PrismaClient();
const schoolA = `sum-a-${randomUUID()}`, schoolB = `sum-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const classFour = randomUUID(), classFive = randomUUID(), classA2 = randomUUID(), classB = randomUUID();
let seq = 0;

async function student(schoolId: string, campusId: string, classId: string) {
  const id = randomUUID();
  await raw.student.create({ data: { id, schoolId, campusId, classId, fullName: `Synthetic Pupil ${++seq}`, rollNo: `S-${seq}`, gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
  return id;
}
async function invoice(schoolId: string, campusId: string, studentId: string, o: { total: number; paid?: number; status?: string; currency?: string }) {
  const paid = o.paid ?? 0;
  await raw.invoice.create({ data: { schoolId, campusId, studentId, currency: o.currency ?? "PKR", status: (o.status ?? "PENDING") as "PENDING", invoiceDate: new Date(), dueDate: new Date(Date.now() + 10 * 86_400_000), monthlyFee: o.total, subtotal: o.total, totalAmount: o.total, totalAmountPaid: paid, balanceDue: o.total - paid } });
}

const summary = async (who: Who, query = "") => {
  current = who;
  const res = await runWithTenantContext({ schoolId: who.schoolId, campusId: who.campusId ?? undefined, userId: who.userId, role: who.role as "ACCOUNTANT" }, () => GET(new NextRequest(`http://localhost/api/fees/campus/summary${query}`)));
  return { status: res.status, body: await res.json() };
};
type Row = { className: string };
const byName = (rows: Row[]) => [...rows].sort((a, b) => a.className.localeCompare(b.className));
const accountantA1: Who = { userId: randomUUID(), schoolId: schoolA, campusId: campusA1, role: "ACCOUNTANT" };

before(async () => {
  ({ GET } = await import("../../src/app/api/fees/campus/summary/route"));
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic Fees school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Multan", status: "ACTIVE", plan: "PRO" } });
  for (const [schoolId, campusId] of [[schoolA, campusA1], [schoolA, campusA2], [schoolB, campusB1]]) await raw.campus.create({ data: { id: campusId, schoolId, name: `Synthetic ${campusId.slice(0, 4)}`, regId: campusId, city: "Multan" } });
  for (const [id, schoolId, campusId, name] of [[classFour, schoolA, campusA1, "Four"], [classFive, schoolA, campusA1, "Five"], [classA2, schoolA, campusA2, "Six"], [classB, schoolB, campusB1, "Seven"]] as const) {
    await raw.class.create({ data: { id, schoolId, campusId, name, academicYear: 2026 } });
  }

  // Campus A1: two pupils in Four (one with two invoices), one in Five, plus a cancelled and a USD invoice.
  const [p1, p2, p3] = [await student(schoolA, campusA1, classFour), await student(schoolA, campusA1, classFour), await student(schoolA, campusA1, classFive)];
  await invoice(schoolA, campusA1, p1, { total: 10000 });
  await invoice(schoolA, campusA1, p1, { total: 10000, paid: 4000, status: "PARTIAL" });
  await invoice(schoolA, campusA1, p2, { total: 10000, paid: 10000, status: "PAID" });
  await invoice(schoolA, campusA1, p2, { total: 99999, status: "CANCELLED" });
  await invoice(schoolA, campusA1, p3, { total: 8000, paid: 2000, status: "PARTIAL" });
  await invoice(schoolA, campusA1, p3, { total: 5000, currency: "USD" });

  // Campus A2 and school B rows must stay out of an A1 overview.
  await invoice(schoolA, campusA2, await student(schoolA, campusA2, classA2), { total: 50000, paid: 50000, status: "PAID" });
  await invoice(schoolB, campusB1, await student(schoolB, campusB1, classB), { total: 70000, paid: 30000, status: "PARTIAL" });
});
after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } }).catch(() => undefined);
  await raw.$disconnect();
});

test("class totals sum every non-cancelled invoice in the currency, grouped by the student's class", async () => {
  const { status, body } = await summary(accountantA1, "?currency=PKR");
  assert.equal(status, 200);
  assert.deepEqual(byName(body.data.byClass), [
    { className: "Five", totalDue: 8000, totalPaid: 2000, collectionRate: 25 },
    { className: "Four", totalDue: 30000, totalPaid: 14000, collectionRate: 47 },
  ]);
  assert.equal(body.data.totalReceivable, 38000);
  const usd = await summary(accountantA1, "?currency=USD");
  assert.deepEqual(usd.body.data.byClass, [{ className: "Five", totalDue: 5000, totalPaid: 0, collectionRate: 0 }]);
});

test("a school-wide caller sees both of its campuses; another school sees only its own rows", async () => {
  const wide = await summary({ userId: randomUUID(), schoolId: schoolA, campusId: null, role: "SUPER_ADMIN" }, "?currency=PKR");
  assert.equal(wide.status, 200);
  assert.deepEqual(byName(wide.body.data.byClass).map((row: Row) => row.className), ["Five", "Four", "Six"]);

  const other = await summary({ userId: randomUUID(), schoolId: schoolB, campusId: campusB1, role: "ACCOUNTANT" }, "?currency=PKR");
  assert.deepEqual(other.body.data.byClass, [{ className: "Seven", totalDue: 70000, totalPaid: 30000, collectionRate: 43 }]);
});

test("a campus account cannot read another campus, and a family role is denied", async () => {
  assert.equal((await summary(accountantA1, `?currency=PKR&campusId=${campusA2}`)).status, 403);
  assert.equal((await summary({ userId: randomUUID(), schoolId: schoolA, campusId: campusA1, role: "PARENT" }, "?currency=PKR")).status, 403);
});
