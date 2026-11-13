import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// SKAI-1893 (DB-01 Phase 4a): a legacy students.parent_user_id link with no verified guardian relationship is
// queued for admin review; it never grants access by itself. A link that already has a relationship queues
// nothing, and changing the link reopens a resolved item with the new parent's details.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
const schoolId = `lp1893-${randomUUID()}`, campusId = randomUUID();
const REASON = "LEGACY_PARENT_ACCOUNT_UNLINKED";
let classId: string, adminId: string;

const parentAccount = (label: string) => db.user.create({ data: { schoolId, campusId, email: `${label}-${randomUUID()}@example.invalid`, password: "not-a-real-hash", fullName: `Synthetic ${label}`, role: "PARENT", phone: "+920000000000" } });
const pupil = (rollNo: string, parentUserId?: string) => db.student.create({ data: { schoolId, campusId, classId, fullName: `Synthetic Pupil ${rollNo}`, rollNo, gender: "MALE", enrollmentDate: new Date("2026-04-01T00:00:00Z"), guardianRelationship: "Father", ...(parentUserId ? { parentUserId } : {}) } });
const openItem = (studentId: string) => db.guardianReviewQueue.findFirst({ where: { studentId, reason: REASON, status: "OPEN" } });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Guardian School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Peshawar", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Guardian Main", regId: campusId, city: "Peshawar" } });
  classId = (await db.class.create({ data: { schoolId, campusId, name: "Three", academicYear: 2026 } })).id;
  adminId = (await db.user.create({ data: { schoolId, campusId, email: `admin-${randomUUID()}@example.invalid`, password: "not-a-real-hash", fullName: "Synthetic Admin", role: "CAMPUS_ADMIN" } })).id;
});
after(async () => {
  await db.guardianRelationship.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("an unverified parent account link is queued with the account's contact details", async () => {
  const parent = await parentAccount("parent-a");
  const student = await pupil("1", parent.id);
  const item = await openItem(student.id);
  assert.ok(item, "an OPEN review item exists");
  assert.equal(item.email, parent.email);
  assert.equal(item.contactName, parent.fullName);
  assert.equal(item.legacyRelationship, "Father");
});

test("the link grants no access: no guardian relationship is created", async () => {
  const parent = await parentAccount("parent-b");
  const student = await pupil("2", parent.id);
  assert.equal(await db.guardianRelationship.count({ where: { studentId: student.id } }), 0);
});

test("a link that already has a verified relationship queues nothing", async () => {
  const parent = await parentAccount("parent-c");
  const student = await pupil("3");
  await db.guardianRelationship.create({ data: { schoolId, campusId, studentId: student.id, guardianUserId: parent.id, createdByUserId: adminId, fullName: parent.fullName, email: parent.email, relationship: "Mother", status: "ACTIVE", verifiedAt: new Date() } });
  await db.student.update({ where: { id: student.id }, data: { parentUserId: parent.id } });
  assert.equal(await openItem(student.id), null);
});

test("changing the link reopens a resolved item with the new parent's details", async () => {
  const first = await parentAccount("parent-d"), second = await parentAccount("parent-e");
  const student = await pupil("4", first.id);
  await db.guardianReviewQueue.updateMany({ where: { studentId: student.id, reason: REASON }, data: { status: "REVIEWED", reviewedByUserId: adminId, reviewedAt: new Date() } });
  await db.student.update({ where: { id: student.id }, data: { parentUserId: second.id } });
  const item = await openItem(student.id);
  assert.equal(item?.email, second.email);
  assert.equal(item?.reviewedByUserId, null);
  assert.equal(await db.guardianReviewQueue.count({ where: { studentId: student.id, reason: REASON } }), 1, "one item per student and reason");
});
