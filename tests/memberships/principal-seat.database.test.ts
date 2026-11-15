import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertCampusPrincipalSeatFree } from "../../src/lib/staff/invitation-write";

// SKAI-2009: a role change to PRINCIPAL obeys the same one-principal-per-campus rule as an invitation.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== process.env.QA_DB_PORT) throw new Error("Use only the isolated QA database (set QA_DB_PORT).");
const raw = new PrismaClient();
const school = randomUUID(), campus = randomUUID(), other = randomUUID();
const principal = randomUUID(), teacher = randomUUID();
const seat = (campusId: string, excludeUserId: string) => raw.$transaction((tx) => assertCampusPrincipalSeatFree(tx as never, { schoolId: school, campusId, excludeUserId }));

before(async () => {
  await raw.school.create({ data: { id: school, name: "Synthetic principal seat", slug: school, regId: school, contactEmail: `${school}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO", registrationKind: "GROUP" } });
  for (const id of [campus, other]) await raw.campus.create({ data: { id, schoolId: school, name: "Synthetic campus", city: "Synthetic", regId: id } });
  await raw.user.create({ data: { id: principal, schoolId: school, campusId: campus, email: `${principal}@example.invalid`, fullName: "Synthetic principal", role: "PRINCIPAL" } });
  await raw.user.create({ data: { id: teacher, schoolId: school, campusId: campus, email: `${teacher}@example.invalid`, fullName: "Synthetic teacher", role: "TEACHER" } });
});
after(async () => { await raw.school.deleteMany({ where: { id: school } }); await raw.$disconnect(); });

test("a second active principal on the campus is refused with 409", async () => {
  await assert.rejects(() => seat(campus, teacher), (e: { status?: number }) => e.status === 409);
});
test("the current principal keeps their own seat", async () => { await seat(campus, principal); });
test("a campus without a principal is free", async () => { await seat(other, teacher); });
test("an inactive principal does not hold the seat", async () => {
  await raw.user.update({ where: { id: principal }, data: { isActive: false } });
  await seat(campus, teacher);
  await raw.user.update({ where: { id: principal }, data: { isActive: true } });
});
test("a pending principal invitation holds the seat", async () => {
  const token = randomUUID();
  await raw.staffInvitation.create({ data: { schoolId: school, campusId: other, email: `${token}@example.invalid`, role: "PRINCIPAL", token, expiresAt: new Date(Date.now() + 3600000), invitedBy: "Synthetic" } });
  await assert.rejects(() => seat(other, teacher), (e: { status?: number }) => e.status === 409);
});
