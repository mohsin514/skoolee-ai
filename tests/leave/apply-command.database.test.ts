// SKAI-1533: leave applications run the overlap check and insert under a per-person advisory lock. The lock
// must not be read as a result set (pg_advisory_xact_lock returns void), and a second application for the same
// person must still be refused. Runs against a disposable loopback database with synthetic data only.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { applyLeave } from "../../src/lib/leave/apply-command";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const raw = new PrismaClient();

const schoolA = `leave-a-${randomUUID()}`, schoolB = `leave-b-${randomUUID()}`;
const campusA = randomUUID(), campusA2 = randomUUID(), campusB = randomUUID();
const typeA = randomUUID(), typeB = randomUUID();
const teacher: AuthUser = { userId: randomUUID(), schoolId: schoolA, campusId: campusA, role: "TEACHER", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic Teacher", accessVersion: 0 };
const accountant: AuthUser = { userId: randomUUID(), schoolId: schoolA, campusId: campusA, role: "ACCOUNTANT", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic Accountant", accessVersion: 0 };
const otherCampusTeacher: AuthUser = { userId: randomUUID(), schoolId: schoolA, campusId: campusA2, role: "TEACHER", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic Campus Two Teacher", accessVersion: 0 };
const schoolBTeacher: AuthUser = { userId: randomUUID(), schoolId: schoolB, campusId: campusB, role: "TEACHER", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic School B Teacher", accessVersion: 0 };
const parent: AuthUser = { userId: randomUUID(), schoolId: schoolA, campusId: campusA, role: "PARENT", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic Parent", accessVersion: 0 };

const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, fn);
const body = (leaveTypeId: string, fromDate: string, toDate: string, extra: Record<string, unknown> = {}) => ({ leaveTypeId, fromDate, toDate, ...extra });
const requestsFor = (userId: string) => raw.leaveRequest.count({ where: { userId } });

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic leave school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.createMany({ data: [
    { id: campusA, schoolId: schoolA, name: "Synthetic campus A", regId: campusA, city: "Synthetic" },
    { id: campusA2, schoolId: schoolA, name: "Synthetic campus A2", regId: campusA2, city: "Synthetic" },
    { id: campusB, schoolId: schoolB, name: "Synthetic campus B", regId: campusB, city: "Synthetic" },
  ] });
  await raw.leaveType.createMany({ data: [
    { id: typeA, schoolId: schoolA, campusId: campusA, name: "Synthetic casual" },
    { id: typeB, schoolId: schoolB, campusId: campusB, name: "Synthetic casual" },
  ] });
  for (const user of [teacher, accountant, otherCampusTeacher, schoolBTeacher, parent]) {
    await raw.user.create({ data: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId, email: user.email, role: user.role, fullName: user.fullName!, onboardingComplete: true } });
  }
});

after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("a valid teacher application succeeds once and persists exactly one request", async () => {
  const request = await as(teacher, () => applyLeave(teacher, body(typeA, "2027-03-02", "2027-03-03")));
  assert.equal(request.userId, teacher.userId);
  assert.equal(request.schoolId, schoolA);
  assert.equal(await requestsFor(teacher.userId), 1);
});

test("a valid non-teaching staff application succeeds", async () => {
  const request = await as(accountant, () => applyLeave(accountant, body(typeA, "2027-04-06", "2027-04-06")));
  assert.equal(request.userId, accountant.userId);
  assert.equal(await requestsFor(accountant.userId), 1);
});

test("an overlapping application is refused with 409 and nothing new is written", async () => {
  await assert.rejects(
    as(teacher, () => applyLeave(teacher, body(typeA, "2027-03-03", "2027-03-04"))),
    (error: { status?: number }) => error.status === 409
  );
  assert.equal(await requestsFor(teacher.userId), 1);
});

test("concurrent identical applications for one person create exactly one request", async () => {
  const user = { ...teacher, userId: randomUUID(), email: `${randomUUID()}@example.invalid` };
  await raw.user.create({ data: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId, email: user.email, role: user.role, fullName: user.fullName!, onboardingComplete: true } });
  const results = await Promise.allSettled([1, 2, 3].map(() => as(user, () => applyLeave(user, body(typeA, "2027-05-10", "2027-05-12")))));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await requestsFor(user.userId), 1);
});

test("a leave type from another school is not found and nothing is written", async () => {
  await assert.rejects(
    as(teacher, () => applyLeave(teacher, body(typeB, "2027-06-01", "2027-06-02"))),
    (error: { status?: number }) => error.status === 404
  );
  assert.equal(await requestsFor(teacher.userId), 1);
});

test("a leave type from another campus of the same school is not found", async () => {
  await assert.rejects(
    as(otherCampusTeacher, () => applyLeave(otherCampusTeacher, body(typeA, "2027-06-01", "2027-06-02"))),
    (error: { status?: number }) => error.status === 404
  );
  assert.equal(await requestsFor(otherCampusTeacher.userId), 0);
});

test("a school B teacher's application stays in school B", async () => {
  const request = await as(schoolBTeacher, () => applyLeave(schoolBTeacher, body(typeB, "2027-07-01", "2027-07-01")));
  assert.equal(request.schoolId, schoolB);
  assert.equal(request.campusId, campusB);
});

test("a parent role is refused with 403", async () => {
  await assert.rejects(
    as(parent, () => applyLeave(parent, body(typeA, "2027-08-01", "2027-08-01"))),
    (error: { status?: number }) => error.status === 403
  );
  assert.equal(await requestsFor(parent.userId), 0);
});
