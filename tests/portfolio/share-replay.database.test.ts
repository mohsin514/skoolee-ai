import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1450: a retried or double-submitted portfolio share replays the share it already created. Different
// entries or a different title make a new share. Role, school and campus boundaries are checked. The guardian
// permission check is stubbed, so the test isolates the share service.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async () => ({ id: "relationship" }) } });
let createShare: typeof import("../../src/lib/portfolio/service").createShare;
let revokeShare: typeof import("../../src/lib/portfolio/service").revokeShare;

const raw = new PrismaClient();
const schoolA = `share-a-${randomUUID()}`, schoolB = `share-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const classA1 = randomUUID();
const teacherA1 = randomUUID(), teacherA2 = randomUUID(), teacherB1 = randomUUID(), guardianA = randomUUID();
const studentA1 = randomUUID();
const entryIds = [randomUUID(), randomUUID()], otherEntry = randomUUID();
const user = (schoolId: string, campusId: string | null, userId: string, role: AuthUser["role"]): AuthUser => ({ userId, schoolId, campusId, role, email: `${userId}@example.invalid`, fullName: "Synthetic" } as AuthUser);
const teacher = user(schoolA, campusA1, teacherA1, "TEACHER");
const ctx = <T>(u: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: u.schoolId, campusId: u.campusId!, userId: u.userId, role: u.role as "TEACHER" }, work);
const share = (u: AuthUser, extra: Record<string, unknown> = {}) => ctx(u, () => createShare(u, { studentId: studentA1, guardianUserId: guardianA, entryIds, title: "Term progress", days: 30, ...extra }));
const sharesFor = () => raw.portfolioShare.count({ where: { schoolId: schoolA, studentId: studentA1 } });

before(async () => {
  ({ createShare, revokeShare } = await import("../../src/lib/portfolio/service"));
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic share school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [schoolId, campusId] of [[schoolA, campusA1], [schoolA, campusA2], [schoolB, campusB1]]) await raw.campus.create({ data: { id: campusId, schoolId, name: `Synthetic ${campusId.slice(0, 4)}`, regId: campusId, city: "Lahore" } });
  for (const [id, schoolId, campusId, role] of [[teacherA1, schoolA, campusA1, "TEACHER"], [teacherA2, schoolA, campusA2, "TEACHER"], [teacherB1, schoolB, campusB1, "TEACHER"], [guardianA, schoolA, campusA1, "PARENT"]] as const) {
    await raw.user.create({ data: { id, schoolId, campusId, role: role as "TEACHER", email: `${id}@example.invalid`, fullName: "Synthetic", onboardingComplete: true, isActive: true } });
  }
  await raw.class.create({ data: { id: classA1, schoolId: schoolA, campusId: campusA1, name: `Class ${classA1.slice(0, 8)}`, academicYear: 2027, classTeacherId: teacherA1 } });
  await raw.student.create({ data: { id: studentA1, schoolId: schoolA, campusId: campusA1, classId: classA1, fullName: "Synthetic learner", rollNo: `R${studentA1.slice(0, 6)}`, gender: "FEMALE", enrollmentDate: new Date("2027-01-01T00:00:00Z"), status: "active" } });
  for (const id of [...entryIds, otherEntry]) {
    await raw.portfolioEntry.create({ data: { id, schoolId: schoolA, campusId: campusA1, studentId: studentA1, classId: classA1, goal: {}, title: "Approved work", assignmentId: randomUUID(), earlierVersionId: randomUUID(), criterionIds: [], reflection: "Reflection", approvedReflection: "Reflection", reflectionVersion: 1, status: "APPROVED", familyVisible: true, version: 1, idempotencyKey: randomUUID(), createdById: teacherA1, reviewedById: teacherA1, approvedVersion: 1 } as never });
  }
});
after(async () => {
  await raw.portfolioShare.deleteMany({ where: { schoolId: schoolA } });
  await raw.portfolioEntry.deleteMany({ where: { schoolId: schoolA } });
  await raw.$disconnect(); await prisma.$disconnect();
});

test("a retried request after a lost response replays the share it already created", async () => {
  const first = await share(teacher);
  const retry = await share(teacher);
  assert.equal(retry.id, first.id, "the retry returns the original share");
  assert.equal(await sharesFor(), 1, "one share and one collection");
});

test("two identical submits at once create one share and both return it", async () => {
  const before = await sharesFor();
  const [a, b] = await Promise.all([share(teacher, { title: "Rapid" }), share(teacher, { title: "Rapid" })]);
  assert.equal(a.id, b.id);
  assert.equal(await sharesFor(), before + 1);
});

test("a different set of entries or a different title is a new share", async () => {
  const base = await share(teacher, { title: "Distinct one" });
  const otherEntries = await ctx(teacher, () => createShare(teacher, { studentId: studentA1, guardianUserId: guardianA, entryIds: [entryIds[0]], title: "Distinct one", days: 30 }));
  const otherTitle = await share(teacher, { title: "Distinct two" });
  assert.notEqual(otherEntries.id, base.id);
  assert.notEqual(otherTitle.id, base.id);
});

test("a revoked share is not replayed; a new request creates a new share", async () => {
  const live = await share(teacher, { title: "Revocable" });
  await ctx(teacher, () => revokeShare(teacher, live.id));
  const replacement = await share(teacher, { title: "Revocable" });
  assert.notEqual(replacement.id, live.id);
});

test("only a teacher who teaches the learner's class can share it", async () => {
  await assert.rejects(() => ctx(user(schoolA, campusA2, teacherA2, "TEACHER"), () => createShare(user(schoolA, campusA2, teacherA2, "TEACHER"), { studentId: studentA1, guardianUserId: guardianA, entryIds, days: 30 })), { status: 404 }, "another campus's teacher");
  const guardian = user(schoolA, campusA1, guardianA, "PARENT");
  await assert.rejects(() => ctx(guardian, () => createShare(guardian, { studentId: studentA1, guardianUserId: guardianA, entryIds, days: 30 })), { status: 404 }, "a guardian cannot create a share");
});

test("another school's teacher cannot share this learner's entries", async () => {
  const outsider = user(schoolB, campusB1, teacherB1, "TEACHER");
  await assert.rejects(() => ctx(outsider, () => createShare(outsider, { studentId: studentA1, guardianUserId: guardianA, entryIds, days: 30 })), { status: 404 });
});
