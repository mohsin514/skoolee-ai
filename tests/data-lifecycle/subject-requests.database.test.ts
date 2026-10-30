import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import {
  createLifecycleRequest, downloadExport, reviewLifecycleRequest,
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
  const owner = await person("SUPER_ADMIN", { isInstitutionOwner: true }, null), secondAdmin = await person("SUPER_ADMIN", { institutionKind: "GROUP" }, null);
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

const request = (user: AuthUser, input: Record<string, unknown>) => createLifecycleRequest(user, input, env, now);
const approve = (user: AuthUser, id: string) => reviewLifecycleRequest(user, { requestId: id, decision: "APPROVE", note: "Identity checked", version: 1 }, now);
const audits = (f: Fixture, recordId: string) => db.auditLog.findMany({ where: { schoolId: f.schoolId, recordId } });

test("guardian access export covers that guardian's links only and is delivered to the requesting admin", async () => {
  const f = await fixture();
  const link = await db.guardianRelationship.findFirstOrThrow({ where: { schoolId: f.schoolId } });
  await assert.rejects(() => request(f.campusAdmin, { kind: "GUARDIAN_EXPORT", guardianId: link.id, reason: "Guardian asked for data" }), { status: 403 });
  const created = await request(f.owner, { kind: "GUARDIAN_EXPORT", guardianId: link.id, reason: "Guardian asked for data" });
  const done = await approve(f.secondAdmin, created.id);
  assert.equal(done.status, "COMPLETED");
  const stored = await db.dataLifecycleRequest.findUniqueOrThrow({ where: { id: created.id } });
  await assert.rejects(() => downloadExport(f.secondAdmin, created.id, stored.downloadToken!, now), { status: 404 }, "only the requester");
  const artifact = await downloadExport(f.owner, created.id, stored.downloadToken!, now) as { guardian: { email: string }; account: { email: string }; links: Array<{ student: { id: string } }> };
  assert.equal(artifact.guardian.email, f.parent.email);
  assert.equal(artifact.account.email, f.parent.email);
  assert.deepEqual(artifact.links.map(item => item.student.id), [f.child]);
  assert.equal(JSON.stringify(artifact).includes("password"), false);
  assert.ok((await audits(f, created.id)).length >= 3, "request, approval and download are audited");
});

test("corrections apply only allow-listed fields, re-check current values and audit old and new", async () => {
  const f = await fixture();
  await assert.rejects(() => request(f.owner, { kind: "CORRECTION", subject: "STUDENT", subjectId: f.child, changes: { rollNo: "X1" }, reason: "Fix roll number" }), { status: 400 });
  await assert.rejects(() => request(f.owner, { kind: "CORRECTION", subject: "STUDENT", subjectId: f.child, changes: { fullName: "" }, reason: "Blank the name" }), { status: 400 });
  const created = await request(f.owner, { kind: "CORRECTION", subject: "STUDENT", subjectId: f.child, changes: { fullName: "Synthetic corrected", city: "Synthetic city" }, reason: "Guardian reported a typo" });
  const done = await approve(f.secondAdmin, created.id);
  assert.deepEqual([...(done.receipt as { fields: string[] }).fields].sort(), ["city", "fullName"]);
  const student = await db.student.findUniqueOrThrow({ where: { id: f.child } });
  assert.equal(student.fullName, "Synthetic corrected");
  const log = (await audits(f, f.child)).find(row => row.tableName === "students")!;
  assert.deepEqual(log.oldValue, { fullName: "Synthetic child", city: null });

  const stale = await request(f.owner, { kind: "CORRECTION", subject: "STUDENT", subjectId: f.child, changes: { city: "Other city" }, reason: "Second correction" });
  await db.student.update({ where: { id: f.child }, data: { city: "Changed meanwhile" } });
  await assert.rejects(() => approve(f.secondAdmin, stale.id), { status: 409 });
});

test("deletion archives the learner and revokes guardian links without hard-deleting history", async () => {
  const f = await fixture();
  const created = await request(f.owner, { kind: "SUBJECT_DELETION", subject: "STUDENT", subjectId: f.child, reason: "Guardian erasure request" });
  await assert.rejects(() => approve(f.owner, created.id), { status: 403 }, "a second admin decides");
  const done = await approve(f.secondAdmin, created.id);
  assert.deepEqual({ action: (done.receipt as { action: string }).action, hardDeleted: (done.receipt as { hardDeleted: boolean }).hardDeleted }, { action: "ARCHIVED", hardDeleted: false });
  const student = await db.student.findUniqueOrThrow({ where: { id: f.child } });
  assert.equal(student.status, "archived"); assert.ok(student.archivedAt);
  assert.equal(await db.attendance.count({ where: { studentId: f.child } }), 1, "attendance history kept");
  assert.equal(await db.invoice.count({ where: { studentId: f.child } }), 1, "finance history kept");
  await assert.rejects(() => request(f.owner, { kind: "SUBJECT_DELETION", subject: "STUDENT", subjectId: f.child, reason: "Repeat request" }), { status: 409 });

  const link = await db.guardianRelationship.findFirstOrThrow({ where: { schoolId: f.schoolId } });
  const revoke = await request(f.owner, { kind: "SUBJECT_DELETION", subject: "GUARDIAN", subjectId: link.id, reason: "Guardian erasure request" });
  await approve(f.secondAdmin, revoke.id);
  assert.equal((await db.guardianRelationship.findUniqueOrThrow({ where: { id: link.id } })).status, "REVOKED");
  assert.ok((await audits(f, link.id)).some(row => row.tableName === "guardian_relationships"));
});

test("another school's administrators cannot request, review or download a data-subject request", async () => {
  const a = await fixture(), b = await fixture();
  const link = await db.guardianRelationship.findFirstOrThrow({ where: { schoolId: a.schoolId } });
  for (const input of [
    { kind: "GUARDIAN_EXPORT", guardianId: link.id, reason: "Cross-tenant probe" },
    { kind: "CORRECTION", subject: "STUDENT", subjectId: a.child, changes: { city: "Probe" }, reason: "Cross-tenant probe" },
    { kind: "SUBJECT_DELETION", subject: "STUDENT", subjectId: a.child, reason: "Cross-tenant probe" },
    { kind: "SUBJECT_DELETION", subject: "GUARDIAN", subjectId: link.id, reason: "Cross-tenant probe" },
  ]) await assert.rejects(() => request(b.owner, input), { status: 404 });
  const created = await request(a.owner, { kind: "GUARDIAN_EXPORT", guardianId: link.id, reason: "Guardian asked for data" });
  await assert.rejects(() => approve(b.owner, created.id), { status: 404 });
  await approve(a.secondAdmin, created.id);
  const stored = await db.dataLifecycleRequest.findUniqueOrThrow({ where: { id: created.id } });
  await assert.rejects(() => downloadExport({ ...b.owner, userId: a.owner.userId }, created.id, stored.downloadToken!, now), { status: 404 });
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: a.child } })).archivedAt, null);
});
