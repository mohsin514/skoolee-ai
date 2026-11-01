import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { familyActivities as serviceFamilyActivities, requestPlace as serviceRequestPlace } from "@/lib/activities/service";
import { answerTrip as serviceAnswerTrip, cancelTrip as serviceCancelTrip } from "@/lib/family/trips";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { ApiError } from "@/lib/api/scope";
import { prisma as appDb } from "@/lib/db/prisma";

// SKAI-1563: cancelling a trip notice must end its linked TRIP activity for families. New bookings are refused,
// existing places become terminal (not pending consent), and another school or campus cannot cancel or book.
// Runs against an isolated local database only (DATABASE_URL must point at localhost).
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local isolated database is allowed");

const db = new PrismaClient();
// Service calls run inside the tenant context a signed-in request would provide.
const as = <T>(user: AuthUser, run: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: user.role, unscoped: false, rlsSession: true } as never, run);
const requestPlace = (user: AuthUser, body: Record<string, unknown>) => as(user, () => serviceRequestPlace(user, body));
const familyActivities = (user: AuthUser, studentId: string) => as(user, () => serviceFamilyActivities(user, studentId));
const cancelTrip = (user: AuthUser, tripId: string) => as(user, () => serviceCancelTrip(user, tripId));
const answerTrip = (user: AuthUser, body: Record<string, unknown>, when?: Date) => as(user, () => serviceAnswerTrip(user, body, when));

const DAY = 86_400_000;
const now = () => new Date();
const inDays = (d: number, h = 0) => new Date(Date.now() + d * DAY + h * 3_600_000);

type Fixture = { schoolId: string; campusA: string; campusB: string; coordinatorA: AuthUser; coordinatorB: AuthUser; school2Coordinator: AuthUser };
const created: string[] = [];

