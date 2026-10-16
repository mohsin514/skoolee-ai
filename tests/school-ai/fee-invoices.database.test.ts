import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { previewSchoolAiExecution, executeSchoolAiTool, listSchoolAiExecutions } from "../../src/lib/school-ai/execution";
import { getFeeInvoiceOptions } from "../../src/lib/school-ai/fee-invoices-service";
import { existingMonthlyStudentInvoices, invoiceGenerationTransaction } from "../../src/lib/fees/invoice-generation";
import type { FeeInvoicePreview, FeeInvoiceProposal } from "../../src/lib/school-ai/fee-invoices";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated PostgreSQL fixture on port 55438.");
const db = new PrismaClient(), createdSchools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: createdSchools } } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const schoolId = `fee-ai-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), userId = randomUUID(), studentId = randomUUID();
  createdSchools.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic fee school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, fullName: "Fee reviewer", email: `${userId}@example.invalid`, role: "CAMPUS_ADMIN" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "A", academicYear: 2026 } });
  const cycle = await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026 cycle", status: "ACTIVE", startDate: new Date("2026-01-01Z"), endDate: new Date("2027-03-31Z") } });
  const category = await db.studentCategory.create({ data: { schoolId, campusId, name: "Synthetic category" } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, categoryId: category.id, fullName: "Synthetic learner", rollNo: "1", gender: "OTHER", enrollmentDate: new Date("2026-01-01Z") } });
  const group = await db.feeGroup.create({ data: { schoolId, campusId, name: "Reviewed fees", currency: "PKR" } });
  const monthlyType = await db.feeType.create({ data: { schoolId, campusId, name: "Tuition", code: "MONTHLY_TUITION" } });
  const bookType = await db.feeType.create({ data: { schoolId, campusId, name: "Books", code: "BOOKS" } });
  const monthly = await db.feesMasterLine.create({ data: { schoolId, campusId, feeGroupId: group.id, feeTypeId: monthlyType.id, amount: 10001 } });
  const books = await db.feesMasterLine.create({ data: { schoolId, campusId, feeGroupId: group.id, feeTypeId: bookType.id, amount: 999, dueDate: new Date("2026-10-15Z") } });
  await db.feeGroupAssignment.create({ data: { schoolId, campusId, classId, feeGroupId: group.id, academicYear: 2026 } });
  const flat = await db.feeDiscount.create({ data: { schoolId, campusId, name: "Category allowance", code: "FLAT", type: "FLAT", value: 1000, currency: "PKR", categoryId: category.id } });
  const percent = await db.feeDiscount.create({ data: { schoolId, campusId, name: "Assigned allowance", code: "PERCENT", type: "PERCENT", value: 15 } });
  await db.feeDiscountAssignment.createMany({ data: [flat, percent].map(discount => ({ schoolId, studentId, discountId: discount.id })) });
  const user: AuthUser = { userId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid`, accessVersion: 0 };
  const proposal: FeeInvoiceProposal = { operation: "fees.generate_invoices", classId, academicYear: 2026, feeGroupId: group.id, feeLineIds: [monthly.id, books.id], studentIds: [studentId], billingMonth: "2026-10", dueDate: "2026-10-31" };
  return { schoolId, campusId, classId, user, studentId, category, group, monthly, books, flat, percent, cycle, proposal };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function school(run: (f: Fixture) => Promise<void>) { const f = await fixture(); try { await run(f); } finally { await db.school.delete({ where: { id: f.schoolId } }); } }
async function approved(f: Fixture, proposal = f.proposal, user = f.user) {
  const record = await createWorkspaceRecord(user, { kind: "WORKFLOW", campusId: f.campusId, title: "Reviewed fee invoices", idempotencyKey: randomUUID(), data: { goal: "Create pending fee invoices", steps: [{ id: "invoices", title: "Review invoice amounts", status: "ready", module: "fees" }], missingInformation: [], sourceIds: [], proposal } });
  return updateWorkspaceRecord(user, record.id, { action: "approve", version: record.version });
}
const input = (preview: FeeInvoicePreview, key: string = randomUUID()) => ({ operation: "fees.generate_invoices" as const, version: preview.version, previewHash: preview.previewHash, idempotencyKey: key });
const preview = (f: Fixture, record: Awaited<ReturnType<typeof approved>>, user = f.user) => previewSchoolAiExecution(user, record.id, "fees.generate_invoices", record.version);
async function legacyInvoice(f: Fixture, studentId: string = f.studentId, status: "PENDING" | "CANCELLED" = "PENDING") { return db.invoice.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId, invoiceDate: new Date("2026-10-01Z"), dueDate: new Date("2026-10-31Z"), monthlyFee: 500, subtotal: 500, totalAmount: 500, balanceDue: 500, status } }); }

