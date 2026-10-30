import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { DEMO_LABEL, DEMO_SCHOOL_ID, resetDemoTenant } from "../../scripts/demo/reset-demo-tenant";

// SKO-452: the demo reset restores the same labelled synthetic state every time, touches no other
// tenant, and refuses a school at the demo id that is not labelled as the synthetic demo.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), otherId = `demo-other-${randomUUID()}`, password = "SyntheticDemoReset452!";

before(async () => {
  await raw.school.deleteMany({ where: { id: DEMO_SCHOOL_ID } });
  await raw.school.create({ data: { id: otherId, name: "Synthetic customer-like school", slug: otherId, regId: otherId, contactEmail: `${otherId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  const campusId = randomUUID();
  await raw.campus.create({ data: { id: campusId, schoolId: otherId, name: "Other", regId: campusId, city: "Synthetic" } });
  await raw.user.create({ data: { schoolId: otherId, campusId, email: `${randomUUID()}@example.invalid`, fullName: "Synthetic other user", role: "TEACHER" } });
});
after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [DEMO_SCHOOL_ID, otherId] } } });
  await raw.$disconnect(); await prisma.$disconnect();
});

test("two resets give the same labelled state and leave other tenants alone", async () => {
  const before = await raw.user.count({ where: { schoolId: otherId } });
  const first = await resetDemoTenant(raw, password);
  const second = await resetDemoTenant(raw, password);
  assert.equal(first.fingerprint, second.fingerprint, "a reset restores a known state");
  assert.deepEqual(second.counts, { users: 5, classes: 2, students: 12, guardianLinks: 2, exams: 3, approvedRecords: 2, familyActions: 1 });
  const school = await raw.school.findUniqueOrThrow({ where: { id: DEMO_SCHOOL_ID } });
  assert.ok(school.name.startsWith(DEMO_LABEL));
  const people = [...await raw.student.findMany({ where: { schoolId: DEMO_SCHOOL_ID }, select: { fullName: true } }), ...await raw.user.findMany({ where: { schoolId: DEMO_SCHOOL_ID }, select: { fullName: true } })];
  assert.ok(people.every((p) => p.fullName.startsWith(DEMO_LABEL)), "every demo person is labelled synthetic");
  assert.ok((await raw.user.findMany({ where: { schoolId: DEMO_SCHOOL_ID }, select: { email: true } })).every((u) => u.email.endsWith("@example.invalid")), "no real addresses");
  assert.equal(await raw.user.count({ where: { schoolId: otherId } }), before, "the other tenant is untouched");
  assert.equal(await raw.school.count({ where: { id: otherId } }), 1);
});

test("a school at the demo id without the synthetic label is never reset", async () => {
  await raw.school.update({ where: { id: DEMO_SCHOOL_ID }, data: { name: "Real-looking school" } });
  await assert.rejects(() => resetDemoTenant(raw, password), /is not labelled "\[Synthetic demo\]". Nothing was changed./);
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: DEMO_SCHOOL_ID } })).name, "Real-looking school");
  await assert.rejects(() => resetDemoTenant(raw, "short"), /DEMO_PASSWORD/);
});
