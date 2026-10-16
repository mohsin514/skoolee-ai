import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import {
  createLifecycleRequest, downloadExport, lifecycleOverview, placeLegalHold, previewRetention,
  releaseLegalHold, reviewLifecycleRequest, setRetentionSchedule,
} from "../../src/lib/data-lifecycle/service";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only isolated PG55438.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });

const env = { DATABASE_URL: "postgresql://u:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres", S3_BUCKET_NAME: "files", S3_REGION: "ap-south-1" };
const DAY = 86_400_000, now = new Date();

async function fixture() {
  const schoolId = `lifecycle-${randomUUID()}`, campusId = randomUUID(), otherCampus = randomUUID(), classId = randomUUID();
  schoolIds.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic lifecycle school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campusId, otherCampus]) await db.campus.create({ data: { id, schoolId, name: `Campus ${id.slice(0, 4)}`, regId: id, city: "Synthetic" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic class", academicYear: 2026 } });
  const person = async (role: AuthUser["role"], extra: Partial<AuthUser> = {}, campus: string | null = campusId): Promise<AuthUser> => {
    const userId = randomUUID(), email = `${userId}@example.invalid`;
    await db.user.create({ data: { id: userId, email, password: "x", fullName: `Synthetic ${role}`, role, schoolId, campusId: campus, isActive: true, onboardingComplete: true, isInstitutionOwner: !!extra.isInstitutionOwner } });
    return { userId, email, role, schoolId, campusId: campus, accessVersion: 0, ...extra };
  };
  const owner = await person("SUPER_ADMIN", { isInstitutionOwner: true }, null), secondAdmin = await person("SUPER_ADMIN", {}, null);
  const campusAdmin = await person("CAMPUS_ADMIN"), parent = await person("PARENT"), teacher = await person("TEACHER");
  const pupil = async (name: string) => { const id = randomUUID(); await db.student.create({ data: { id, schoolId, campusId, classId, fullName: name, rollNo: id.slice(0, 6), gender: "FEMALE", enrollmentDate: new Date("2026-09-01Z") } }); return id; };
  const child = await pupil("Synthetic child"), sibling = await pupil("Synthetic other learner");
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId: child, guardianUserId: parent.userId, createdByUserId: owner.userId, fullName: "Synthetic guardian", email: parent.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date(now.getTime() - DAY) } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: owner.userId, reason: "Synthetic lifecycle fixture", permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  await db.attendance.create({ data: { schoolId, campusId, studentId: child, classId, date: new Date("2026-10-01Z"), status: "PRESENT", markedBy: owner.userId } });
  await db.invoice.create({ data: { schoolId, campusId, studentId: child, invoiceDate: new Date("2026-10-01Z"), dueDate: new Date("2026-10-15Z"), monthlyFee: 1000, subtotal: 1000, totalAmount: 1000, balanceDue: 1000, currency: "PKR" } });
  return { schoolId, campusId, otherCampus, owner, secondAdmin, campusAdmin, parent, teacher, child, sibling };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const notifications = async (f: Fixture, ages: number[]) => {
  const ids: string[] = [];
  for (const days of ages) { const row = await db.notification.create({ data: { schoolId: f.schoolId, userId: f.owner.userId, title: "Synthetic", message: "Synthetic", type: "INFO", createdAt: new Date(now.getTime() - days * DAY) } }); ids.push(row.id); }
  return ids;
};

test("retention schedules are versioned, enforce minimums and refuse stale or direct edits", async () => {
  const f = await fixture();
  await assert.rejects(() => setRetentionSchedule(f.owner, { category: "NOTIFICATIONS", retentionDays: 7, expectedVersion: 0 }), { status: 400 });
  await assert.rejects(() => setRetentionSchedule(f.campusAdmin, { category: "NOTIFICATIONS", retentionDays: 60, expectedVersion: 0 }), { status: 403 });
  const first = await setRetentionSchedule(f.owner, { category: "NOTIFICATIONS", retentionDays: 60, expectedVersion: 0 });
  assert.equal(first.version, 1);
  await assert.rejects(() => setRetentionSchedule(f.owner, { category: "NOTIFICATIONS", retentionDays: 90, expectedVersion: 0 }), { status: 409 });
  assert.equal((await setRetentionSchedule(f.owner, { category: "NOTIFICATIONS", retentionDays: 90, expectedVersion: 1 })).version, 2);
  await assert.rejects(() => db.dataRetentionSchedule.update({ where: { id: first.id }, data: { retentionDays: 1 } }), /versioned/);
});

test("retention preview and deletion honour category and record holds, need a second admin and record a receipt", async () => {
  const f = await fixture();
  await setRetentionSchedule(f.owner, { category: "NOTIFICATIONS", retentionDays: 30, expectedVersion: 0 });
  const [oldA, oldB, oldC] = await notifications(f, [120, 90, 45]);
  const [recent] = await notifications(f, [5]);
  const recordHold = await placeLegalHold(f.owner, { category: "NOTIFICATIONS", recordId: oldB, reason: "Synthetic complaint review" });
  assert.deepEqual({ ...(await previewRetention(f.owner, "NOTIFICATIONS", now)), cutoff: "" }, { category: "NOTIFICATIONS", scheduleVersion: 1, retentionDays: 30, cutoff: "", eligible: 2, held: 1, categoryHeld: false });

  const categoryHold = await placeLegalHold(f.owner, { category: "NOTIFICATIONS", reason: "Synthetic regulator enquiry" });
  assert.equal((await previewRetention(f.owner, "NOTIFICATIONS", now)).eligible, 0);
  const request = await createLifecycleRequest(f.owner, { kind: "RETENTION_DELETION", category: "NOTIFICATIONS", reason: "Quarterly retention run" }, env, now);
  await assert.rejects(() => reviewLifecycleRequest(f.owner, { requestId: request.id, decision: "APPROVE", note: "Self approval", version: 1 }, now), { status: 403 });

  // The category hold is released after the request was raised: execution re-checks holds, so only the record hold remains.
  await assert.rejects(() => releaseLegalHold(f.owner, { holdId: categoryHold.id, reason: "" }));
  await releaseLegalHold(f.owner, { holdId: categoryHold.id, reason: "Enquiry closed in writing" });
  await assert.rejects(() => releaseLegalHold(f.owner, { holdId: categoryHold.id, reason: "Released twice" }), { status: 409 });
  await assert.rejects(() => db.dataLegalHold.delete({ where: { id: recordHold.id } }), /released, not deleted/);

  const done = await reviewLifecycleRequest(f.secondAdmin, { requestId: request.id, decision: "APPROVE", note: "Checked eligible list", version: 1 }, now);
  assert.equal(done.status, "COMPLETED");
  const receipt = done.receipt as Record<string, unknown>;
  assert.equal(receipt.deleted, 2); assert.equal(receipt.held, 1);
  assert.match(String(receipt.backups), /backups expire/);
  const left = (await db.notification.findMany({ where: { schoolId: f.schoolId }, select: { id: true } })).map(row => row.id).sort();
  assert.deepEqual(left, [oldB, recent].sort());
  assert.equal(await db.notification.count({ where: { id: { in: [oldA, oldC] } } }), 0);
  await assert.rejects(() => reviewLifecycleRequest(f.secondAdmin, { requestId: request.id, decision: "APPROVE", note: "Replay", version: 1 }, now), { status: 409 });
});

test("a guardian export covers only the linked child and the guardian's permitted sections, with restricted expiring delivery", async () => {
  const f = await fixture();
  await assert.rejects(() => createLifecycleRequest(f.parent, { kind: "EXPORT", studentId: f.sibling, reason: "Please send my records" }, env, now), { status: 404 });
  await assert.rejects(() => createLifecycleRequest(f.teacher, { kind: "EXPORT", studentId: f.child, reason: "Please send records" }, env, now), { status: 403 });
  const request = await createLifecycleRequest(f.parent, { kind: "EXPORT", studentId: f.child, reason: "Family records request" }, env, now);
  await assert.rejects(() => reviewLifecycleRequest(f.campusAdmin, { requestId: request.id, decision: "APPROVE", note: "Not an administrator", version: 1 }, now), { status: 403 });
  const done = await reviewLifecycleRequest(f.owner, { requestId: request.id, decision: "APPROVE", note: "Identity confirmed at front desk", version: 1 }, now);
  const receipt = done.receipt as { sections: Record<string, boolean>; counts: Record<string, number> };
  assert.deepEqual(receipt.sections, { learner: true, enrollments: true, attendance: true, results: true, finances: false });
  assert.equal(receipt.counts.attendance, 1); assert.equal(receipt.counts.invoices, 0);

  const stored = await db.dataLifecycleRequest.findUniqueOrThrow({ where: { id: request.id } });
  const artifact = await downloadExport(f.parent, request.id, stored.downloadToken!, now) as { learner: { id: string }; invoices: unknown[] };
  assert.equal(artifact.learner.id, f.child);
  assert.deepEqual(artifact.invoices, []);
  assert.equal(JSON.stringify(artifact).includes(f.sibling), false);
  await assert.rejects(() => downloadExport(f.owner, request.id, stored.downloadToken!, now), { status: 404 }, "only the requester");
  await assert.rejects(() => downloadExport(f.parent, request.id, "wrong-token", now), { status: 404 });
  await assert.rejects(() => downloadExport(f.parent, request.id, stored.downloadToken!, new Date(now.getTime() + 25 * 3_600_000)), { status: 410 });

  const parentView = await lifecycleOverview(f.parent, env, now);
  assert.equal(parentView.inventory, null);
  assert.deepEqual(parentView.requests.map(item => item.id), [request.id]);
  const adminView = await lifecycleOverview(f.owner, env, now);
  assert.equal(adminView.requests.find(item => item.id === request.id)!.downloadToken, null, "reviewers never see the requester's link");
});

test("placement migration requests list every service and are blocked where the core services cannot go", async () => {
  const f = await fixture();
  const blocked = await createLifecycleRequest(f.owner, { kind: "MIGRATION", targetRegion: "me-central-1", reason: "Evaluate in-country hosting" }, env, now);
  assert.equal(blocked.status, "BLOCKED");
  assert.equal((blocked.plan as { items: unknown[] }).items.length, 8);
  await assert.rejects(() => reviewLifecycleRequest(f.secondAdmin, { requestId: blocked.id, decision: "APPROVE", note: "Try anyway", version: 1 }, now), { status: 409 });
  const planned = await createLifecycleRequest(f.owner, { kind: "MIGRATION", targetRegion: "eu-central-1", reason: "Group consolidation" }, env, now);
  assert.equal(planned.status, "REQUESTED");
  const approved = await reviewLifecycleRequest(f.secondAdmin, { requestId: planned.id, decision: "APPROVE", note: "Plan reviewed", version: 1 }, now);
  assert.equal(approved.status, "APPROVED");
  assert.match(JSON.stringify(approved.receipt), /no data has moved/);
  await assert.rejects(() => createLifecycleRequest(f.campusAdmin, { kind: "MIGRATION", targetRegion: "eu-central-1", reason: "Campus attempt" }, env, now), { status: 403 });
});

test("campus administrators see only their campus export requests; database rejects self-review", async () => {
  const f = await fixture();
  const own = await createLifecycleRequest(f.campusAdmin, { kind: "EXPORT", studentId: f.child, reason: "Transfer paperwork" }, env, now);
  await createLifecycleRequest(f.owner, { kind: "RETENTION_DELETION", category: "EXPIRED_SESSIONS", reason: "Clean sessions" }, env, now).catch(() => undefined);
  const view = await lifecycleOverview(f.campusAdmin, env, now);
  assert.equal(view.inventory, null);
  assert.deepEqual(view.requests.map(item => item.id), [own.id]);
  await assert.rejects(() => db.dataLifecycleRequest.update({ where: { id: own.id }, data: { reviewedBy: f.campusAdmin.userId } }), /data_request_reviewer_separate/);
});
