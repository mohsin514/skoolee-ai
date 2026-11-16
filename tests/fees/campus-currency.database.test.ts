import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-2038: a school with no locale policy resolves to the USD default. A campus that already bills in PKR
// must keep PKR for the ledger, the profit report and new fee setup; an explicit policy always wins.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");

type Who = { userId: string; schoolId: string; campusId: string | null; role: string };
let current: Who | null = null;
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => current } });
let profit: (req: NextRequest) => Promise<Response>;
let billing: (schoolId: string, campusId: string | null) => Promise<string>;
const campusBillingCurrency = (schoolId: string, campusId: string) => runWithTenantContext({ schoolId, campusId, userId: randomUUID(), role: "ACCOUNTANT" }, () => billing(schoolId, campusId));

const raw = new PrismaClient();
const bare = `cur-bare-${randomUUID()}`, empty = `cur-empty-${randomUUID()}`, policed = `cur-pol-${randomUUID()}`;
const campusBare = randomUUID(), campusEmpty = randomUUID(), campusPoliced = randomUUID();

before(async () => {
  ({ GET: profit } = await import("../../src/app/api/accounts/profit/route"));
  ({ campusBillingCurrency: billing } = await import("../../src/app/api/fees/reports/invoice-currency"));
  for (const [id, campusId] of [[bare, campusBare], [empty, campusEmpty], [policed, campusPoliced]] as const) {
    await raw.school.create({ data: { id, name: "Synthetic currency school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
    await raw.campus.create({ data: { id: campusId, schoolId: id, name: `Synthetic ${id.slice(0, 8)}`, regId: campusId, city: "Lahore" } });
  }
  for (const [schoolId, campusId] of [[bare, campusBare], [policed, campusPoliced]] as const) {
    const classId = randomUUID(), studentId = randomUUID();
    await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Four", academicYear: 2026 } });
    await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic Pupil", rollNo: "S-1", gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
    await raw.invoice.create({ data: { schoolId, campusId, studentId, currency: "PKR", status: "PENDING", invoiceDate: new Date(), dueDate: new Date(Date.now() + 86_400_000), monthlyFee: 100, subtotal: 100, totalAmount: 100, totalAmountPaid: 0, balanceDue: 100 } });
  }
  await raw.localePolicy.create({ data: { schoolId: policed, scopeKey: "school", settings: { currency: "USD", country: "OTHER" }, effectiveAt: new Date("2020-01-01Z"), createdBy: randomUUID() } });
});
after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [bare, empty, policed] } } }).catch(() => undefined);
  await raw.$disconnect();
});

test("no locale policy: the currency the campus bills in wins over the USD default", async () => {
  assert.equal(await campusBillingCurrency(bare, campusBare), "PKR");
});
test("no locale policy and nothing billed: falls back to the locale default", async () => {
  assert.equal(await campusBillingCurrency(empty, campusEmpty), "USD");
});
test("an explicit locale policy is never overridden by invoice history", async () => {
  assert.equal(await campusBillingCurrency(policed, campusPoliced), "USD");
});
test("the profit report defaults to the billed currency", async () => {
  current = { userId: randomUUID(), schoolId: bare, campusId: campusBare, role: "ACCOUNTANT" };
  const res = await runWithTenantContext({ schoolId: bare, campusId: campusBare, userId: current.userId, role: "ACCOUNTANT" }, () => profit(new NextRequest("http://localhost/api/accounts/profit?from=2026-01-01&to=2026-12-31")));
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal((body.data ?? body).currency, "PKR");
});
