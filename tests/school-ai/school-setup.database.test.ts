import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { previewSchoolAiExecution, executeSchoolAiTool, listSchoolAiExecutions } from "../../src/lib/school-ai/execution";
import { getSchoolSetupOptions } from "../../src/lib/school-ai/school-setup-service";
import type { SchoolSetupProposal, SchoolSetupPreview } from "../../src/lib/school-ai/school-setup";
import { createPlanContract } from "../../src/config/commercial-contract";
import { createStaffInvitation } from "../../src/lib/staff/invitation-write";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated PG55438 only.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const schoolId = `setup-ai-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), userId = randomUUID(), studentId = randomUUID(); schoolIds.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic setup school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Setup campus", regId: campusId, city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, fullName: "Setup reviewer", email: `${userId}@example.invalid`, role: "CAMPUS_ADMIN", canManageMemberships: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", academicYear: 2026 } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic learner", rollNo: "1", gender: "OTHER", enrollmentDate: new Date("2026-01-01Z") } });
  const user: AuthUser = { userId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid`, accessVersion: 0 };
  return { schoolId, campusId, classId, studentId, user };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function school(run: (f: Fixture) => Promise<void>) { const f = await fixture(); try { await run(f); } finally { await db.school.delete({ where: { id: f.schoolId } }); } }
