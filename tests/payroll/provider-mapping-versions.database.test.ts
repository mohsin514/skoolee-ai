// SKAI-1623: saving a payroll provider mapping allocates the next version atomically per campus and code.
// A racing save never surfaces a raw unique-constraint error. An identical payload replays the current version,
// a differing payload that lost a race gets a controlled 409, and only committed versions are audited.
// Runs against a disposable loopback database with synthetic data only.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { saveProvider } from "../../src/lib/payroll-runs/service";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const raw = new PrismaClient();

const schoolA = `pay-a-${randomUUID()}`, schoolB = `pay-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const actor = (schoolId: string, campusId: string, role: AuthUser["role"], name: string): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, fullName: name, accessVersion: 0 });
const adminA1 = actor(schoolA, campusA1, "CAMPUS_ADMIN", "Synthetic admin A1");
const adminA2 = actor(schoolA, campusA2, "CAMPUS_ADMIN", "Synthetic admin A2");
const adminB1 = actor(schoolB, campusB1, "CAMPUS_ADMIN", "Synthetic admin B1");
const teacherA1 = actor(schoolA, campusA1, "TEACHER", "Synthetic teacher A1");
const as = <T>(who: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: who.schoolId, campusId: who.campusId, userId: who.userId, role: who.role }, fn);
const mapping = (name: string, code = "QA_PAY") => ({
  code, name, currencies: ["PKR"],
  columns: [{ header: "Employee ID", field: "providerEmployeeId" }, { header: "Net pay", field: "net" }],
});
const versionsOf = (campusId: string, code: string) => raw.payrollProvider.findMany({ where: { campusId, code }, orderBy: { version: "asc" }, select: { version: true, name: true } });
const isConflict = (error: unknown) => (error as { status?: number }).status === 409;
const isRawPrismaError = (error: unknown) => /P2002|Unique constraint/u.test(String((error as Error)?.message ?? error));

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic payroll school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.createMany({ data: [
    { id: campusA1, schoolId: schoolA, name: "Synthetic campus A1", regId: campusA1, city: "Synthetic" },
    { id: campusA2, schoolId: schoolA, name: "Synthetic campus A2", regId: campusA2, city: "Synthetic" },
    { id: campusB1, schoolId: schoolB, name: "Synthetic campus B1", regId: campusB1, city: "Synthetic" },
  ] });
  for (const who of [adminA1, adminA2, adminB1, teacherA1]) await raw.user.create({ data: { id: who.userId, schoolId: who.schoolId, campusId: who.campusId, email: who.email, role: who.role, fullName: who.fullName!, onboardingComplete: true } });
});

after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("two racing saves of differing mappings: one commits v1, the other is a controlled 409", async () => {
  const results = await Promise.allSettled([
    as(adminA1, () => saveProvider(adminA1, mapping("Bank export one"))),
    as(adminA1, () => saveProvider(adminA1, mapping("Bank export two"))),
  ]);
  const fulfilled = results.filter(r => r.status === "fulfilled");
  const rejected = results.filter(r => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(fulfilled.length, 1, "exactly one save commits");
  assert.equal(rejected.length, 1);
  assert.ok(isConflict(rejected[0].reason), "the loser gets a 409, not a raw error");
  assert.equal(isRawPrismaError(rejected[0].reason), false, "no raw unique-constraint error");
  assert.deepEqual((await versionsOf(campusA1, "QA_PAY")).map(v => v.version), [1]);
});

test("two racing saves of an identical mapping both succeed and produce one version", async () => {
  const results = await Promise.allSettled([
    as(adminA2, () => saveProvider(adminA2, mapping("Same bank export"))),
    as(adminA2, () => saveProvider(adminA2, mapping("Same bank export"))),
  ]);
  assert.deepEqual(results.map(r => r.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual((await versionsOf(campusA2, "QA_PAY")).map(v => v.version), [1]);
});

test("a sequential identical save replays the current version and writes nothing new", async () => {
  const before = await versionsOf(campusA2, "QA_PAY");
  const replay = await as(adminA2, () => saveProvider(adminA2, mapping("Same bank export")));
  assert.equal(replay.version, 1);
  assert.deepEqual(await versionsOf(campusA2, "QA_PAY"), before);
});

test("a sequential differing save creates the next version", async () => {
  const next = await as(adminA2, () => saveProvider(adminA2, mapping("Changed bank export")));
  assert.equal(next.version, 2);
  assert.deepEqual((await versionsOf(campusA2, "QA_PAY")).map(v => v.version), [1, 2]);
});

test("provider parity: two codes on one campus allocate their own v1 concurrently", async () => {
  const results = await Promise.allSettled([
    as(adminA1, () => saveProvider(adminA1, mapping("Parity one", "QA_BANK"))),
    as(adminA1, () => saveProvider(adminA1, mapping("Parity two", "QA_WALLET"))),
  ]);
  assert.deepEqual(results.map(r => r.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual((await versionsOf(campusA1, "QA_BANK")).map(v => v.version), [1]);
  assert.deepEqual((await versionsOf(campusA1, "QA_WALLET")).map(v => v.version), [1]);
});

test("two campuses in one school each allocate their own version 1", async () => {
  const results = await Promise.allSettled([
    as(adminA1, () => saveProvider(adminA1, mapping("Campus one export", "QA_CASH"))),
    as(adminA2, () => saveProvider(adminA2, mapping("Campus two export", "QA_CASH"))),
  ]);
  assert.deepEqual(results.map(r => r.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual((await versionsOf(campusA1, "QA_CASH")).map(v => v.version), [1]);
  assert.deepEqual((await versionsOf(campusA2, "QA_CASH")).map(v => v.version), [1]);
});

test("two schools each allocate their own version 1 for the same code", async () => {
  const saved = await as(adminB1, () => saveProvider(adminB1, mapping("School B export")));
  assert.equal(saved.version, 1);
  assert.equal(saved.schoolId, schoolB);
  assert.equal(saved.campusId, campusB1);
});

test("a teacher cannot save a mapping", async () => {
  await assert.rejects(as(teacherA1, () => saveProvider(teacherA1, mapping("Teacher export"))), (error: { status?: number }) => error.status === 403);
});

test("only committed mappings are audited", async () => {
  const committed = (await raw.payrollProvider.findMany({ where: { schoolId: { in: [schoolA, schoolB] } }, select: { id: true } })).map(p => p.id).sort();
  const audited = [...new Set((await raw.auditLog.findMany({ where: { tableName: "payroll_providers", schoolId: { in: [schoolA, schoolB] } }, select: { recordId: true } })).map(a => a.recordId))].sort();
  assert.deepEqual(audited, committed);
});
