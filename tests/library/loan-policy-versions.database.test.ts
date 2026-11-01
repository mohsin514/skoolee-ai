// SKAI-1638: saving library loan rules allocates the next policy version atomically per campus. A racing save
// never surfaces a raw unique-constraint error. An identical payload replays the current version, a differing one
// that lost a race gets a controlled 409, and only committed versions are audited. Runs against a disposable
// loopback database with synthetic data only.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { saveRules } from "../../src/lib/library/desk";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const raw = new PrismaClient();

const schoolA = `lib-a-${randomUUID()}`, schoolB = `lib-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const actor = (schoolId: string, campusId: string, role: AuthUser["role"], name: string): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, fullName: name, accessVersion: 0 });
const libA1 = actor(schoolA, campusA1, "LIBRARIAN", "Synthetic librarian A1");
const libA2 = actor(schoolA, campusA2, "LIBRARIAN", "Synthetic librarian A2");
const libB1 = actor(schoolB, campusB1, "LIBRARIAN", "Synthetic librarian B1");
const teacherA1 = actor(schoolA, campusA1, "TEACHER", "Synthetic teacher A1");
const as = <T>(who: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: who.schoolId, campusId: who.campusId, userId: who.userId, role: who.role }, fn);
const rules = (overrides: Record<string, unknown> = {}) => ({
  loanDays: 14, maxLoans: 3, maxRenewals: 2, graceDays: 1, finePerDay: 10, fineCap: 500, lostCharge: 2000, holdDays: 3,
  currency: "PKR", closures: ["2026-12-25"], ...overrides,
});
const versionsOf = (campusId: string) => raw.libraryLoanPolicy.findMany({ where: { campusId }, orderBy: { version: "asc" }, select: { id: true, version: true, currency: true, loanDays: true, closures: true } });
const isConflict = (error: unknown) => (error as { status?: number }).status === 409;
const isRawPrismaError = (error: unknown) => /P2002|Unique constraint/u.test(String((error as Error)?.message ?? error));

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic library school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.createMany({ data: [
    { id: campusA1, schoolId: schoolA, name: "Synthetic campus A1", regId: campusA1, city: "Synthetic" },
    { id: campusA2, schoolId: schoolA, name: "Synthetic campus A2", regId: campusA2, city: "Synthetic" },
    { id: campusB1, schoolId: schoolB, name: "Synthetic campus B1", regId: campusB1, city: "Synthetic" },
  ] });
  for (const who of [libA1, libA2, libB1, teacherA1]) await raw.user.create({ data: { id: who.userId, schoolId: who.schoolId, campusId: who.campusId, email: who.email, role: who.role, fullName: who.fullName!, onboardingComplete: true } });
});

after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("two racing saves of differing rules: one commits v1, the other is a controlled 409", async () => {
  const results = await Promise.allSettled([
    as(libA1, () => saveRules(libA1, rules({ loanDays: 14 }))),
    as(libA1, () => saveRules(libA1, rules({ loanDays: 21 }))),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1, "exactly one save commits");
  const loser = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(isConflict(loser.reason), "the loser gets a 409");
  assert.equal(isRawPrismaError(loser.reason), false, "no raw unique-constraint error");
  assert.deepEqual((await versionsOf(campusA1)).map(v => v.version), [1]);
});

test("two racing saves of an identical payload both succeed and produce one version", async () => {
  const results = await Promise.allSettled([
    as(libA2, () => saveRules(libA2, rules())),
    as(libA2, () => saveRules(libA2, rules())),
  ]);
  assert.deepEqual(results.map(r => r.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual((await versionsOf(campusA2)).map(v => v.version), [1]);
});

test("a sequential identical save replays the current version and writes nothing new", async () => {
  // The racing winner decides the stored rules, so resend exactly what is stored.
  const stored = await raw.libraryLoanPolicy.findFirstOrThrow({ where: { campusId: campusA1 }, orderBy: { version: "desc" } });
  const before = await versionsOf(campusA1);
  const replay = await as(libA1, () => saveRules(libA1, rules({ loanDays: stored.loanDays, maxLoans: stored.maxLoans, maxRenewals: stored.maxRenewals, graceDays: stored.graceDays, finePerDay: stored.finePerDay, fineCap: stored.fineCap, lostCharge: stored.lostCharge, holdDays: stored.holdDays, currency: stored.currency, closures: stored.closures })));
  assert.equal(replay.version, 1);
  assert.deepEqual(await versionsOf(campusA1), before);
});

test("closure parity: the same closures in another order or repeated replay the version", async () => {
  await as(libA2, () => saveRules(libA2, rules({ closures: ["2027-01-01", "2026-12-25", "2026-12-25"] })));
  const versions = await versionsOf(campusA2);
  assert.deepEqual(versions.map(v => v.version), [1, 2]);
  const replay = await as(libA2, () => saveRules(libA2, rules({ closures: ["2026-12-25", "2027-01-01"] })));
  assert.equal(replay.version, 2);
  assert.deepEqual((await versionsOf(campusA2)).map(v => v.version), [1, 2]);
});

test("currency parity: a differing currency creates the next version and is stored", async () => {
  const next = await as(libA1, () => saveRules(libA1, rules({ currency: "USD" })));
  assert.equal(next.version, 2);
  assert.equal(next.currency, "USD");
});

test("a sequential differing save creates the next version", async () => {
  const next = await as(libA1, () => saveRules(libA1, rules({ loanDays: 30, currency: "USD" })));
  assert.equal(next.version, 3);
  assert.deepEqual((await versionsOf(campusA1)).map(v => v.version), [1, 2, 3]);
});

test("two campuses in one school each allocate their own version 1 concurrently", async () => {
  const campusA3 = randomUUID();
  await raw.campus.create({ data: { id: campusA3, schoolId: schoolA, name: "Synthetic campus A3", regId: campusA3, city: "Synthetic" } });
  const librarianA3 = actor(schoolA, campusA3, "LIBRARIAN", "Synthetic librarian A3");
  await raw.user.create({ data: { id: librarianA3.userId, schoolId: schoolA, campusId: campusA3, email: librarianA3.email, role: "LIBRARIAN", fullName: "Synthetic librarian A3", onboardingComplete: true } });
  const results = await Promise.allSettled([
    as(libA2, () => saveRules(libA2, rules({ loanDays: 7 }))),
    as(librarianA3, () => saveRules(librarianA3, rules({ loanDays: 7 }))),
  ]);
  assert.deepEqual(results.map(r => r.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual((await versionsOf(campusA3)).map(v => v.version), [1]);
});

test("two schools each allocate their own version 1", async () => {
  const saved = await as(libB1, () => saveRules(libB1, rules()));
  assert.equal(saved.version, 1);
  assert.equal(saved.schoolId, schoolB);
  assert.equal(saved.campusId, campusB1);
});

test("a teacher cannot save library rules", async () => {
  await assert.rejects(as(teacherA1, () => saveRules(teacherA1, rules())), (error: { status?: number }) => error.status === 403);
});

test("only committed policy versions are audited", async () => {
  const committed = (await raw.libraryLoanPolicy.findMany({ where: { schoolId: { in: [schoolA, schoolB] } }, select: { id: true } })).map(p => p.id).sort();
  const audited = [...new Set((await raw.auditLog.findMany({ where: { tableName: "library_loan_policies", schoolId: { in: [schoolA, schoolB] } }, select: { recordId: true } })).map(a => a.recordId))].sort();
  assert.deepEqual(audited, committed);
});