const base = { operation: "setup.apply_changes" as const, sourceReference: "Verified school register page 1" };
const rooms: SchoolSetupProposal = { ...base, action: "ROOMS", rows: [{ roomNumber: "Room A", roomType: "CLASSROOM", rows: 4, benchesPerRow: 5, seatsPerBench: 2, examSeatsPerBench: 1, building: "Main" }] };
const staff = (email = "teacher@example.invalid"): SchoolSetupProposal => ({ ...base, action: "STAFF", rows: [{ fullName: "Reviewed teacher", email, phone: "", role: "TEACHER" }] });
const guardian = (f: Fixture): SchoolSetupProposal => ({ ...base, action: "GUARDIANS", rows: [{ studentId: f.studentId, fullName: "Reviewed parent", email: "parent@example.invalid", phone: "", relationship: "mother", effectiveFrom: "2026-10-13", learningRecords: true, attendance: true, finances: false, communication: true, pickup: false, medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false }] });
async function approved(f: Fixture, proposal: SchoolSetupProposal) { const record = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", campusId: f.campusId, title: proposal.action, idempotencyKey: randomUUID(), data: { goal: "Reviewed setup", steps: [{ id: "setup", title: "Review exact changes", status: "ready", module: proposal.action === "STAFF" ? "staff" : proposal.action === "GUARDIANS" ? "students" : "timetable" }], sourceIds: [], missingInformation: [], proposal } }); return updateWorkspaceRecord(f.user, record.id, { action: "approve", version: record.version }); }
const input = (p: SchoolSetupPreview) => ({ operation: "setup.apply_changes" as const, version: p.version, previewHash: p.previewHash, idempotencyKey: randomUUID() });
async function execute(f: Fixture, proposal: SchoolSetupProposal) { const record = await approved(f, proposal), preview = await previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), request = input(preview), receipt = await executeSchoolAiTool(f.user, record.id, request); return { record, preview, request, receipt }; }
test("reviewed rooms preserve geometry and replay creates once; later imports keep exact matches", () => school(async f => {
  const result = await execute(f, rooms); assert.deepEqual(await executeSchoolAiTool(f.user, result.record.id, result.request), result.receipt); assert.equal(result.receipt.createdCount, 1); assert.equal(result.preview.rows[0].examCapacity, 20);
  const room = await db.classRoom.findFirstOrThrow({ where: { schoolId: f.schoolId } }); assert.equal(room.capacity, 40); assert.equal(room.examSeatsPerBench, 1);
  const second = await execute(f, rooms); assert.equal(second.receipt.keptCount, 1); assert.equal(await db.classRoom.count({ where: { schoolId: f.schoolId } }), 1);
  await db.classRoom.update({ where: { id: room.id }, data: { rows: 3 } }); const conflict = await approved(f, rooms); await assert.rejects(() => previewSchoolAiExecution(f.user, conflict.id, "setup.apply_changes", conflict.version), { code: "SETUP_EXISTING_CONFLICT" });
}));
test("period imports create usable rows and refuse overlap with school periods", () => school(async f => {
  const p: SchoolSetupProposal = { ...base, action: "PERIODS", rows: [{ timeType: "CLASS", periodNumber: 1, startTime: "08:00", endTime: "09:00" }, { timeType: "EXAM", periodNumber: 1, startTime: "08:00", endTime: "10:00" }] };
  await execute(f, p); assert.equal(await db.periodDefinition.count({ where: { schoolId: f.schoolId } }), 2);
  const record = await approved(f, { ...p, rows: [{ timeType: "CLASS", periodNumber: 2, startTime: "08:30", endTime: "09:30" }] }); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), { code: "SETUP_PERIOD_CONFLICT" });
}));
test("staff setup creates pending invitations without active accounts or message delivery", () => school(async f => {
  const result = await execute(f, staff()); assert.equal(result.receipt.nextStep, "STAFF_DELIVERY"); const invite = await db.staffInvitation.findFirstOrThrow({ where: { schoolId: f.schoolId } }); assert.equal(invite.status, "pending"); assert.equal(invite.deliveryStatus, "pending"); assert.equal(invite.canManageMemberships, false); assert.equal(await db.user.count({ where: { schoolId: f.schoolId } }), 1); assert.equal(await db.parentCommunication.count({ where: { schoolId: f.schoolId } }), 0); assert.ok(!JSON.stringify(result.receipt).includes(invite.token));
  assert.equal((await execute(f, staff())).receipt.keptCount, 1);
  await db.user.update({ where: { id: f.user.userId }, data: { canManageMemberships: false } }); const record = await approved(f, staff("next@example.invalid")); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), { code: "SETUP_MEMBERSHIP_REQUIRED" });
}));
test("staff identities in another campus cannot be silently moved or duplicated", () => school(async f => {
  const campusId = randomUUID(); await db.campus.create({ data: { id: campusId, schoolId: f.schoolId, name: "Other campus", regId: campusId, city: "Test" } }); await db.user.create({ data: { schoolId: f.schoolId, campusId, fullName: "Reviewed teacher", email: "teacher@example.invalid", role: "TEACHER" } }); const record = await approved(f, staff()); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), { code: "SETUP_IDENTITY_CONFLICT" });
}));
test("concurrent staff plans cannot create duplicate invitations", () => school(async f => {
  const records = await Promise.all([approved(f, staff()), approved(f, staff())]), previews = await Promise.all(records.map(record => previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version)));
  const results = await Promise.allSettled(records.map((record, index) => executeSchoolAiTool(f.user, record.id, input(previews[index])))); assert.equal(results.filter(item => item.status === "fulfilled").length, 1); assert.equal(await db.staffInvitation.count({ where: { schoolId: f.schoolId } }), 1);
}));
test("teacher allowance includes pending invitations on other campuses", () => school(async f => {
  await db.school.update({ where: { id: f.schoolId }, data: { commercialContract: JSON.parse(JSON.stringify(createPlanContract("PRO", { maxTeachers: 1 }))) } });
  const campusId = randomUUID(); await db.campus.create({ data: { id: campusId, schoolId: f.schoolId, name: "Other campus", regId: campusId, city: "Test" } }); await db.staffInvitation.create({ data: { schoolId: f.schoolId, campusId, email: "other-campus@example.invalid", role: "TEACHER", token: randomUUID(), expiresAt: new Date(Date.now() + 86400000), invitedBy: "Test" } });
  const record = await approved(f, staff()); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), { code: "SETUP_TEACHER_LIMIT" });
}));
test("manual invitation and reviewed setup share identity and capacity locking", () => school(async f => {
  const proposal = staff(), record = await approved(f, proposal), preview = await previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version);
  const results = await Promise.allSettled([executeSchoolAiTool(f.user, record.id, input(preview)), createStaffInvitation(f.user, { campusId: f.campusId, email: "teacher@example.invalid", role: "TEACHER", profile: { fullName: "Reviewed teacher", phone: "" } })]);
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1); assert.equal(await db.staffInvitation.count({ where: { schoolId: f.schoolId } }), 1); assert.equal(await db.user.count({ where: { schoolId: f.schoolId } }), 1);
  await db.school.update({ where: { id: f.schoolId }, data: { commercialContract: JSON.parse(JSON.stringify(createPlanContract("PRO", { maxTeachers: 1 }))) } });
  await assert.rejects(() => createStaffInvitation(f.user, { campusId: f.campusId, email: "next@example.invalid", role: "TEACHER" }), { status: 409 });
  await db.user.update({ where: { id: f.user.userId }, data: { canManageMemberships: false } }); await assert.rejects(() => createStaffInvitation(f.user, { campusId: f.campusId, email: "next@example.invalid", role: "LIBRARIAN" }), { status: 403 });
}));
test("guardian setup stores explicit rights and requires acceptance without linking an email account", () => school(async f => {
  const result = await execute(f, guardian(f)); assert.equal(result.receipt.nextStep, "GUARDIAN_ACCEPTANCE"); const relation = await db.guardianRelationship.findFirstOrThrow({ where: { schoolId: f.schoolId }, include: { accessVersions: true } }); assert.equal(relation.status, "INVITED"); assert.equal(relation.guardianUserId, null); assert.equal(relation.verifiedAt, null); assert.deepEqual(relation.accessVersions[0].permissions, { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false, consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false } });
  assert.equal((await execute(f, guardian(f))).receipt.keptCount, 1); assert.equal(await db.guardianAccessEvent.count({ where: { schoolId: f.schoolId } }), 1);
}));
test("stale preview and unavailable student prevent guardian writes", () => school(async f => {
  const record = await approved(f, guardian(f)), preview = await previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version); await db.student.update({ where: { id: f.studentId }, data: { fullName: "Changed student name" } }); await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(preview)), { code: "STALE_EXECUTION_PREVIEW" }); assert.equal(await db.guardianRelationship.count({ where: { schoolId: f.schoolId } }), 0);
  await db.student.update({ where: { id: f.studentId }, data: { archivedAt: new Date() } }); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), { code: "SETUP_STUDENT_UNAVAILABLE" });
}));
test("existing guardian phone changes and expired invitations require explicit resolution", () => school(async f => {
  await execute(f, guardian(f)); const relation = await db.guardianRelationship.findFirstOrThrow({ where: { schoolId: f.schoolId } });
  const record = await approved(f, guardian(f)); await db.guardianRelationship.update({ where: { id: relation.id }, data: { phone: "123456789" } }); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), { code: "SETUP_IDENTITY_CONFLICT" });
  await db.guardianRelationship.update({ where: { id: relation.id }, data: { phone: null, invitationExpiresAt: new Date("2020-01-01Z") } }); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), { code: "SETUP_IDENTITY_CONFLICT" });
}));
test("current grants and campus separation protect options, apply replay and history", () => school(async f => {
  const result = await execute(f, rooms); await assert.rejects(() => getSchoolSetupOptions(f.user, randomUUID()), { status: 403 });
  for (const moduleName of ["ai", "timetable", "staff", "students"]) { const grant = await db.rolePermission.create({ data: { schoolId: f.schoolId, role: f.user.role, module: moduleName, canView: false, canAdd: true, canEdit: true } }); try { await assert.rejects(() => getSchoolSetupOptions(f.user, f.campusId), { status: 403 }); await assert.rejects(() => executeSchoolAiTool(f.user, result.record.id, result.request), { status: 403 }); await assert.rejects(() => listSchoolAiExecutions(f.user, result.record.id), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); } }
}));