test("exact approved fee preview creates reconciled pending invoices, one receipt and no payments, postings or messages", () => school(async f => {
  const record = await approved(f), p = await preview(f, record);
  assert.equal(p.totalAmount, 8500); assert.equal(p.students[0].discounts.length, 2); assert.equal(p.createdCount, 1); assert.deepEqual(p.blockers, []);
  const request = input(p), receipt = await executeSchoolAiTool(f.user, record.id, request);
  assert.deepEqual(await executeSchoolAiTool(f.user, record.id, request), receipt);
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: receipt.invoiceIds[0] } });
  assert.equal(invoice.monthlyFee, 10001); assert.equal(invoice.oneTimeFees, 999); assert.equal(invoice.discountAmount, 2500); assert.equal(invoice.totalAmount, 8500); assert.equal(invoice.balanceDue, 8500); assert.equal(invoice.totalAmountPaid, 0); assert.equal(invoice.status, "PENDING"); assert.equal(invoice.enrollmentId, p.students[0].enrollmentId);
  assert.equal(await db.payment.count({ where: { schoolId: f.schoolId } }), 0); assert.equal(await db.ledgerEntry.count({ where: { schoolId: f.schoolId } }), 0); assert.equal(await db.parentCommunication.count({ where: { schoolId: f.schoolId } }), 0);
  assert.equal(await db.auditLog.count({ where: { schoolId: f.schoolId, tableName: "invoices", recordId: invoice.id } }), 1);
}));
test("mid-month admissions and a mid-month active cycle start produce explicit eligible dates", () => school(async f => {
  const learner = await db.student.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, fullName: "Mid-month admission", rollNo: "2", gender: "OTHER", enrollmentDate: new Date("2026-10-13Z") } });
  await db.academicCycle.update({ where: { id: f.cycle.id }, data: { startDate: new Date("2026-10-15Z") } });
  const record = await approved(f, { ...f.proposal, studentIds: [learner.id] }), p = await preview(f, record);
  assert.equal(p.students[0].invoiceDate, "2026-10-15");
  const receipt = await executeSchoolAiTool(f.user, record.id, input(p));
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: receipt.invoiceIds[0] } })).invoiceDate.toISOString(), "2026-10-15T00:00:00.000Z");
}));
test("unavailable students, missing current placement, old bills including cancellation, credits and zero balances are explicit exclusions", () => school(async f => {
  const ids: string[] = [];
  for (let index = 0; index < 6; index++) { const student = await db.student.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, fullName: `Excluded ${index}`, rollNo: `${index + 2}`, gender: "OTHER", enrollmentDate: new Date(index === 1 ? "2026-11-01Z" : "2026-01-01Z"), ...(index === 0 ? { archivedAt: new Date() } : {}) } }); ids.push(student.id); }
  await legacyInvoice(f, ids[2], "CANCELLED");
  await db.feeCarryForward.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId: ids[3], fromAcademicYear: 2025, toAcademicYear: 2026, balance: -20 } });
  const free = await db.feeDiscount.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Full discount", code: "FULL", type: "PERCENT", value: 100 } });
  const usd = await db.feeDiscount.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Wrong currency", code: "USD", type: "FLAT", value: 1, currency: "USD" } });
  await db.feeDiscountAssignment.createMany({ data: [{ schoolId: f.schoolId, studentId: ids[4], discountId: free.id }, { schoolId: f.schoolId, studentId: ids[5], discountId: usd.id }] });
  const record = await approved(f, { ...f.proposal, studentIds: ids }), p = await preview(f, record);
  assert.deepEqual(ids.map(id => p.students.find(row => row.studentId === id)?.reason), ["FEE_STUDENT_UNAVAILABLE", "FEE_ENROLLMENT_REVIEW", "FEE_ALREADY_INVOICED", "FEE_CARRY_FORWARD_REVIEW", "FEE_ZERO_BALANCE", "FEE_CURRENCY_CONFLICT"]);
  assert.deepEqual(p.blockers, ["FEE_EMPTY_BATCH"]); await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(p)), { code: "FEE_EMPTY_BATCH" });
  assert.equal(await db.invoice.count({ where: { schoolId: f.schoolId } }), 1);
  const mixed = await approved(f, { ...f.proposal, studentIds: [...ids, f.studentId] }), mixedPreview = await preview(f, mixed);
  const receipt = await executeSchoolAiTool(f.user, mixed.id, input(mixedPreview)); assert.equal(receipt.createdCount, 1); assert.equal(receipt.skippedCount, 6); assert.equal(receipt.students.filter(row => row.invoiceId).length, 1); assert.equal(await db.invoice.count({ where: { schoolId: f.schoolId } }), 2);
}));
test("price, discount and enrollment changes invalidate the exact preview and create nothing", () => school(async f => {
  const record = await approved(f); let p = await preview(f, record);
  await db.feesMasterLine.update({ where: { id: f.monthly.id }, data: { amount: 10002 } });
  await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(p)), { code: "STALE_EXECUTION_PREVIEW" });
  p = await preview(f, record); await db.feeDiscount.update({ where: { id: f.percent.id }, data: { value: 20 } });
  await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(p)), { code: "STALE_EXECUTION_PREVIEW" });
  p = await preview(f, record); await db.studentEnrollment.update({ where: { id: p.students[0].enrollmentId! }, data: { endDate: new Date("2026-10-31Z"), status: "WITHDRAWN" } });
  await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(p)), { code: "STALE_EXECUTION_PREVIEW" });
  assert.equal(await db.invoice.count({ where: { schoolId: f.schoolId } }), 0);
}));
test("dated lines and inactive cycles block, while calendar-year turnover uses the selected academic year", () => school(async f => {
  const january = await approved(f, { ...f.proposal, billingMonth: "2027-01", dueDate: "2027-01-31", feeLineIds: [f.monthly.id] });
  assert.equal((await preview(f, january)).createdCount, 1);
  const wrongLines = await approved(f, { ...f.proposal, billingMonth: "2027-01", dueDate: "2027-01-31" });
  await assert.rejects(() => preview(f, wrongLines), { code: "FEE_LINE_PERIOD" });
  await db.academicCycle.update({ where: { id: f.cycle.id }, data: { status: "ENDED" } });
  await assert.rejects(() => preview(f, january), { code: "FEE_CYCLE_SCOPE" });
}));
test("same approved version has one effect under concurrent requests and conflicting reuse of its key fails", () => school(async f => {
  const record = await approved(f), p = await preview(f, record), key = randomUUID();
  const receipts = await Promise.all([executeSchoolAiTool(f.user, record.id, input(p, key)), executeSchoolAiTool(f.user, record.id, input(p)), executeSchoolAiTool(f.user, record.id, input(p))]);
  assert.equal(new Set(receipts.map(item => item.id)).size, 1); assert.equal(await db.invoice.count({ where: { schoolId: f.schoolId } }), 1);
  const stored = await db.schoolAiExecution.findUniqueOrThrow({ where: { id: receipts[0].id } });
  await assert.rejects(() => executeSchoolAiTool(f.user, record.id, { ...input(p, stored.idempotencyKey), previewHash: "a".repeat(64) }), { code: "EXECUTION_KEY_CONFLICT" });
}));
test("two independent approved plans for the same month serialize and cannot double bill", () => school(async f => {
  const records = await Promise.all([approved(f), approved(f)]), previews = await Promise.all(records.map(record => preview(f, record)));
  const results = await Promise.allSettled(records.map((record, index) => executeSchoolAiTool(f.user, record.id, input(previews[index]))));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1); const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult; assert.equal(rejected.reason.code, "STALE_EXECUTION_PREVIEW");
  assert.equal(await db.invoice.count({ where: { schoolId: f.schoolId } }), 1);
}));
test("legacy invoice generation and approved AI execution share a campus fence and cannot double bill", () => school(async f => {
  const record = await approved(f), p = await preview(f, record);
  const legacy = () => invoiceGenerationTransaction(f.user, f.campusId, async tx => { const existing = await tx.invoice.findFirst({ where: { schoolId: f.schoolId, campusId: f.campusId, studentId: f.studentId, invoiceDate: { gte: new Date("2026-10-01Z"), lt: new Date("2026-11-01Z") } } }); if (existing) return existing.id; return (await tx.invoice.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId: f.studentId, invoiceDate: new Date("2026-10-01Z"), dueDate: new Date("2026-10-31Z"), monthlyFee: 500, subtotal: 500, totalAmount: 500, balanceDue: 500 } })).id; });
  const results = await Promise.allSettled([legacy(), executeSchoolAiTool(f.user, record.id, input(p))]);
  for (const result of results) if (result.status === "rejected") assert.equal(result.reason.code, "STALE_EXECUTION_PREVIEW");
  assert.equal(await db.invoice.count({ where: { schoolId: f.schoolId } }), 1);
}));
test("current fees and AI grants protect choices, previews and receipt replay after revocation", () => school(async f => {
  const record = await approved(f), p = await preview(f, record), request = input(p); await executeSchoolAiTool(f.user, record.id, request);
  for (const patch of [{ module: "fees", canView: false, canAdd: true, canEdit: true }, { module: "fees", canView: true, canAdd: false, canEdit: true }, { module: "ai", canView: true, canAdd: true, canEdit: false }, { module: "ai", canView: false, canAdd: true, canEdit: true }]) {
    const grant = await db.rolePermission.create({ data: { schoolId: f.schoolId, role: f.user.role, ...patch } });
    try { await assert.rejects(() => getFeeInvoiceOptions(f.user, f.campusId, f.classId), { status: 403 }); await assert.rejects(() => preview(f, record), { status: 403 }); await assert.rejects(() => executeSchoolAiTool(f.user, record.id, request), { status: 403 }); await assert.rejects(() => listSchoolAiExecutions(f.user, record.id), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); }
  }
  await db.user.update({ where: { id: f.user.userId }, data: { accessVersion: 1 } }); await assert.rejects(() => executeSchoolAiTool(f.user, record.id, request), { status: 403 });
}));
test("owner with no campus can select their campus while role and tenant mismatches are denied", () => school(async f => {
  await db.user.update({ where: { id: f.user.userId }, data: { role: "SUPER_ADMIN", campusId: null } }); const owner: AuthUser = { ...f.user, role: "SUPER_ADMIN", campusId: null };
  const options = await getFeeInvoiceOptions(owner, f.campusId, f.classId); assert.equal(options.groups.length, 1);
  const record = await approved(f, f.proposal, owner), p = await preview(f, record, owner); assert.equal((await executeSchoolAiTool(owner, record.id, input(p))).createdCount, 1);
  await assert.rejects(() => getFeeInvoiceOptions(owner, randomUUID(), f.classId), { status: 403 });
  for (const role of ["TEACHER", "STUDENT", "PARENT", "ACCOUNTANT"] as const) await assert.rejects(() => getFeeInvoiceOptions({ ...owner, role, campusId: f.campusId }, f.campusId), { status: 403 });
}));

