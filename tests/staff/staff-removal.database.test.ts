import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { runAsUser } from "../../src/lib/db/tenant-context";
import { ApiError } from "../../src/lib/api/scope";
import type { UserRole } from "../../src/lib/roles";
import { mock } from "node:test";

// Capture STAFF_REMOVED notify calls. Notification fan-out depends on campus directory wiring that a test
// database does not have, so the test checks the call itself: one per committed removal and none for a loser.
const notified: Array<{ staffId?: string }> = [];
mock.module("../../src/lib/notifications/in-app", { namedExports: { notify: (type: string, payload: { staffId?: string }) => { if (type === "STAFF_REMOVED") notified.push(payload); } } });
const loadRemoval = () => import("../../src/lib/staff/removal");

// SKAI-1635 on an isolated local database: concurrent removals of one staff member commit once, with one
// accessVersion bump, one membership audit row and one STAFF_REMOVED notification. Owner, campus and
// tenant protections still apply.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1") throw Error("Only an isolated loopback database may be used for this test");

const db = new PrismaClient();
const tag = randomUUID().slice(0, 8);
const schoolA = `sr-a-${tag}`, schoolB = `sr-b-${tag}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const owner = randomUUID(), principalA1 = randomUUID(), teacherA2 = randomUUID(), teacherB1 = randomUUID();

function session(userId: string, schoolId: string, campusId: string, extra: Partial<AuthUser> = {}): AuthUser {
  return { userId, email: `${userId}@example.invalid`, fullName: "Synthetic actor", role: "ADMIN", schoolId, campusId, institutionKind: "STANDALONE", onboardingComplete: true, mfaVerified: true, ...extra };
}
const ownerSession = () => session(owner, schoolA, campusA1, { isInstitutionOwner: true });
const removeAs = (actor: AuthUser, userId: string) => runAsUser(actor, async () => (await loadRemoval()).removeStaffMember(actor, userId));
const statusOf = (result: PromiseSettledResult<unknown>) => (result.status === "fulfilled" ? "OK" : result.reason instanceof ApiError ? result.reason.status : String(result.reason));

const membershipAudits = (userId: string) => db.auditLog.findMany({ where: { tableName: "membership", recordId: userId } });

const notificationsFor = (staffId: string) => notified.filter(payload => payload.staffId === staffId).length;

async function makeStaff(schoolId: string, campusId: string, role: UserRole = "TEACHER", extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  await db.user.create({ data: { id, schoolId, campusId, email: `${id}@example.invalid`, fullName: `Synthetic ${role.toLowerCase()}`, role, isActive: true, onboardingComplete: true, ...extra } });
  return id;
}

before(async () => {
  for (const [id, label] of [[schoolA, "A"], [schoolB, "B"]] as const) {
    await db.school.create({ data: { id, name: `Synthetic staff school ${label}`, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  }
  for (const [id, schoolId, label] of [[campusA1, schoolA, "A1"], [campusA2, schoolA, "A2"], [campusB1, schoolB, "B1"]] as const) {
    await db.campus.create({ data: { id, schoolId, name: `Synthetic campus ${label}`, city: "Synthetic", regId: id } });
  }
  await db.user.create({ data: { id: owner, schoolId: schoolA, campusId: campusA1, email: `${owner}@example.invalid`, fullName: "Synthetic owner", role: "ADMIN", isInstitutionOwner: true, isActive: true, onboardingComplete: true } });
  await db.user.create({ data: { id: principalA1, schoolId: schoolA, campusId: campusA1, email: `${principalA1}@example.invalid`, fullName: "Synthetic principal", role: "PRINCIPAL", canManageMemberships: true, isActive: true, onboardingComplete: true } });
  await db.user.create({ data: { id: teacherA2, schoolId: schoolA, campusId: campusA2, email: `${teacherA2}@example.invalid`, fullName: "Synthetic teacher", role: "TEACHER", isActive: true, onboardingComplete: true } });
  await db.user.create({ data: { id: teacherB1, schoolId: schoolB, campusId: campusB1, email: `${teacherB1}@example.invalid`, fullName: "Synthetic teacher", role: "TEACHER", isActive: true, onboardingComplete: true } });
});

after(async () => {
  await db.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } }).catch(() => undefined);
  await db.$disconnect();
});

test("concurrent removals of the same active staff member commit once: one bump, one audit row, one notification", async () => {
  const target = await makeStaff(schoolA, campusA1);
  const results = await Promise.allSettled([removeAs(ownerSession(), target), removeAs(ownerSession(), target)]);

  assert.deepEqual(results.map(statusOf).sort(), [409, "OK"]);
  const loser = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.doesNotMatch(String(loser.reason.message), /P2025|Prisma|unique|record to update/i);

  const user = await db.user.findUniqueOrThrow({ where: { id: target } });
  assert.equal(user.isActive, false);
  assert.equal(user.accessVersion, 1, "accessVersion bumped exactly once");
  assert.equal((await membershipAudits(target)).length, 1, "one membership audit row");
  assert.equal(notificationsFor(target), 1, "one STAFF_REMOVED notification");
});

test("removal racing a role change: either the removal or the role change wins, never a lost update", async () => {
  const target = await makeStaff(schoolA, campusA1, "TEACHER");
  const [removal, roleChange] = await Promise.allSettled([
    removeAs(ownerSession(), target),
    db.user.updateMany({ where: { id: target, accessVersion: 0 }, data: { role: "PARENT", accessVersion: { increment: 1 } } }),
  ]);

  const user = await db.user.findUniqueOrThrow({ where: { id: target } });
  const removed = removal.status === "fulfilled";
  const roleChanged = roleChange.status === "fulfilled" && roleChange.value.count === 1;
  if (removed) assert.equal(user.isActive, false);
  else assert.equal(statusOf(removal), 409);
  assert.equal(user.accessVersion, (roleChanged ? 1 : 0) + (removed ? 1 : 0), "each committed write bumps accessVersion exactly once");
  assert.equal((await membershipAudits(target)).length, removed ? 1 : 0);
  assert.equal(notificationsFor(target), removed ? 1 : 0);
});

test("an inactive target is refused with a 409 and a repeat removal writes nothing", async () => {
  const inactive = await makeStaff(schoolA, campusA1, "TEACHER", { isActive: false, accessVersion: 3 });
  await assert.rejects(removeAs(ownerSession(), inactive), (error: unknown) => error instanceof ApiError && error.status === 409);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: inactive } })).accessVersion, 3);
  assert.equal((await membershipAudits(inactive)).length, 0);

  const target = await makeStaff(schoolA, campusA1);
  await removeAs(ownerSession(), target);
  await assert.rejects(removeAs(ownerSession(), target), (error: unknown) => error instanceof ApiError && error.status === 409);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: target } })).accessVersion, 1);
  assert.equal((await membershipAudits(target)).length, 1);
});

test("owner and campus protections still apply", async () => {
  const delegate = session(principalA1, schoolA, campusA1, { role: "PRINCIPAL", canManageMemberships: true });
  // The tenant guard already hides other-campus staff, so the campus check may answer 404 rather than 403.
  await assert.rejects(removeAs(delegate, teacherA2), (error: unknown) => error instanceof ApiError && [403, 404].includes(error.status), "a campus delegate cannot remove staff on another campus");
  await assert.rejects(removeAs(delegate, owner), (error: unknown) => error instanceof ApiError && error.status === 403, "the owner cannot be removed");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: teacherA2 } })).isActive, true);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).isActive, true);
  assert.equal(notified.filter(payload => payload.staffId === owner || payload.staffId === teacherA2).length, 0);
});

test("tenant isolation: a school-A administrator cannot remove school-B staff", async () => {
  await assert.rejects(removeAs(ownerSession(), teacherB1), (error: unknown) => error instanceof ApiError && error.status === 404);
  const untouched = await db.user.findUniqueOrThrow({ where: { id: teacherB1 } });
  assert.equal(untouched.isActive, true);
  assert.equal(untouched.accessVersion, 0);
  assert.equal((await membershipAudits(teacherB1)).length, 0);
});
