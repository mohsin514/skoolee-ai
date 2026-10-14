import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { previewSchoolAiExecution, executeSchoolAiTool, listSchoolAiExecutions } from "../../src/lib/school-ai/execution";

import type { SchoolSetupProposal, SchoolSetupPreview } from "../../src/lib/school-ai/school-setup";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated PG55438 only.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const schoolId = `setup-lifecycle-ai-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), userId = randomUUID(), studentId = randomUUID(); schoolIds.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic setup school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Setup campus", regId: campusId, city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, fullName: "Setup reviewer", email: `${userId}@example.invalid`, role: "CAMPUS_ADMIN", canManageMemberships: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", academicYear: 2026 } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE", startDate: new Date("2026-01-01Z"), endDate: new Date("2026-12-31Z") } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic learner", rollNo: "1", gender: "OTHER", enrollmentDate: new Date("2026-01-01Z") } });
  const user: AuthUser = { userId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid`, accessVersion: 0 };
  return { schoolId, campusId, classId, studentId, user };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function school(run: (f: Fixture) => Promise<void>) { const f = await fixture(); try { await run(f); } finally { await db.school.delete({ where: { id: f.schoolId } }); } }
const base = { operation: "setup.apply_changes" as const, sourceReference: "Verified school register page 1" };
const rooms: SchoolSetupProposal = { ...base, action: "ROOMS", rows: [{ roomNumber: "Room A", roomType: "CLASSROOM", rows: 4, benchesPerRow: 5, seatsPerBench: 2, examSeatsPerBench: 1, building: "Main" }] };
async function approved(f: Fixture, proposal: SchoolSetupProposal) { const record = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", campusId: f.campusId, title: proposal.action, idempotencyKey: randomUUID(), data: { goal: "Reviewed setup", steps: [{ id: "setup", title: "Review exact changes", status: "ready", module: proposal.action === "STAFF" ? "staff" : proposal.action === "GUARDIANS" ? "students" : "timetable" }], sourceIds: [], missingInformation: [], proposal } }); return updateWorkspaceRecord(f.user, record.id, { action: "approve", version: record.version }); }
const input = (p: SchoolSetupPreview) => ({ operation: "setup.apply_changes" as const, version: p.version, previewHash: p.previewHash, idempotencyKey: randomUUID() });
async function execute(f: Fixture, proposal: SchoolSetupProposal) { const record = await approved(f, proposal), preview = await previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), request = input(preview), receipt = await executeSchoolAiTool(f.user, record.id, request); return { record, preview, request, receipt }; }
async function historicalInvoice(f: Fixture) { return db.invoice.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId: f.studentId, invoiceDate: new Date("2026-10-01Z"), dueDate: new Date("2026-10-15Z"), monthlyFee: 10000, subtotal: 10000, totalAmount: 10000, balanceDue: 10000, currency: "PKR" } }); }
async function targetClass(f: Fixture) { return db.class.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Grade 8 B", academicYear: 2026 } }); }
const transfer = (f: Fixture, targetClassId: string): SchoolSetupProposal => ({ ...base, action: "TRANSFERS", rows: [{ studentId: f.studentId, targetClassId, effectiveFrom: "2026-10-13", rollNo: "2", verifiedCapacity: 30 }] });
test("reviewed transfer creates a new enrollment while original invoices retain their source period", () => school(async f => {
  const invoice = await historicalInvoice(f), target = await targetClass(f), result = await execute(f, transfer(f, target.id)); assert.equal(result.receipt.nextStep, "ENROLLMENT_UPDATED"); assert.equal(result.preview.rows[0].preserved?.invoices, 1);
  const pupil = await db.student.findUniqueOrThrow({ where: { id: f.studentId } }); assert.equal(pupil.classId, target.id); assert.equal(pupil.rollNo, "2"); assert.deepEqual(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }), invoice);
  const periods = await db.studentEnrollment.findMany({ where: { studentId: f.studentId }, orderBy: { startDate: "asc" } }); assert.equal(periods.length, 2); assert.equal(periods[0].endDate?.toISOString().slice(0, 10), "2026-10-13"); assert.equal(periods[1].status, "ACTIVE"); assert.equal((await executeSchoolAiTool(f.user, result.record.id, result.request)).id, result.receipt.id);
}));
test("transfer refuses capacity, duplicate roll numbers, later evidence and foreign campuses", () => school(async f => {
  const target = await targetClass(f); await db.student.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: target.id, fullName: "Existing target pupil", rollNo: "2", gender: "OTHER", enrollmentDate: new Date("2026-01-01Z") } });
  const p = transfer(f, target.id); if (p.action !== "TRANSFERS") throw new Error();
  const capacity = await approved(f, { ...p, rows: [{ ...p.rows[0], verifiedCapacity: 1 }] }); await assert.rejects(() => previewSchoolAiExecution(f.user, capacity.id, "setup.apply_changes", capacity.version), { code: "SETUP_TRANSFER_CAPACITY" });
  const duplicate = await approved(f, p); await assert.rejects(() => previewSchoolAiExecution(f.user, duplicate.id, "setup.apply_changes", duplicate.version), { code: "SETUP_ROLL_CONFLICT" });
  await historicalInvoice(f); const dated = await approved(f, { ...p, rows: [{ ...p.rows[0], rollNo: "3", effectiveFrom: "2026-09-30" }] }); await assert.rejects(() => previewSchoolAiExecution(f.user, dated.id, "setup.apply_changes", dated.version), { status: 409 });
  const other = randomUUID(); await db.campus.create({ data: { id: other, schoolId: f.schoolId, name: "Other", city: "Test", regId: other } }); const foreign = await db.class.create({ data: { schoolId: f.schoolId, campusId: other, name: "Foreign class", academicYear: 2026 } }); const scoped = await approved(f, transfer(f, foreign.id)); await assert.rejects(() => previewSchoolAiExecution(f.user, scoped.id, "setup.apply_changes", scoped.version), { status: 409 });
}));
test("withdrawal closes enrollment and pupil login while preserving historical invoices and guardian links", () => school(async f => {
  const invoice = await historicalInvoice(f), login = await db.user.create({ data: { schoolId: f.schoolId, campusId: f.campusId, role: "STUDENT", fullName: "Pupil login", email: "pupil@example.invalid" } }); await db.student.update({ where: { id: f.studentId }, data: { studentUserId: login.id } }); const session = await db.loginSession.create({ data: { schoolId: f.schoolId, userId: login.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000), isActive: true } });
  const relation = await db.guardianRelationship.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId: f.studentId, createdByUserId: f.user.userId, fullName: "Parent", email: "parent@example.invalid", relationship: "mother", status: "ACTIVE" } });
  const result = await execute(f, { ...base, action: "WITHDRAWALS", rows: [{ studentId: f.studentId, effectiveFrom: "2026-10-13" }] }); assert.equal(result.receipt.rows[0].disposition, "WITHDRAW"); assert.equal((await db.user.findUniqueOrThrow({ where: { id: login.id } })).isActive, false); assert.equal((await db.loginSession.findUniqueOrThrow({ where: { id: session.id } })).isActive, false); assert.equal((await db.student.findUniqueOrThrow({ where: { id: f.studentId } })).status, "archived"); assert.deepEqual(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }), invoice); assert.deepEqual(await db.guardianRelationship.findUniqueOrThrow({ where: { id: relation.id } }), relation);
}));
test("withdrawal refuses a boundary before existing sources and stale previews", () => school(async f => {
  await historicalInvoice(f); const p: SchoolSetupProposal = { ...base, action: "WITHDRAWALS", rows: [{ studentId: f.studentId, effectiveFrom: "2026-09-30" }] }, denied = await approved(f, p); await assert.rejects(() => previewSchoolAiExecution(f.user, denied.id, "setup.apply_changes", denied.version), { status: 409 });
  const record = await approved(f, { ...p, rows: [{ studentId: f.studentId, effectiveFrom: "2026-10-13" }] }), preview = await previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version); await db.student.update({ where: { id: f.studentId }, data: { fullName: "Changed identity" } }); await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(preview)), { code: "STALE_EXECUTION_PREVIEW" }); assert.equal((await db.student.findUniqueOrThrow({ where: { id: f.studentId } })).status, "active");
}));
async function manifest(f: Fixture): Promise<Extract<SchoolSetupProposal, { action: "MIGRATION_CUTOVER" }>> {
  const source = await createWorkspaceRecord(f.user, { kind: "SOURCE", title: "Signed legacy totals", campusId: f.campusId, idempotencyKey: randomUUID(), data: { extractedText: "Signed source totals: one active pupil and one active member of staff, no pending staff invitations, guardian relationships, rooms or periods. Financial totals require separate checks.", documentKind: "other", fileName: "totals.txt", mimeType: "text/plain", origin: "manual" } }); const approvedSource = await updateWorkspaceRecord(f.user, source.id, { action: "approve", version: source.version });
  return { ...base, action: "MIGRATION_CUTOVER", sourceIds: [approvedSource.id], rows: [{ dataset: "STUDENTS", expectedCount: 1 }, { dataset: "STAFF_ACTIVE", expectedCount: 1 }, { dataset: "STAFF_PENDING", expectedCount: 0 }, { dataset: "GUARDIANS", expectedCount: 0 }, { dataset: "ROOMS", expectedCount: 0 }, { dataset: "PERIODS", expectedCount: 0 }] };
}
test("cutover requires matching people/resource totals and pins approved source versions without copying data", () => school(async f => {
  const p = await manifest(f), result = await execute(f, p); assert.equal(result.receipt.nextStep, "MIGRATION_ACCEPTED"); assert.ok(result.receipt.rows.every(row => row.reconciliation?.matches)); assert.equal(result.receipt.provenance?.sources[0].id, p.sourceIds[0]); assert.equal(result.receipt.provenance?.sources[0].version, 2); assert.equal(await db.invoice.count({ where: { schoolId: f.schoolId } }), 0); assert.equal(await db.ledgerEntry.count({ where: { schoolId: f.schoolId } }), 0);
  const record = await approved(f, { ...p, rows: p.rows.map(row => row.dataset === "STUDENTS" ? { ...row, expectedCount: 2 } : row) }), preview = await previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version); assert.equal(preview.rows[0].reconciliation?.matches, false); await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(preview)), { code: "SETUP_MIGRATION_MISMATCH" });
}));
test("cutover cannot omit financial currency or opening year and preserves exact signed balances", () => school(async f => {
  const p = await manifest(f), invoice = await historicalInvoice(f); await db.feeCarryForward.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId: f.studentId, fromAcademicYear: 2026, toAcademicYear: 2027, currency: "PKR", balance: -500 } });
  const omitted = await approved(f, p); await assert.rejects(() => previewSchoolAiExecution(f.user, omitted.id, "setup.apply_changes", omitted.version), { code: "SETUP_MIGRATION_COVERAGE" });
  const result = await execute(f, { ...p, rows: [...p.rows, { dataset: "INVOICES_OPEN", currency: "PKR", expectedCount: 1, expectedBalance: 10000 }, { dataset: "OPENING_BALANCES", currency: "PKR", academicYear: 2027, expectedCount: 1, expectedBalance: -500 }] }); assert.ok(result.receipt.rows.every(row => row.reconciliation?.matches)); assert.deepEqual(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }), invoice); assert.equal(await db.feeCarryForward.count({ where: { schoolId: f.schoolId } }), 1);
}));
test("cutover rejects revoked sources and financial access even after record changes to a nonfinancial action", () => school(async f => {
  const p = await manifest(f), result = await execute(f, p); await updateWorkspaceRecord(f.user, result.record.id, { action: "save", version: result.record.version, data: { ...result.record.data, proposal: rooms } });
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: f.user.role, module: "accounts", canView: false, canAdd: true, canEdit: true } }); await assert.rejects(() => executeSchoolAiTool(f.user, result.record.id, result.request), { status: 403 }); assert.deepEqual(await listSchoolAiExecutions(f.user, result.record.id), []);
  await db.rolePermission.deleteMany({ where: { schoolId: f.schoolId, module: "accounts" } }); const record = await approved(f, p); await db.schoolAiRecord.update({ where: { id: p.sourceIds[0] }, data: { status: "ARCHIVED" } }); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version), { code: "SETUP_MIGRATION_SOURCES" });
}));
