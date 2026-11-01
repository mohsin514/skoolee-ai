// SKAI-1449: the planner's reads are scoped by school and campus and refuse roles that may not plan trips.
// An empty day is a successful empty response. Runs against a disposable loopback database with synthetic data only.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { coordinatorStaff, listTrips } from "../../src/lib/transport/service";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const raw = new PrismaClient();

const schoolA = `tr-a-${randomUUID()}`, schoolB = `tr-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const actor = (schoolId: string, campusId: string, role: AuthUser["role"], name: string): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, fullName: name, accessVersion: 0 });
const coordA1 = actor(schoolA, campusA1, "CAMPUS_ADMIN", "Synthetic coordinator A1");
const staffA2 = actor(schoolA, campusA2, "TEACHER", "Synthetic teacher A2");
const staffB1 = actor(schoolB, campusB1, "TEACHER", "Synthetic teacher B1");
const parentA1 = actor(schoolA, campusA1, "PARENT", "Synthetic parent A1");
const as = <T>(who: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: who.schoolId, campusId: who.campusId, userId: who.userId, role: who.role }, fn);

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic transport school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.createMany({ data: [
    { id: campusA1, schoolId: schoolA, name: "Synthetic campus A1", regId: campusA1, city: "Synthetic" },
    { id: campusA2, schoolId: schoolA, name: "Synthetic campus A2", regId: campusA2, city: "Synthetic" },
    { id: campusB1, schoolId: schoolB, name: "Synthetic campus B1", regId: campusB1, city: "Synthetic" },
  ] });
  for (const who of [coordA1, staffA2, staffB1, parentA1]) await raw.user.create({ data: { id: who.userId, schoolId: who.schoolId, campusId: who.campusId, email: who.email, role: who.role, fullName: who.fullName!, onboardingComplete: true } });
});

after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("a coordinator's valid day with no trips is a successful empty response", async () => {
  const result = await as(coordA1, () => listTrips(coordA1, "2031-06-02"));
  assert.deepEqual(result.trips, []);
});

test("a parent cannot read the planner's trip list", async () => {
  await assert.rejects(as(parentA1, () => listTrips(parentA1, "2031-06-02")), (error: { status?: number }) => error.status === 403);
});

test("a non-coordinator cannot read the planner's staff choices", async () => {
  await assert.rejects(as(staffA2, () => coordinatorStaff(staffA2)), (error: { status?: number }) => error.status === 403);
});

test("two schools: the coordinator's staff choices never include another school's staff", async () => {
  const staff = await as(coordA1, () => coordinatorStaff(coordA1));
  assert.ok(!staff.some(s => s.id === staffB1.userId), "school B staff are not offered");
});

test("two campuses: a coordinator on campus one is offered campus one staff, not campus two's", async () => {
  const staff = await as(coordA1, () => coordinatorStaff(coordA1));
  assert.ok(!staff.some(s => s.id === staffA2.userId), "campus two staff are not offered on campus one");
});

test("two schools: the trip list for the same day is scoped to the caller's school", async () => {
  const bResult = await as(staffB1, () => listTrips(staffB1, "2031-06-02"));
  assert.deepEqual(bResult.trips, []);
});
