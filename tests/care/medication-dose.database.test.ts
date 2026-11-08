import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { recordDose } from "../../src/lib/care/service";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const db = new PrismaClient(), schoolId = `dose1394-${randomUUID()}`, campusId = randomUUID();
const nurse: AuthUser = { userId: randomUUID(), schoolId, campusId, role: "TEACHER", email: `${randomUUID()}@example.invalid`, institutionKind: "GROUP" };
const outsider: AuthUser = { ...nurse, userId: randomUUID(), email: `${randomUUID()}@example.invalid` };
let instructionId = "", otherInstructionId = "", studentId = "";
const hourAgo = () => new Date(Date.now() - 60 * 60_000).toISOString();

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Clinic School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: campusId, regId: campusId, city: "Lahore" } });
  await db.user.create({ data: { id: nurse.userId, schoolId, campusId, role: "TEACHER", email: nurse.email, fullName: "Synthetic nurse", isActive: true } });
  await db.user.create({ data: { id: outsider.userId, schoolId, campusId, role: "TEACHER", email: outsider.email, fullName: "Synthetic outsider", isActive: true } });
  await db.confidentialSetting.create({ data: { schoolId, campusId, domain: "CLINIC", enabled: true, procedureReference: "SYNTH-PROC-1", leadUserId: nurse.userId, retentionMonths: 12, confirmedById: nurse.userId, confirmedAt: new Date() } });
  await db.confidentialMember.create({ data: { schoolId, campusId, domain: "CLINIC", userId: nurse.userId, role: "NURSE", grantedById: nurse.userId } });
  const cls = await db.class.create({ data: { schoolId, campusId, name: randomUUID(), section: "A", academicYear: 2026 } });
  const student = await db.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: "Synthetic Clinic Pupil", rollNo: randomUUID(), gender: "FEMALE" } });
  studentId = student.id;
  const base = { schoolId, campusId, studentId, medicine: "Synthetic syrup", dose: "5 ml", schedule: "Daily", authorizedBy: "Synthetic doctor", authorizationRef: randomUUID(), validFrom: new Date(Date.now() - 24 * 60 * 60_000), validUntil: new Date(Date.now() + 24 * 60 * 60_000), approvedById: nurse.userId };
  instructionId = (await db.medicationInstruction.create({ data: base })).id;
  otherInstructionId = (await db.medicationInstruction.create({ data: { ...base, authorizationRef: randomUUID() } })).id;
});

after(async () => { await db.$disconnect(); await prisma.$disconnect(); });

// Requests reach the service inside a signed-in tenant context; the test supplies the same scope.
const dose = (user: AuthUser, body: Record<string, unknown>) => runWithTenantContext({ schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: user.role, unscoped: false, rlsSession: true }, () => recordDose(user, { instructionId, dose: "5 ml", ...body }));
const rows = () => db.medicationDose.count({ where: { schoolId, studentId } });

test("a sequential retry with the same key records one dose and replays it", async () => {
  const key = randomUUID();
  const givenAt = hourAgo();
  const first = await dose(nurse, { idempotencyKey: key, givenAt });
  const second = await dose(nurse, { idempotencyKey: key, givenAt });
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(second.id, first.id);
  assert.equal(await db.medicationDose.count({ where: { schoolId, idempotencyKey: key } }), 1);
});

test("concurrent identical submissions persist one dose with one original success", async () => {
  const key = randomUUID();
  const givenAt = hourAgo();
  const before = await rows();
  const results = await Promise.all([1, 2, 3].map(() => dose(nurse, { idempotencyKey: key, givenAt })));
  assert.equal(results.filter(r => !r.replayed).length, 1);
  assert.equal(new Set(results.map(r => r.id)).size, 1);
  assert.equal(await db.medicationDose.count({ where: { schoolId, idempotencyKey: key } }), 1);
  assert.equal(await rows(), before + 1);
});

test("keyless identical administrations at the same time record one dose", async () => {
  const givenAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const first = await dose(nurse, { givenAt });
  const second = await dose(nurse, { givenAt });
  assert.equal(second.id, first.id);
  assert.equal(second.replayed, true);
});

test("separate administrations at different times are all kept", async () => {
  const before = await rows();
  await dose(nurse, { givenAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString() });
  await dose(nurse, { givenAt: new Date(Date.now() - 4 * 60 * 60_000).toISOString() });
  assert.equal(await rows(), before + 2);
});

test("a reused key for a different instruction is refused", async () => {
  const key = randomUUID();
  const givenAt = hourAgo();
  await dose(nurse, { idempotencyKey: key, givenAt });
  await assert.rejects(() => dose(nurse, { idempotencyKey: key, givenAt, instructionId: otherInstructionId }), { status: 409 });
});

test("a user without a confidential clinic membership is refused", async () => {
  await assert.rejects(() => dose(outsider, { idempotencyKey: randomUUID(), givenAt: hourAgo() }));
});
