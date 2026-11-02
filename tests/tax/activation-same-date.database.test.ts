// SKAI-1474: two tax activations for the same campus and effective date never both stay ACTIVE, and the invoice
// resolver picks the same package version every time. Runs against a disposable loopback database with synthetic data only.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { activateDue, activationFor } from "../../src/lib/tax/service";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const raw = new PrismaClient();

const schoolA = `tax-a-${randomUUID()}`, schoolB = `tax-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const preparer = randomUUID(), approver = randomUUID();
const sameDate = new Date("2026-10-15T00:00:00.000Z");
const invoiceDate = new Date("2026-10-20T00:00:00.000Z");
const now = new Date("2026-10-16T00:00:00.000Z");
const as = <T>(schoolId: string, campusId: string, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: preparer, role: "PRINCIPAL" }, fn);

async function activation(schoolId: string, campusIds: string[], packageVersion: number, effectiveFrom: Date, status = "SCHEDULED") {
  return raw.taxActivation.create({ data: {
    schoolId, packageCode: "SA-DEMO", packageVersion, campusIds, legalName: "Synthetic school", currency: "PKR",
    effectiveFrom, ownerId: preparer, evidenceReviewer: approver, evidenceReference: "SYN-EVIDENCE-1", evidenceReviewedAt: new Date("2026-10-01T00:00:00.000Z"),
    configHash: `hash-${packageVersion}`, status, preparedById: preparer, approvedAt: new Date("2026-10-01T00:00:00.000Z"), approvedById: approver,
  } });
}
const activeFor = (schoolId: string, campusId: string) => raw.taxActivation.findMany({ where: { schoolId, status: "ACTIVE", campusIds: { has: campusId } }, select: { id: true, packageVersion: true } });

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic tax school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.createMany({ data: [
    { id: campusA1, schoolId: schoolA, name: "Synthetic campus A1", regId: campusA1, city: "Synthetic" },
    { id: campusA2, schoolId: schoolA, name: "Synthetic campus A2", regId: campusA2, city: "Synthetic" },
    { id: campusB1, schoolId: schoolB, name: "Synthetic campus B1", regId: campusB1, city: "Synthetic" },
  ] });
  await raw.user.create({ data: { id: preparer, schoolId: schoolA, email: `${preparer}@example.invalid`, role: "PRINCIPAL", fullName: "Synthetic preparer", onboardingComplete: true } });
  await raw.user.create({ data: { id: approver, schoolId: schoolA, email: `${approver}@example.invalid`, role: "PRINCIPAL", fullName: "Synthetic approver", onboardingComplete: true } });
});

after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("two same-date activations for one campus: exactly one stays ACTIVE, the later package version", async () => {
  const v1 = await activation(schoolA, [campusA1], 1, sameDate);
  const v2 = await activation(schoolA, [campusA1], 2, sameDate);
  await as(schoolA, campusA1, () => activateDue(schoolA, now));
  const active = await activeFor(schoolA, campusA1);
  assert.equal(active.length, 1, "one ACTIVE activation covers the campus at that instant");
  assert.equal(active[0].id, v2.id);
  assert.equal((await raw.taxActivation.findUniqueOrThrow({ where: { id: v1.id } })).status, "SUPERSEDED");
});

test("the invoice resolver returns the same winning activation on every call", async () => {
  const winner = (await activeFor(schoolA, campusA1))[0];
  for (let call = 0; call < 3; call += 1) {
    const found = await as(schoolA, campusA1, () => activationFor(prisma, schoolA, campusA1, invoiceDate));
    assert.equal(found?.id, winner.id);
  }
});

test("two concurrent activations for the same date leave one ACTIVE activation", async () => {
  const campusScope = [campusA2];
  await activation(schoolA, campusScope, 1, sameDate);
  await activation(schoolA, campusScope, 2, sameDate);
  await Promise.all([as(schoolA, campusA2, () => activateDue(schoolA, now)), as(schoolA, campusA2, () => activateDue(schoolA, now))]);
  const active = await activeFor(schoolA, campusA2);
  assert.equal(active.length, 1, "no campus ends with two ACTIVE activations");
  assert.equal(active[0].packageVersion, 2);
});

test("a later effective date still supersedes the earlier activation", async () => {
  const older = await activation(schoolA, [campusA1], 3, new Date("2026-09-01T00:00:00.000Z"), "ACTIVE");
  // Later than the same-date activation from the earlier test, so this one is the newest on the campus.
  const newer = await activation(schoolA, [campusA1], 4, new Date("2026-10-18T00:00:00.000Z"));
  await as(schoolA, campusA1, () => activateDue(schoolA, new Date("2026-10-20T00:00:00.000Z")));
  assert.equal((await raw.taxActivation.findUniqueOrThrow({ where: { id: older.id } })).status, "SUPERSEDED");
  assert.equal((await raw.taxActivation.findUniqueOrThrow({ where: { id: newer.id } })).status, "ACTIVE");
});

test("two schools: a same-date activation in school A never changes school B", async () => {
  const b1 = await activation(schoolB, [campusB1], 1, sameDate, "ACTIVE");
  await activation(schoolA, [campusA1], 5, sameDate);
  await as(schoolA, campusA1, () => activateDue(schoolA, now));
  assert.equal((await raw.taxActivation.findUniqueOrThrow({ where: { id: b1.id } })).status, "ACTIVE");
});

test("two campuses: an activation on campus A1 does not change campus A2's ACTIVE activation", async () => {
  const a2Active = await activation(schoolA, [campusA2], 9, new Date("2026-08-01T00:00:00.000Z"), "ACTIVE");
  await activation(schoolA, [campusA1], 10, new Date("2026-10-12T00:00:00.000Z"));
  await as(schoolA, campusA1, () => activateDue(schoolA, now));
  assert.equal((await raw.taxActivation.findUniqueOrThrow({ where: { id: a2Active.id } })).status, "ACTIVE");
});