test("a prior-campus invoice survives transfer and excludes a new-campus monthly bill without exposing amounts", () => school(async f => {
  const oldInvoice = await legacyInvoice(f), oldCampus = f.campusId, movedCampus = randomUUID(), movedClass = randomUUID();
  await db.campus.create({ data: { id: movedCampus, schoolId: f.schoolId, name: "Destination campus", regId: movedCampus, city: "Test" } });
  await db.class.create({ data: { id: movedClass, schoolId: f.schoolId, campusId: movedCampus, name: "Destination grade", academicYear: 2026 } });
  await db.academicCycle.create({ data: { schoolId: f.schoolId, campusId: movedCampus, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.studentEnrollment.updateMany({ where: { studentId: f.studentId }, data: { endDate: new Date("2026-10-15Z"), status: "TRANSFERRED" } });
  await db.studentEnrollment.create({ data: { schoolId: f.schoolId, studentId: f.studentId, campusId: movedCampus, classId: movedClass, campusName: "Destination campus", className: "Destination grade", curriculum: "Synthetic", academicYear: 2026, rollNo: "1", startDate: new Date("2026-10-15Z"), origin: "REVIEWED" } });
  await db.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.enrollment_reviewed', ${f.studentId}, true)`; await tx.student.update({ where: { id: f.studentId }, data: { campusId: movedCampus, classId: movedClass, categoryId: null } }); });
  await db.user.update({ where: { id: f.user.userId }, data: { campusId: movedCampus } });
  const group = await db.feeGroup.create({ data: { schoolId: f.schoolId, campusId: movedCampus, name: "New campus fees", currency: "PKR" } });
  const type = await db.feeType.create({ data: { schoolId: f.schoolId, campusId: movedCampus, name: "New tuition", code: "MONTHLY_TUITION" } });
  const line = await db.feesMasterLine.create({ data: { schoolId: f.schoolId, campusId: movedCampus, feeGroupId: group.id, feeTypeId: type.id, amount: 9999 } });
  await db.feeGroupAssignment.create({ data: { schoolId: f.schoolId, campusId: movedCampus, classId: movedClass, feeGroupId: group.id, academicYear: 2026 } });
  f.campusId = movedCampus; f.classId = movedClass; f.user = { ...f.user, campusId: movedCampus };
  const record = await approved(f, { ...f.proposal, classId: movedClass, feeGroupId: group.id, feeLineIds: [line.id] }), p = await preview(f, record);
  assert.equal(p.students[0].reason, "FEE_ALREADY_INVOICED"); assert.equal(p.students[0].subtotal, 0); assert.equal(p.students[0].totalAmount, 0); assert.deepEqual(p.students[0].existingInvoiceIds, [oldInvoice.id]);
  await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(p)), { code: "FEE_EMPTY_BATCH" });
  assert.equal(await db.invoice.count({ where: { schoolId: f.schoolId } }), 1); assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: oldInvoice.id } })).campusId, oldCampus);
}));

