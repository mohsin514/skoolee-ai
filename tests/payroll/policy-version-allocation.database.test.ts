import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { savePolicy, saveProvider } from "../../src/lib/payroll-runs/service";

// SKAI-1544: concurrent saves for one campus allocate distinct versions, never surface a raw
// unique-constraint error, and audit only the versions that committed. Two schools and two campuses
// keep the allocation scoped per campus.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient();
const schoolA = `policy-a-${randomUUID()}`, schoolB = `policy-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const actor = (schoolId: string, campusId: string, role: AuthUser["role"] = "CAMPUS_ADMIN"): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const adminA1 = actor(schoolA, campusA1), adminA2 = actor(schoolA, campusA2), adminB1 = actor(schoolB, campusB1);
const principalA1 = actor(schoolA, campusA1, "PRINCIPAL");
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId!, userId: user.userId, role: user.role }, work);

const policy = (over: Record<string, unknown> = {}) => ({
  entityName: "Synthetic Cedar School", currency: "SAR", effectiveFrom: "2027-03-01", packageLabel: "KSA-demo v1",
  scopeNote: "Demonstration rules; requires local validation before use.", prorationBasis: "CALENDAR_DAYS", leaveDivisor: "CALENDAR_DAYS",
  leaveYearStartMonth: 9, rounding: "HALF_UP", ...over,
});
const provider = (over: Record<string, unknown> = {}) => ({
  code: "DEMOPAY", name: "Synthetic provider", currencies: ["SAR"],
  columns: [{ header: "EmpID", field: "providerEmployeeId" }, { header: "Net", field: "net" }], ...over,
});

async function newCampus(schoolId: string) {
  const id = randomUUID();
  await raw.campus.create({ data: { id, schoolId, name: `Synthetic ${id.slice(0, 4)}`, regId: id, city: "Riyadh" } });
  return id;
}
const policyVersions = (campusId: string) => raw.payrollPolicy.findMany({ where: { campusId }, orderBy: { version: "asc" }, select: { version: true } });
const policyAudits = async (campusId: string) => (await raw.auditLog.findMany({ where: { campusId, tableName: "payroll_policies" }, select: { recordId: true, newValue: true } }));

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic policy school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  for (const [schoolId, campusId] of [[schoolA, campusA1], [schoolA, campusA2], [schoolB, campusB1]]) await raw.campus.create({ data: { id: campusId, schoolId, name: `Synthetic ${campusId.slice(0, 4)}`, regId: campusId, city: "Riyadh" } });
  for (const user of [adminA1, adminA2, adminB1, principalA1]) await raw.user.create({ data: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
});
after(async () => {
  // Audit rows are append-only, so they stay; the synthetic schools are unique per run.
  for (const m of [raw.payrollProvider, raw.payrollPolicy]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId: { in: [schoolA, schoolB] } } });
  await raw.$disconnect(); await prisma.$disconnect();
});

test("two concurrent policy saves on one campus both commit the next versions, and each is audited", async () => {
  // Repeat on fresh campuses: the race needs both saves to read an empty history before either writes.
  for (let round = 0; round < 5; round++) {
    const campusId = await newCampus(schoolA);
    const user = actor(schoolA, campusId);
    await raw.user.create({ data: { id: user.userId, schoolId: schoolA, campusId, role: user.role, email: user.email, fullName: "Synthetic admin", onboardingComplete: true } });
    const saved = await Promise.all([
      ctx(user, () => savePolicy(user, policy({ packageLabel: "Race v1" }))),
      ctx(user, () => savePolicy(user, policy({ packageLabel: "Race v2", prorationBasis: "FIXED_30", leaveDivisor: "FIXED_30" }))),
    ]);
    assert.deepEqual(saved.map((p) => p.version).sort(), [1, 2], "each save gets its own version");
    assert.deepEqual((await policyVersions(campusId)).map((p) => p.version), [1, 2]);
    const audits = await policyAudits(campusId);
    assert.deepEqual(audits.map((a) => (a.newValue as { version: number }).version).sort(), [1, 2], "one audit event per committed version");
  }
});

test("concurrent provider saves for one campus and code also allocate distinct versions", async () => {
  const campusId = await newCampus(schoolA);
  const user = actor(schoolA, campusId);
  await raw.user.create({ data: { id: user.userId, schoolId: schoolA, campusId, role: user.role, email: user.email, fullName: "Synthetic admin", onboardingComplete: true } });
  const saved = await Promise.all([
    ctx(user, () => saveProvider(user, provider({ name: "Mapping one" }))),
    ctx(user, () => saveProvider(user, provider({ name: "Mapping two" }))),
  ]);
  assert.deepEqual(saved.map((p) => p.version).sort(), [1, 2]);
});

test("an identical repeat save returns the current version instead of creating another", async () => {
  const campusId = await newCampus(schoolA);
  const user = actor(schoolA, campusId);
  await raw.user.create({ data: { id: user.userId, schoolId: schoolA, campusId, role: user.role, email: user.email, fullName: "Synthetic admin", onboardingComplete: true } });
  const [first, second] = await Promise.all([ctx(user, () => savePolicy(user, policy())), ctx(user, () => savePolicy(user, policy()))]);
  assert.equal(second.id, first.id, "the same payload replays the committed version");
  assert.deepEqual((await policyVersions(campusId)).map((p) => p.version), [1]);
  assert.equal((await policyAudits(campusId)).length, 1, "a replay writes no second audit event");
});

test("version lines are per campus: the same school's other campus and another school start at version 1", async () => {
  const [a1, a2, b1] = await Promise.all([
    ctx(adminA1, () => savePolicy(adminA1, policy({ packageLabel: "Campus A1" }))),
    ctx(adminA2, () => savePolicy(adminA2, policy({ packageLabel: "Campus A2" }))),
    ctx(adminB1, () => savePolicy(adminB1, policy({ packageLabel: "School B" }))),
  ]);
  assert.equal(a2.version, 1, "a second campus of the same school has its own line");
  assert.equal(b1.version, 1, "another school has its own line");
  assert.equal(a1.campusId, campusA1);
  assert.equal(b1.schoolId, schoolB);
});

test("denied roles cannot save policies on any campus", async () => {
  await assert.rejects(() => ctx(principalA1, () => savePolicy(principalA1, policy())), { status: 403 });
  await assert.rejects(() => ctx(adminA2, () => savePolicy(adminA2, policy({ effectiveFrom: "not-a-date" }))), { status: 400 });
});
