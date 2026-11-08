import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { acceptLibraryCharge } from "../../src/lib/library/charge-finance";
import { settleLibraryChargeForInvoice } from "../../src/lib/library/charge-settlement";
import { deskOverview } from "../../src/lib/library/desk";
import { recordPayment } from "../../src/lib/fees/payment";
import { decideAdjustment, requestAdjustment } from "../../src/lib/fees/adjustments-service";

// SKAI-1793: a library charge posted to a fee invoice settles with that invoice in the same transaction: fully paid → PAID,
// waived to zero or cancelled → WAIVED; partial payment keeps it POSTED. Re-running is a no-op. Other schools, other
// campuses and roles without finance rights cannot settle it.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only an isolated local PostgreSQL.");
const raw = new PrismaClient();
const schoolA = `libset-a-${randomUUID()}`, schoolB = `libset-b-${randomUUID()}`;
const campusA = randomUUID(), campusA2 = randomUUID(), campusB = randomUUID();
const users: Record<string, AuthUser> = {};
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId!, userId: user.userId, role: user.role }, work);
let studentId = "", memberId = "";

async function actor(key: string, role: AuthUser["role"], schoolId: string, campusId: string) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await raw.user.create({ data: { id, email, password: "x", fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true } });
  users[key] = { userId: id, schoolId, campusId, role, email };
  return id;
}
async function posted() {
  const charge = await raw.libraryCharge.create({ data: { schoolId: schoolA, campusId: campusA, issueId: randomUUID(), memberId, kind: "LOST", amount: 25_000, currency: "PKR", detail: {}, status: "HANDED_TO_FEES", waiverReason: "Lost copy, handed over", decidedAt: new Date() } });
  const { invoiceId } = await ctx(users.accountant, () => acceptLibraryCharge(users.accountant, charge.id));
  return { chargeId: charge.id, invoiceId };
}
const pay = (invoiceId: string, amount: number) => ctx(users.accountant, () => prisma.$transaction(tx => recordPayment(tx, { campusId: campusA, invoiceId, studentId, amount, paymentDate: new Date(), paymentMethod: "CASH", recordedBy: users.accountant.userId })));
const statusOf = async (id: string) => (await raw.libraryCharge.findUniqueOrThrow({ where: { id } })).status;
const waiver = (user: AuthUser, invoiceId: string) => ctx(user, () => requestAdjustment(user, { kind: "WAIVER", invoiceId, amount: 25_000, reasonCategory: "HARDSHIP", reason: "Family hardship", publicExplanation: "Lost-book charge waived", idempotencyKey: `wv-${randomUUID()}` }));

before(async () => {
  for (const [id, name] of [[schoolA, "A"], [schoolB, "B"]]) await raw.school.create({ data: { id, name: `Synthetic Library ${name}`, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [id, schoolId] of [[campusA, schoolA], [campusA2, schoolA], [campusB, schoolB]]) await raw.campus.create({ data: { id, schoolId, name: `Campus ${id.slice(0, 4)}`, regId: id, city: "Lahore" } });
  await actor("accountant", "ACCOUNTANT", schoolA, campusA);
  await actor("admin", "CAMPUS_ADMIN", schoolA, campusA);
  await actor("librarian", "LIBRARIAN", schoolA, campusA);
  await actor("otherCampus", "CAMPUS_ADMIN", schoolA, campusA2);
  await actor("otherSchool", "CAMPUS_ADMIN", schoolB, campusB);
  const pupilUser = await actor("pupil", "STUDENT", schoolA, campusA);
  const cls = await raw.class.create({ data: { schoolId: schoolA, campusId: campusA, name: "Grade 5", academicYear: 2026 } });
  studentId = (await raw.student.create({ data: { schoolId: schoolA, campusId: campusA, classId: cls.id, fullName: "Synthetic Pupil", rollNo: "R-1", gender: "MALE", studentUserId: pupilUser } })).id;
  memberId = (await raw.libraryMember.create({ data: { schoolId: schoolA, campusId: campusA, userId: pupilUser, memberNo: "M-1" } })).id;
});

after(async () => {
  for (const schoolId of [schoolA, schoolB]) {
    await raw.libraryCharge.deleteMany({ where: { schoolId } });
    await raw.financialAdjustment.deleteMany({ where: { schoolId } }).catch(() => undefined);
    await raw.paymentAllocation.deleteMany({ where: { schoolId } }).catch(() => undefined);
    await raw.payment.deleteMany({ where: { schoolId } }).catch(() => undefined); // receipts are append-only
    await raw.feeCarryForward.deleteMany({ where: { schoolId } }).catch(() => undefined);
    await raw.invoice.deleteMany({ where: { schoolId } }).catch(() => undefined);
    await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  }
  await raw.$disconnect(); await prisma.$disconnect();
});

test("a partial payment keeps the charge invoiced; paying the rest settles it PAID, and the desk shows it", async () => {
  const { chargeId, invoiceId } = await posted();
  await pay(invoiceId, 10_000);
  assert.equal(await statusOf(chargeId), "POSTED");
  await pay(invoiceId, 15_000);
  assert.equal(await statusOf(chargeId), "PAID");
  const desk = await ctx(users.librarian, () => deskOverview(users.librarian));
  assert.equal(desk.handed.find(c => c.id === chargeId)?.status, "PAID");
  assert.equal(await ctx(users.accountant, () => prisma.$transaction(tx => settleLibraryChargeForInvoice(tx, invoiceId))), 0, "re-running settles nothing");
});

test("an approved waiver to zero settles the charge WAIVED; other campus, other school and a librarian cannot", async () => {
  const { chargeId, invoiceId } = await posted();
  await assert.rejects(waiver(users.librarian, invoiceId), (e: { status?: number }) => e.status === 403, "librarian denied");
  await assert.rejects(waiver(users.otherCampus, invoiceId), (e: { status?: number }) => e.status === 404, "other campus denied");
  await assert.rejects(waiver(users.otherSchool, invoiceId), (e: { status?: number }) => e.status === 404, "other school denied");
  const request = await waiver(users.accountant, invoiceId);
  await assert.rejects(ctx(users.otherCampus, () => decideAdjustment(users.otherCampus, request.id, "approve", "Approved for hardship")), (e: { status?: number }) => e.status === 404);
  assert.equal(await statusOf(chargeId), "POSTED");
  await ctx(users.admin, () => decideAdjustment(users.admin, request.id, "approve", "Approved for hardship"));
  assert.equal(await statusOf(chargeId), "WAIVED");
  await ctx(users.admin, () => decideAdjustment(users.admin, request.id, "approve", "Approved for hardship"));
  assert.equal(await statusOf(chargeId), "WAIVED", "replayed decision keeps it settled");
});

test("a cancelled invoice settles the charge WAIVED; another school's context cannot reach it", async () => {
  const { chargeId, invoiceId } = await posted();
  await raw.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } });
  assert.equal(await ctx(users.otherSchool, () => prisma.$transaction(tx => settleLibraryChargeForInvoice(tx, invoiceId))), 0, "other school sees nothing");
  assert.equal(await statusOf(chargeId), "POSTED");
  assert.equal(await ctx(users.accountant, () => prisma.$transaction(tx => settleLibraryChargeForInvoice(tx, invoiceId))), 1);
  assert.equal(await statusOf(chargeId), "WAIVED");
});
