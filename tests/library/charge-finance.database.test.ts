import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { acceptLibraryCharge, returnLibraryCharge } from "../../src/lib/library/charge-finance";
import { deskOverview } from "../../src/lib/library/desk";

// SKAI-1669: finance accepts a handed library charge by posting one fee invoice linked to it (a replay returns the same
// invoice), or returns it to the library with a reason (the charge is OPEN again); the desk sees the link status. Other
// schools, other campuses and roles without fees write access are refused.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only an isolated local PostgreSQL.");
const raw = new PrismaClient();
const schoolA = `libfin-a-${randomUUID()}`, schoolB = `libfin-b-${randomUUID()}`;
const campusA = randomUUID(), campusA2 = randomUUID(), campusB = randomUUID();
const users: Record<string, AuthUser> = {};
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId!, userId: user.userId, role: user.role }, work);
let studentId = "", memberId = "", staffMemberId = "";

async function actor(key: string, role: AuthUser["role"], schoolId: string, campusId: string) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await raw.user.create({ data: { id, email, password: "x", fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true } });
  users[key] = { userId: id, schoolId, campusId, role, email };
  return id;
}
const handed = (member = memberId, amount = 25_000) => raw.libraryCharge.create({ data: { schoolId: schoolA, campusId: campusA, issueId: randomUUID(), memberId: member, kind: "LOST", amount, currency: "PKR", detail: {}, status: "HANDED_TO_FEES", waiverReason: "Lost copy, handed over", decidedAt: new Date() } });

before(async () => {
  for (const [id, name] of [[schoolA, "A"], [schoolB, "B"]]) await raw.school.create({ data: { id, name: `Synthetic Library ${name}`, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [id, schoolId] of [[campusA, schoolA], [campusA2, schoolA], [campusB, schoolB]]) await raw.campus.create({ data: { id, schoolId, name: `Campus ${id.slice(0, 4)}`, regId: id, city: "Lahore" } });
  await actor("accountant", "ACCOUNTANT", schoolA, campusA);
  await actor("librarian", "LIBRARIAN", schoolA, campusA);
  await actor("otherCampus", "CAMPUS_ADMIN", schoolA, campusA2);
  await actor("otherSchool", "CAMPUS_ADMIN", schoolB, campusB);
  const pupilUser = await actor("pupil", "STUDENT", schoolA, campusA);
  const staffUser = await actor("staffReader", "TEACHER", schoolA, campusA);
  const cls = await raw.class.create({ data: { schoolId: schoolA, campusId: campusA, name: "Grade 5", academicYear: 2026 } });
  studentId = (await raw.student.create({ data: { schoolId: schoolA, campusId: campusA, classId: cls.id, fullName: "Synthetic Pupil", rollNo: "R-1", gender: "MALE", studentUserId: pupilUser } })).id;
  memberId = (await raw.libraryMember.create({ data: { schoolId: schoolA, campusId: campusA, userId: pupilUser, memberNo: "M-1" } })).id;
  staffMemberId = (await raw.libraryMember.create({ data: { schoolId: schoolA, campusId: campusA, userId: staffUser, memberNo: "M-2" } })).id;
});

after(async () => {
  for (const schoolId of [schoolA, schoolB]) {
    await raw.libraryCharge.deleteMany({ where: { schoolId } });
    await raw.invoice.deleteMany({ where: { schoolId } });
    await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  }
  await raw.$disconnect(); await prisma.$disconnect();
});

test("accepting posts one fee invoice for the student, linked to the charge; a replay returns the same invoice", async () => {
  const charge = await handed();
  const first = await ctx(users.accountant, () => acceptLibraryCharge(users.accountant, charge.id));
  assert.equal(first.replayed, false);
  const invoice = await raw.invoice.findUniqueOrThrow({ where: { id: first.invoiceId } });
  assert.deepEqual([invoice.studentId, invoice.campusId, invoice.totalAmount, invoice.balanceDue, invoice.oneTimeFees, invoice.currency, invoice.status], [studentId, campusA, 25_000, 25_000, 25_000, "PKR", "PENDING"]);
  const stored = await raw.libraryCharge.findUniqueOrThrow({ where: { id: charge.id } });
  assert.deepEqual([stored.status, stored.invoiceId], ["POSTED", invoice.id]);
  const again = await ctx(users.accountant, () => acceptLibraryCharge(users.accountant, charge.id));
  assert.deepEqual([again.replayed, again.invoiceId], [true, invoice.id]);
  assert.equal(await raw.invoice.count({ where: { schoolId: schoolA, studentId } }), 1, "exactly one invoice");
  const desk = await ctx(users.librarian, () => deskOverview(users.librarian));
  assert.equal(desk.handed.find(c => c.id === charge.id)?.invoiceId, invoice.id, "the desk sees the posted link");
});

test("returning to the library makes the charge actionable again with finance's reason", async () => {
  const charge = await handed();
  await assert.rejects(ctx(users.accountant, () => returnLibraryCharge(users.accountant, charge.id, "no")), (e: { status?: number }) => e.status === 400);
  await ctx(users.accountant, () => returnLibraryCharge(users.accountant, charge.id, "Wrong reader; please check the loan"));
  const stored = await raw.libraryCharge.findUniqueOrThrow({ where: { id: charge.id } });
  assert.deepEqual([stored.status, stored.invoiceId, stored.financeNote], ["OPEN", null, "Wrong reader; please check the loan"]);
  const desk = await ctx(users.librarian, () => deskOverview(users.librarian));
  assert.ok(desk.charges.some(c => c.id === charge.id), "back in the desk's open queue");
  await assert.rejects(ctx(users.accountant, () => acceptLibraryCharge(users.accountant, charge.id)), (e: { status?: number }) => e.status === 409, "an open charge is not finance's to post");
});

test("a charge for a reader who is not a student cannot be invoiced and stays handed over", async () => {
  const charge = await handed(staffMemberId);
  await assert.rejects(ctx(users.accountant, () => acceptLibraryCharge(users.accountant, charge.id)), (e: { status?: number }) => e.status === 409);
  assert.equal((await raw.libraryCharge.findUniqueOrThrow({ where: { id: charge.id } })).status, "HANDED_TO_FEES");
});

test("another school, another campus and a role without fees write access cannot act", async () => {
  const charge = await handed();
  await assert.rejects(ctx(users.otherSchool, () => acceptLibraryCharge(users.otherSchool, charge.id)), (e: { status?: number }) => e.status === 404);
  await assert.rejects(ctx(users.otherCampus, () => acceptLibraryCharge(users.otherCampus, charge.id)), (e: { status?: number }) => e.status === 404);
  await assert.rejects(ctx(users.otherCampus, () => returnLibraryCharge(users.otherCampus, charge.id, "Not my campus at all")), (e: { status?: number }) => e.status === 404);
  await assert.rejects(ctx(users.librarian, () => acceptLibraryCharge(users.librarian, charge.id)), (e: { status?: number }) => e.status === 403);
  assert.equal((await raw.libraryCharge.findUniqueOrThrow({ where: { id: charge.id } })).status, "HANDED_TO_FEES");
});
