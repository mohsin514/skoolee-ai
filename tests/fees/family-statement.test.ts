import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { familyStatement } from "@/lib/fees/family-statement";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { prisma as appDb } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";

// SKAI-1653: the family fee statement must cover the whole ledger, not the newest 500 invoices. Runs against an
// isolated local database only (DATABASE_URL must point at localhost). Synthetic data only.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local isolated database is allowed");

const db = new PrismaClient();
const created: string[] = [];
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function school(name: string) {
  const id = randomUUID();
  created.push(id);
  await db.school.create({ data: { id, name, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi" } as never });
  return id;
}
async function campus(schoolId: string, name: string) {
  const id = randomUUID();
  await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Lahore" } });
  return id;
}
async function learner(schoolId: string, campusId: string, key: string) {
  const id = randomUUID();
  const classId = (await db.class.findFirst({ where: { campusId, academicYear: 2026 } }))?.id ?? randomUUID();
  if (!await db.class.findUnique({ where: { id: classId } })) await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 6", section: "A", academicYear: 2026 } });
  await db.student.create({ data: { id, schoolId, campusId, classId, fullName: `Synthetic ${key}`, rollNo: key, gender: "FEMALE", status: "active", enrollmentDate: new Date("2000-01-01Z") } as never });
  return id;
}
/** A guardian who may (finances) or may not (denied) see the child's finances. */
async function guardian(schoolId: string, campusId: string, studentId: string, finances: boolean): Promise<AuthUser> {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${userId}@example.invalid`, password: "x", fullName: "Synthetic guardian", role: "PARENT", schoolId, campusId, isActive: true, onboardingComplete: true } as never });
  const rel = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: userId, createdByUserId: userId, fullName: "Synthetic guardian", email: `${userId}@example.invalid`, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: userId, reason: "Synthetic statement fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances, communication: true, pickup: false, consents: { fieldTrips: true, offsiteTravel: false, medicalTreatment: false, mediaPublication: false } } } });
  return { userId, schoolId, campusId, role: "PARENT", email: "", fullName: "Synthetic guardian" } as unknown as AuthUser;
}
/** Invoices for one learner. Index 0 is the oldest (unpaid, with one receipt); the rest are current. */
async function ledger(schoolId: string, campusId: string, studentId: string, count: number, currency = "PKR", offset = 0) {
  const enrollmentId = (await db.studentEnrollment.findFirstOrThrow({ where: { studentId, campusId } })).id;
  const data = Array.from({ length: count }, (_, i) => {
    const n = offset + i;
    const oldest = n === 0;
    const totalAmount = 1000 + (n % 7) * 100;
    const paid = oldest ? 0 : n % 2 === 0 ? totalAmount : 0;
    return { schoolId, campusId, studentId, enrollmentId, invoiceDate: daysAgo(n + 30), dueDate: oldest ? daysAgo(900) : daysAgo(n + 1), currency, invoiceNumber: `SYN-1653-${currency}-${studentId.slice(0, 8)}-${n}`, monthlyFee: 0, oneTimeFees: totalAmount, subtotal: totalAmount, totalAmount, totalAmountPaid: paid, balanceDue: totalAmount - paid, status: paid === totalAmount ? "PAID" : oldest ? "OVERDUE" : "PENDING" } as never;
  });
  await db.invoice.createMany({ data });
  return db.invoice.findMany({ where: { studentId, currency }, select: { id: true, invoiceNumber: true, totalAmount: true, totalAmountPaid: true, balanceDue: true }, orderBy: { invoiceNumber: "asc" } });
}
/** Runs the statement as this user, the same tenant context a signed-in request provides. */
const statement = (user: AuthUser, studentId: string | null, currency: string | null = null) =>
  runWithTenantContext({ schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: user.role, unscoped: false, rlsSession: true } as never, () => familyStatement(user, studentId, currency, null));

const fixtures: Record<string, { schoolA: string; campusA1: string; campusA2: string; schoolB: string; campusB1: string }> = {};
before(async () => {
  const schoolA = await school("Synthetic Poplar School");
  fixtures.run = { schoolA, campusA1: await campus(schoolA, "Poplar Main"), campusA2: await campus(schoolA, "Poplar Annex"), schoolB: await school("Synthetic Cedar School"), campusB1: "" };
  fixtures.run.campusB1 = await campus(fixtures.run.schoolB, "Cedar Main");
});
after(async () => {
  for (const id of created) await db.school.delete({ where: { id } }).catch(() => undefined);
  await db.$disconnect();
  await appDb.$disconnect();
});

describe("SKAI-1653 family fee statement covers the whole ledger", () => {
  for (const count of [499, 500, 501]) {
    it(`${count} invoices: balances, history and totals include every invoice`, async () => {
      const f = fixtures.run;
      const kid = await learner(f.schoolA, f.campusA1, `ledger-${count}`);
      const parent = await guardian(f.schoolA, f.campusA1, kid, true);
      const invoices = await ledger(f.schoolA, f.campusA1, kid, count);
      const out = await statement(parent, kid);
      assert.equal(out.invoices.length, count, "every invoice is in the history");
      assert.equal(out.summary.charges, invoices.reduce((sum, i) => sum + i.totalAmount, 0));
      assert.equal(out.summary.outstanding, invoices.reduce((sum, i) => sum + i.balanceDue, 0));
      assert.equal(out.summary.reconciles, true);
      assert.ok(out.invoices.some(i => i.invoiceNumber?.endsWith("-0")), "the oldest unpaid invoice is listed");
      assert.ok(out.summary.overdue >= invoices[0].balanceDue, "the oldest invoice counts as overdue");
    });
  }

  it("multi-currency: currencies come from the full ledger and each currency reconciles on its own", async () => {
    const f = fixtures.run;
    const kid = await learner(f.schoolA, f.campusA1, "multi-kid");
    const parent = await guardian(f.schoolA, f.campusA1, kid, true);
    await ledger(f.schoolA, f.campusA1, kid, 3, "PKR");
    const usd = await ledger(f.schoolA, f.campusA1, kid, 2, "USD");
    const out = await statement(parent, kid, "USD");
    assert.deepEqual([...out.currencies].sort(), ["PKR", "USD"]);
    assert.equal(out.currency, "USD");
    assert.equal(out.invoices.length, usd.length);
    assert.equal(out.summary.charges, usd.reduce((sum, i) => sum + i.totalAmount, 0));
  });

  it("student view and guardian view agree; a guardian without finance access is refused", async () => {
    const f = fixtures.run;
    const kid = await learner(f.schoolA, f.campusA1, "view-kid");
    const parent = await guardian(f.schoolA, f.campusA1, kid, true);
    const denied = await guardian(f.schoolA, f.campusA1, kid, false);
    await ledger(f.schoolA, f.campusA1, kid, 3);
    const studentUserId = randomUUID();
    await db.user.create({ data: { id: studentUserId, email: `${studentUserId}@example.invalid`, password: "x", fullName: "Synthetic learner", role: "STUDENT", schoolId: f.schoolA, campusId: f.campusA1, isActive: true, onboardingComplete: true } as never });
    await db.student.update({ where: { id: kid }, data: { studentUserId } });
    const student: AuthUser = { userId: studentUserId, schoolId: f.schoolA, campusId: f.campusA1, role: "STUDENT", email: "", fullName: "Synthetic learner" } as unknown as AuthUser;
    const viaParent = await statement(parent, kid);
    const viaStudent = await statement(student, kid);
    assert.deepEqual(viaStudent.summary, viaParent.summary);
    assert.equal(viaStudent.invoices.length, viaParent.invoices.length);
    await assert.rejects(statement(denied, kid), (error: unknown) => error instanceof ApiError && error.status === 404);
  });

  it("two schools and two campuses: no cross-school or other-campus leakage", async () => {
    const f = fixtures.run;
    const kid = await learner(f.schoolA, f.campusA2, "annex-kid");
    const annexParent = await guardian(f.schoolA, f.campusA2, kid, true);
    await ledger(f.schoolA, f.campusA2, kid, 2);
    const other = await learner(f.schoolB, f.campusB1, "cedar-kid");
    const cedarParent = await guardian(f.schoolB, f.campusB1, other, true);
    await ledger(f.schoolB, f.campusB1, other, 2);
    // A guardian of school B cannot read school A's child, and vice versa.
    await assert.rejects(statement(cedarParent, kid), (error: unknown) => error instanceof ApiError && error.status === 404);
    await assert.rejects(statement(annexParent, other), (error: unknown) => error instanceof ApiError && error.status === 404);
    assert.equal((await statement(annexParent, kid)).invoices.length, 2);
  });
});
