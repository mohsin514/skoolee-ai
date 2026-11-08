import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1612: concurrent identical sign-off requests create one request, one audit row and one
// notification; the loser returns repeated=true. A changed configuration may create a new request.
// Schools and campuses stay isolated.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");

const notified: { type: string; activationId: string; schoolId: string }[] = [];
mock.module("@/lib/notifications/in-app", { namedExports: { notify: (type: string, payload: { activationId: string; schoolId: string }) => { notified.push({ type, activationId: payload.activationId, schoolId: payload.schoolId }); } } });
let requestSignOff: typeof import("../../src/lib/tax/service").requestSignOff;

const raw = new PrismaClient();
const schoolA = `tax-a-${randomUUID()}`, schoolB = `tax-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const accountantA = { userId: randomUUID(), schoolId: schoolA, campusId: campusA1, role: "ACCOUNTANT", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic accountant" } as AuthUser;
const accountantB = { userId: randomUUID(), schoolId: schoolB, campusId: campusB1, role: "ACCOUNTANT", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic accountant" } as AuthUser;
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId!, userId: user.userId, role: user.role }, work);

/** A draft that clears every blocker: identity, owner, evidence, effective date and a passing fixture run for its hash. */
async function readyDraft(schoolId: string, campusIds: string[], userId: string, hash: string, legalName = "Synthetic Tax School") {
  const activation = await raw.taxActivation.create({ data: { schoolId, packageCode: "PK-DEMO", packageVersion: 1, campusIds, legalName, taxId: "1234567", currency: "PKR", effectiveFrom: new Date("2027-04-01T00:00:00Z"), ownerId: userId, evidenceReviewer: "Synthetic reviewer", evidenceReference: "EVID-1", evidenceReviewedAt: new Date("2026-10-01T00:00:00Z"), configHash: hash, preparedById: userId } });
  await raw.taxFixtureRun.create({ data: { schoolId, activationId: activation.id, configHash: hash, fixtures: [], results: [], passed: true, runById: userId } });
  return activation.id;
}
const auditRows = (schoolId: string, activationId: string) => raw.auditLog.count({ where: { schoolId, tableName: "tax_activations", recordId: activationId, newValue: { path: ["action"], equals: "SIGN_OFF_REQUESTED" } } });
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

before(async () => {
  ({ requestSignOff } = await import("../../src/lib/tax/service"));
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic tax school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  for (const [schoolId, campusId] of [[schoolA, campusA1], [schoolA, campusA2], [schoolB, campusB1]]) await raw.campus.create({ data: { id: campusId, schoolId, name: `Synthetic ${campusId.slice(0, 4)}`, regId: campusId, city: "Karachi" } });
  for (const user of [accountantA, accountantB]) await raw.user.create({ data: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId, role: "ACCOUNTANT", email: user.email, fullName: user.fullName!, onboardingComplete: true, isActive: true } });
});
after(async () => {
  await raw.taxActivation.deleteMany({ where: { schoolId: { in: [schoolA, schoolB] } } });
  await raw.$disconnect(); await prisma.$disconnect();
});

test("two identical concurrent sign-off requests create one audit row and one notification; the loser is repeated", async () => {
  for (let round = 0; round < 5; round++) {
    notified.length = 0;
    const id = await readyDraft(schoolA, [campusA1], accountantA.userId, `same-${round}-${randomUUID()}`);
    const results = await Promise.all([ctx(accountantA, () => requestSignOff(accountantA, id)), ctx(accountantA, () => requestSignOff(accountantA, id))]);
    assert.deepEqual(results.map((r) => r.repeated).sort(), [false, true], "exactly one request is new");
    assert.equal(results[0].requestedAt.getTime(), results[1].requestedAt.getTime(), "the loser returns the committed timestamp");
    assert.equal(await auditRows(schoolA, id), 1);
    await settle();
    assert.deepEqual(notified.map((n) => n.activationId), [id], "one notification intent");
  }
});

test("a changed configuration may create a new request for the same draft", async () => {
  const first = await readyDraft(schoolA, [campusA1], accountantA.userId, "cfg-1");
  assert.equal((await ctx(accountantA, () => requestSignOff(accountantA, first))).repeated, false);
  assert.equal((await ctx(accountantA, () => requestSignOff(accountantA, first))).repeated, true, "same configuration replays");
  await raw.taxActivation.update({ where: { id: first }, data: { configHash: "cfg-2", legalName: "Synthetic Tax School Renamed" } });
  await raw.taxFixtureRun.create({ data: { schoolId: schoolA, activationId: first, configHash: "cfg-2", fixtures: [], results: [], passed: true, runById: accountantA.userId } });
  assert.equal((await ctx(accountantA, () => requestSignOff(accountantA, first))).repeated, false, "a changed configuration is a new request");
  assert.equal(await auditRows(schoolA, first), 2);
});

test("concurrent requests on two campuses of one school, and in another school, are each independent", async () => {
  const hash = `iso-${randomUUID()}`;
  const onA1 = await readyDraft(schoolA, [campusA1], accountantA.userId, hash);
  const onA2 = await readyDraft(schoolA, [campusA2], accountantA.userId, hash);
  const onB = await readyDraft(schoolB, [campusB1], accountantB.userId, hash);
  notified.length = 0;
  const results = await Promise.all([
    ctx(accountantA, () => requestSignOff(accountantA, onA1)),
    ctx(accountantA, () => requestSignOff(accountantA, onA2)),
    ctx(accountantB, () => requestSignOff(accountantB, onB)),
  ]);
  assert.deepEqual(results.map((r) => r.repeated), [false, false, false], "same hash on other campuses or schools is not a duplicate");
  await settle();
  assert.deepEqual(notified.map((n) => n.activationId).sort(), [onA1, onA2, onB].sort());
});

test("a request from another school cannot reach a draft", async () => {
  const id = await readyDraft(schoolA, [campusA1], accountantA.userId, `deny-${randomUUID()}`);
  await assert.rejects(() => ctx(accountantB, () => requestSignOff(accountantB, id)), { status: 404 });
});
