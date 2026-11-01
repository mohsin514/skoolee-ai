// SKAI-1422: retrying the same assessment booking after a lost response replays the original booking instead of
// creating a second appointment. A different time, kind, or a cancelled booking still books a new one. Runs
// against a disposable loopback database with synthetic data only.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { actOnApplication } from "../../src/lib/admissions/service";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const raw = new PrismaClient();

const schoolA = `adm-a-${randomUUID()}`, schoolB = `adm-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const actor = (schoolId: string, campusId: string, role: AuthUser["role"], name: string): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, fullName: name, accessVersion: 0 });
const adminA1 = actor(schoolA, campusA1, "CAMPUS_ADMIN", "Synthetic admin A1");
const adminA2 = actor(schoolA, campusA2, "CAMPUS_ADMIN", "Synthetic admin A2");
const adminB1 = actor(schoolB, campusB1, "CAMPUS_ADMIN", "Synthetic admin B1");
const teacherA1 = actor(schoolA, campusA1, "TEACHER", "Synthetic teacher A1");
const as = <T>(who: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: who.schoolId, campusId: who.campusId, userId: who.userId, role: who.role }, fn);
const appA1 = randomUUID(), appB1 = randomUUID();
const when = "2031-03-10T09:00:00.000Z";
const booking = (overrides: Record<string, unknown> = {}) => ({ id: appA1, action: "schedule-assessment", kind: "INTERVIEW", scheduledAt: when, durationMin: 30, ...overrides });
const bookingsFor = (applicationId: string) => raw.admissionAssessment.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" }, select: { id: true, status: true } });
const eventsFor = (applicationId: string) => raw.admissionApplicationEvent.count({ where: { applicationId, kind: "ASSESSMENT_SCHEDULED" } });

async function application(id: string, schoolId: string, campusId: string, createdById: string) {
  const form = await raw.admissionForm.create({ data: { schoolId, campusId, name: "Synthetic form", draft: {}, publicToken: randomUUID() } });
  const version = await raw.admissionFormVersion.create({ data: { schoolId, campusId, formId: form.id, version: 1, definition: {}, publishedById: createdById } });
  await raw.admissionApplication.create({ data: { id, schoolId, campusId, formVersionId: version.id, reference: `REF-${id.slice(0, 8)}`, status: "UNDER_REVIEW", answers: {}, childName: "Synthetic child" } });
}

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic admissions school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.createMany({ data: [
    { id: campusA1, schoolId: schoolA, name: "Synthetic campus A1", regId: campusA1, city: "Synthetic" },
    { id: campusA2, schoolId: schoolA, name: "Synthetic campus A2", regId: campusA2, city: "Synthetic" },
    { id: campusB1, schoolId: schoolB, name: "Synthetic campus B1", regId: campusB1, city: "Synthetic" },
  ] });
  for (const who of [adminA1, adminA2, adminB1, teacherA1]) await raw.user.create({ data: { id: who.userId, schoolId: who.schoolId, campusId: who.campusId, email: who.email, role: who.role, fullName: who.fullName!, onboardingComplete: true } });
  await application(appA1, schoolA, campusA1, adminA1.userId);
  await application(appB1, schoolB, campusB1, adminB1.userId);
});

after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("a retried booking after a lost response replays the original and creates nothing new", async () => {
  const first = await as(adminA1, () => actOnApplication(adminA1, campusA1, booking()));
  const retry = await as(adminA1, () => actOnApplication(adminA1, campusA1, booking()));
  assert.equal((await bookingsFor(appA1)).length, 1, "one appointment, not two");
  assert.equal(await eventsFor(appA1), 1, "one scheduling event");
  assert.equal(JSON.stringify(retry).includes(String((first as { id?: string }).id ?? "")), true, "the retry returns the original booking");
});

test("a retry with the same staff and room replays instead of reporting a clash", async () => {
  const staff = adminA1.userId;
  const first = await as(adminA1, () => actOnApplication(adminA1, campusA1, booking({ kind: "TASTER_DAY", staffId: staff, location: "Room 4", scheduledAt: "2031-04-01T10:00:00.000Z" })));
  await as(adminA1, () => actOnApplication(adminA1, campusA1, booking({ kind: "TASTER_DAY", staffId: staff, location: "Room 4", scheduledAt: "2031-04-01T10:00:00.000Z" })));
  assert.equal((await bookingsFor(appA1)).filter(b => b.status === "SCHEDULED").length, 2, "the taster day and the interview, once each");
  assert.ok(first);
});

test("a different time or kind books a new appointment", async () => {
  const before = (await bookingsFor(appA1)).length;
  await as(adminA1, () => actOnApplication(adminA1, campusA1, booking({ scheduledAt: "2031-03-11T09:00:00.000Z" })));
  await as(adminA1, () => actOnApplication(adminA1, campusA1, booking({ kind: "TOUR" })));
  assert.equal((await bookingsFor(appA1)).length, before + 2);
});

test("a cancelled booking does not block the same slot from being booked again", async () => {
  const [cancelled] = await raw.admissionAssessment.findMany({ where: { applicationId: appA1, kind: "INTERVIEW", scheduledAt: new Date(when) } });
  await raw.admissionAssessment.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
  const again = await as(adminA1, () => actOnApplication(adminA1, campusA1, booking()));
  assert.ok(again);
  assert.notEqual((again as { id?: string }).id, cancelled.id);
});

test("two schools: an application in school B cannot be booked from school A", async () => {
  await assert.rejects(as(adminA1, () => actOnApplication(adminA1, campusA1, booking({ id: appB1 }))), (error: { status?: number }) => error.status === 404);
  assert.equal((await bookingsFor(appB1)).length, 0);
});

test("two campuses: a campus two admin cannot book on a campus one application", async () => {
  await assert.rejects(as(adminA2, () => actOnApplication(adminA2, campusA2, booking())), (error: { status?: number }) => error.status === 404);
});

test("a teacher cannot book an assessment", async () => {
  await assert.rejects(as(teacherA1, () => actOnApplication(teacherA1, campusA1, booking({ scheduledAt: "2031-05-01T09:00:00.000Z" }))), (error: { status?: number }) => error.status === 403);
});