test("monthly duplicate lookup keeps UTC date-only boundaries in positive and negative session timezones", () => school(async f => {
  const existing = await legacyInvoice(f);
  for (const timezone of ["UTC", "Asia/Karachi", "America/Los_Angeles"]) {
    const rows = await db.$transaction(async tx => { await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`; return existingMonthlyStudentInvoices(tx, f.schoolId, f.campusId, [f.studentId], new Date("2026-10-01Z"), new Date("2026-11-01Z")); });
    assert.deepEqual(rows.map(row => row.id), [existing.id], timezone);
  }
}));


test("explicit reviewed carry consumption keeps money separate and preserves remaining credit across months", () => school(async f => {
  const carry = await db.feeCarryForward.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId: f.studentId, fromAcademicYear: 2025, toAcademicYear: 2026, balance: -10000, currency: "PKR" } });
  const record = await approved(f, { ...f.proposal, applyCarryForward: true }), p = await preview(f, record);
  assert.equal(p.students[0].carryBefore, -10000); assert.equal(p.students[0].carryForwardAmount, -8500); assert.equal(p.students[0].carryRemaining, -1500); assert.equal(p.totalAmount, 0);
  const receipt = await executeSchoolAiTool(f.user, record.id, input(p)), invoice = await db.invoice.findUniqueOrThrow({ where: { id: receipt.invoiceIds[0] } });
  assert.equal(invoice.status, "PAID"); assert.equal(invoice.carryForwardAmount, -8500); assert.equal(invoice.subtotal, 11000); assert.equal(invoice.discountAmount, 2500); assert.equal(invoice.totalAmount, 0); assert.equal(invoice.totalAmountPaid, 0);
  assert.equal((await db.feeCarryForward.findUniqueOrThrow({ where: { id: carry.id } })).balance, -1500);
  assert.equal(await db.payment.count({ where: { schoolId: f.schoolId } }), 0); assert.equal(await db.ledgerEntry.count({ where: { schoolId: f.schoolId } }), 0);
  const november = await approved(f, { ...f.proposal, billingMonth: "2026-11", dueDate: "2026-11-30", feeLineIds: [f.monthly.id], applyCarryForward: true }), next = await preview(f, november);
  assert.equal(next.students[0].carryForwardAmount, -1500); await executeSchoolAiTool(f.user, november.id, input(next)); assert.equal((await db.feeCarryForward.findUniqueOrThrow({ where: { id: carry.id } })).balance, 0);
}));
test("reviewed carried debt is billed once and changing a carry invalidates the approved preview", () => school(async f => {
  const carry = await db.feeCarryForward.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId: f.studentId, fromAcademicYear: 2025, toAcademicYear: 2026, balance: 1200, currency: "PKR" } });
  const record = await approved(f, { ...f.proposal, applyCarryForward: true }), p = await preview(f, record); assert.equal(p.totalAmount, 9700);
  await db.feeCarryForward.update({ where: { id: carry.id }, data: { balance: 1300 } }); await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(p)), { code: "STALE_EXECUTION_PREVIEW" });
  const current = await preview(f, record), receipt = await executeSchoolAiTool(f.user, record.id, input(current)); assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: receipt.invoiceIds[0] } })).carryForwardAmount, 1300); assert.equal((await db.feeCarryForward.findUniqueOrThrow({ where: { id: carry.id } })).balance, 0);
}));