async function school(name: string) {
  const id = randomUUID();
  created.push(id);
  await db.school.create({ data: { id, name, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  return id;
}
async function campus(schoolId: string, name: string) {
  const id = randomUUID();
  await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId: id, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  return id;
}
async function staff(schoolId: string, campusId: string): Promise<AuthUser> {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${userId}@example.invalid`, password: "x", fullName: "Synthetic admin", role: "CAMPUS_ADMIN", schoolId, campusId, isActive: true, onboardingComplete: true } as never });
  return { userId, schoolId, campusId, role: "CAMPUS_ADMIN", email: "", fullName: "Synthetic admin" } as unknown as AuthUser;
}
async function guardian(schoolId: string, campusId: string, studentId: string): Promise<AuthUser> {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${userId}@example.invalid`, password: "x", fullName: "Synthetic guardian", role: "PARENT", schoolId, campusId, isActive: true, onboardingComplete: true } as never });
  const rel = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: userId, createdByUserId: userId, fullName: "Synthetic guardian", email: `${userId}@example.invalid`, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: userId, reason: "Synthetic trip fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false, consents: { fieldTrips: true, offsiteTravel: false, medicalTreatment: false, mediaPublication: false } } } });
  return { userId, schoolId, campusId, role: "PARENT", email: "", fullName: "Synthetic guardian" } as unknown as AuthUser;
}
async function learner(schoolId: string, campusId: string, key: string) {
  const id = randomUUID();
  const classId = (await db.class.findFirst({ where: { campusId, academicYear: 2026 } }))?.id ?? randomUUID();
  if (!await db.class.findUnique({ where: { id: classId } })) await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 6", section: "A", academicYear: 2026 } });
  await db.student.create({ data: { id, schoolId, campusId, classId, fullName: `Synthetic ${key}`, rollNo: key, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never });
  return id;
}
/** A published trip with v1 terms and a linked TRIP activity on one campus. */
async function linkedTrip(schoolId: string, campusId: string, createdById: string) {
  const trip = await db.trip.create({ data: { schoolId, campusId, createdById } });
  await db.tripVersion.create({ data: { schoolId, tripId: trip.id, version: 1, title: "Synthetic museum", destination: "Synthetic museum", departAt: inDays(2), returnAt: inDays(2, 4), respondBy: inDays(1), costAmount: 0, costCurrency: "PKR", contact: "Office", instructions: "Bring lunch.", consentKind: "fieldTrips", signatoryRule: "ANY_GUARDIAN", publishedById: createdById } });
  const activity = await db.activity.create({ data: { schoolId, campusId, kind: "TRIP", title: "Synthetic museum visit", description: "Visit", location: "Museum", startsAt: inDays(3), endsAt: inDays(3, 4), capacity: 5, classIds: [], staffIds: [], costAmount: 0, costCurrency: "PKR", tripId: trip.id, offerHours: 48, cancellationTerms: "Synthetic", coordinatorId: createdById } });
  return { tripId: trip.id, activityId: activity.id };
}
async function fixture(): Promise<Fixture> {
  const schoolId = await school("Synthetic Poplar School");
  const campusA = await campus(schoolId, "Poplar Main");
  const campusB = await campus(schoolId, "Poplar Annex");
  const other = await school("Synthetic Cedar School");
  const otherCampus = await campus(other, "Cedar Main");
  return { schoolId, campusA, campusB, coordinatorA: await staff(schoolId, campusA), coordinatorB: await staff(schoolId, campusB), school2Coordinator: await staff(other, otherCampus) };
}

let fx: Fixture;
before(async () => { fx = await fixture(); });
after(async () => {
  for (const id of created) await db.school.delete({ where: { id } }).catch(() => undefined);
  await db.$disconnect();
  await appDb.$disconnect();
});

const blocked = async (run: () => Promise<unknown>, status: number) => {
  await assert.rejects(run, (error: unknown) => error instanceof ApiError && error.status === status);
};

describe("SKAI-1563 cancelled linked trips", () => {
  it("a cancelled trip refuses new bookings and gives existing places a terminal state", async () => {
    const kidA = await learner(fx.schoolId, fx.campusA, "kid-a");
    const kidB = await learner(fx.schoolId, fx.campusA, "kid-b");
    const guardianA = await guardian(fx.schoolId, fx.campusA, kidA);
    const guardianB = await guardian(fx.schoolId, fx.campusA, kidB);
    const { tripId, activityId } = await linkedTrip(fx.schoolId, fx.campusA, fx.coordinatorA.userId);

    await requestPlace(guardianA, { studentId: kidA, activityId });
    await answerTrip(guardianA, { tripId, studentId: kidA, choice: "GRANTED", version: 1, idempotencyKey: `consent-${randomUUID()}` }, now());
    const confirmed = await familyActivities(guardianA, kidA);
    assert.equal(confirmed.activities.find(a => a.id === activityId)?.place?.status, "CONFIRMED");

    await cancelTrip(fx.coordinatorA, tripId);

    // Guardian B cannot book the still-linked activity.
    await blocked(() => requestPlace(guardianB, { studentId: kidB, activityId }), 409);
    assert.equal(await db.activityPlace.count({ where: { activityId, studentId: kidB } }), 0);

    // Existing place is terminal, nothing remains reserved or pending consent.
    const live = await db.activityPlace.findMany({ where: { activityId, status: { in: ["WAITLIST", "OFFERED", "RESERVED", "CONFIRMED"] } } });
    assert.deepEqual(live, []);
    const card = (await familyActivities(guardianA, kidA)).activities.find(a => a.id === activityId);
    assert.ok(card, "the family still sees the terminal card");
    assert.equal(card.place?.status, "CANCELLED");
    assert.notEqual(card.place?.requirements.consent, "PENDING", "no impossible pending-consent action");
    assert.ok(card.blocker, "the card explains it is unavailable");

    // Consent for the cancelled trip cannot be given any more.
    await blocked(() => answerTrip(guardianA, { tripId, studentId: kidA, choice: "GRANTED", version: 1, idempotencyKey: `consent-${randomUUID()}` }, now()), 409);
  });

  it("a legacy linked activity of a cancelled trip still refuses bookings", async () => {
    const kid = await learner(fx.schoolId, fx.campusA, "legacy-kid");
    const parent = await guardian(fx.schoolId, fx.campusA, kid);
    const { tripId, activityId } = await linkedTrip(fx.schoolId, fx.campusA, fx.coordinatorA.userId);
    // Simulates a trip cancelled before the cascade existed: trip status only.
    await db.trip.update({ where: { id: tripId }, data: { status: "CANCELLED" } });
    await blocked(() => requestPlace(parent, { studentId: kid, activityId }), 409);
  });

  it("isolates schools and campuses: other staff cannot cancel, other families cannot book", async () => {
    const kid = await learner(fx.schoolId, fx.campusA, "iso-kid");
    const parent = await guardian(fx.schoolId, fx.campusA, kid);
    const { tripId, activityId } = await linkedTrip(fx.schoolId, fx.campusA, fx.coordinatorA.userId);

    await blocked(() => cancelTrip(fx.coordinatorB, tripId), 404);
    await blocked(() => cancelTrip(fx.school2Coordinator, tripId), 404);
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: tripId } })).status, "OPEN");

    const other = await learner(fx.schoolId, fx.campusB, "annex-kid");
    const annexParent = await guardian(fx.schoolId, fx.campusB, other);
    await blocked(() => requestPlace(annexParent, { studentId: other, activityId }), 409);
    // A guardian from another school cannot book this school's activity for a learner of their own school.
    const otherKid = await learner(fx.school2Coordinator.schoolId, fx.school2Coordinator.campusId ?? "", "outside-kid");
    const outsider = await guardian(fx.school2Coordinator.schoolId, fx.school2Coordinator.campusId ?? "", otherKid);
    await blocked(() => requestPlace(outsider, { studentId: otherKid, activityId }), 404);
    assert.equal(await db.activityPlace.count({ where: { activityId, studentId: kid } }), 0);
    assert.ok(parent);
  });
});
