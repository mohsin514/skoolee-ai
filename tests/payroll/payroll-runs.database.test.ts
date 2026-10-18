import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { calculateLine, type EmployeeInput, type PolicyRules } from "../../src/lib/payroll-runs/engine";
import { addAdjustment, approveRun, createCorrection, payrollOverview, prepareRun, recordProviderResult, savePolicy, saveProvider, setEmployee, submitRun } from "../../src/lib/payroll-runs/service";

// SKO-434: proration and leave follow the entity's policy version; exceptions block approval;
// approval is by someone other than the preparer and binds the inputs; a changed input makes the
// approval stale; a submission is created once and retries reuse its reference; rejected rows are
// corrected in a version that covers only them.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `payroll-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID();
const actor = (role: AuthUser["role"], campus = campusId): AuthUser => ({ userId: randomUUID(), schoolId, campusId: campus, role, email: `${randomUUID()}@example.invalid` });
const principal = actor("PRINCIPAL"), campusAdmin = actor("CAMPUS_ADMIN"), accountant = actor("ACCOUNTANT"), teacherUser = actor("TEACHER"), otherAdmin = actor("CAMPUS_ADMIN", otherCampusId);
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId, campusId: user.campusId!, userId: user.userId, role: user.role }, work);
const staff: Record<string, string> = {};
let leaveTypeId = "";

const policyA: PolicyRules = { id: "a", version: 1, packageLabel: "Calendar demo v1", currency: "SAR", prorationBasis: "CALENDAR_DAYS", leaveDivisor: "CALENDAR_DAYS", leaveYearStartMonth: 9, rounding: "HALF_UP" };
const policyB: PolicyRules = { ...policyA, id: "b", packageLabel: "KSA-demo v2", prorationBasis: "FIXED_30", leaveDivisor: "FIXED_30", rounding: "DOWN" };
const person = (over: Partial<EmployeeInput> = {}): EmployeeInput => ({ userId: "u", name: "Synthetic", role: "TEACHER", joiningDate: null, leavingDate: null, basic: 300_000, allowances: [], deductions: [], salarySource: "fixture", providerEmployeeId: "E1", leave: [], allocations: {}, adjustments: [], ...over });

test("proration follows the policy: February, a leap year, joining and leaving", () => {
  const joinFeb = person({ joiningDate: "2027-02-15" });
  assert.equal(calculateLine(policyA, 2027, 2, joinFeb).employedDays, 14, "calendar: 15th to 28th");
  assert.equal(calculateLine(policyA, 2027, 2, joinFeb).components[0].amount, 150_000, "14/28 of basic");
  assert.equal(calculateLine(policyA, 2028, 2, person({ joiningDate: "2028-02-15" })).components[0].amount, 155_172, "leap year: 15/29, rounded half up");
  assert.equal(calculateLine(policyB, 2027, 2, joinFeb).components[0].amount, 160_000, "30-day month: 16/30");
  assert.equal(calculateLine(policyB, 2028, 2, person()).components[0].amount, 300_000, "a full February is a full 30-day month");
  const leaving = person({ leavingDate: "2027-03-15" });
  assert.deepEqual([calculateLine(policyA, 2027, 3, leaving).components[0].amount, calculateLine(policyB, 2027, 3, leaving).components[0].amount], [145_161, 150_000]);
});

test("leave: overlapping requests count each day once, only days in the period, beyond the allocation", () => {
  const leave = [
    { requestId: "L1", leaveTypeId: "T", typeName: "Annual", from: "2027-01-28", to: "2027-02-03", days: 70 },
    { requestId: "L2", leaveTypeId: "T", typeName: "Annual", from: "2027-02-02", to: "2027-02-05", days: 40 },
  ];
  const line = calculateLine(policyA, 2027, 2, person({ leave, allocations: { T: 50 } }));
  // Allocation 5 days; 4 used in January (28–31). February: 1–5 = 5 days (2nd and 3rd once) → 4 unpaid.
  assert.equal(line.unpaidLeaveDays, 4);
  const deduction = line.components.find((c) => c.code === "UNPAID_LEAVE")!;
  assert.equal(deduction.amount, Math.round((300_000 / 28) * 4));
  assert.match(deduction.rule, /beyond the 5-day allocation \(4 used since 2026-09-01\)/u);
  assert.match(deduction.source, /L1, L2/u);
  assert.equal(calculateLine(policyB, 2027, 2, person({ leave, allocations: { T: 50 } })).components.find((c) => c.code === "UNPAID_LEAVE")!.amount, 40_000, "30-day divisor, rounded down");
});

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic payroll school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campusId, otherCampusId]) await raw.campus.create({ data: { id, schoolId, name: `Synthetic ${id.slice(0, 4)}`, regId: id, city: "Riyadh" } });
  for (const user of [principal, campusAdmin, accountant, teacherUser, otherAdmin]) await raw.user.create({ data: { id: user.userId, schoolId, campusId: user.campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  for (const [key, basic] of [["amal", 1_000_000], ["badr", 800_000], ["dana", 50_000]] as const) {
    const id = randomUUID();
    staff[key] = id;
    await raw.user.create({ data: { id, schoolId, campusId, role: "TEACHER", email: `${id}@example.invalid`, fullName: `Synthetic ${key}`, onboardingComplete: true, isActive: true, joiningDate: new Date("2026-01-01T00:00:00Z") } });
    await raw.staffProfile.create({ data: { schoolId, userId: id, basicSalary: basic, deductionsJson: key === "dana" ? { Loan: 120_000 } : {} } });
  }
  leaveTypeId = (await raw.leaveType.create({ data: { schoolId, campusId, name: "Annual" } })).id;
});
after(async () => {
  for (const m of [raw.payrollSubmission, raw.payrollCalculation, raw.payrollAdjustment, raw.payrollEmployee, raw.payrollProvider, raw.payrollPolicy]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

test("a run names entity, currency and policy version; exceptions block approval; the preparer cannot approve", async () => {
  await assert.rejects(() => ctx(accountant, () => prepareRun(accountant, { year: 2027, month: 3 })), /No payroll policy is in effect/);
  await assert.rejects(() => ctx(accountant, () => savePolicy(accountant, {})), { status: 403 });
  await ctx(principal, () => savePolicy(principal, { entityName: "Synthetic Cedar School", currency: "SAR", effectiveFrom: "2026-09-01", packageLabel: "KSA-demo v1", scopeNote: "Demonstration rules; requires local validation before use.", prorationBasis: "CALENDAR_DAYS", leaveDivisor: "CALENDAR_DAYS", leaveYearStartMonth: 9, rounding: "HALF_UP" }));
  await ctx(principal, () => savePolicy(principal, { entityName: "Synthetic Cedar School", currency: "SAR", effectiveFrom: "2027-03-01", packageLabel: "KSA-demo v2", scopeNote: "Demonstration rules; requires local validation before use.", prorationBasis: "FIXED_30", leaveDivisor: "FIXED_30", leaveYearStartMonth: 9, rounding: "HALF_UP" }));
  await ctx(principal, () => saveProvider(principal, { code: "DEMOPAY", name: "Synthetic provider", currencies: ["PKR"], columns: [{ header: "EmpID", field: "providerEmployeeId" }, { header: "Net", field: "net" }, { header: "Ccy", field: "currency" }] }));
  const first = await ctx(accountant, () => prepareRun(accountant, { year: 2027, month: 3 }));
  assert.deepEqual([first.entityName, first.currency, first.policyVersion, first.version], ["Synthetic Cedar School", "SAR", 2, 1], "March uses the version effective from 1 March");
  const codes = (first.exceptions as { code: string }[]).map((e) => e.code).sort();
  assert.deepEqual(codes, ["MISSING_PROVIDER_ID", "MISSING_PROVIDER_ID", "MISSING_PROVIDER_ID", "NEGATIVE_NET", "UNSUPPORTED_CURRENCY"]);
  await assert.rejects(() => ctx(campusAdmin, () => approveRun(campusAdmin, first.id)), /Resolve before approval/);

  await ctx(principal, () => saveProvider(principal, { code: "DEMOPAY", name: "Synthetic provider", currencies: ["SAR", "PKR"], columns: [{ header: "EmpID", field: "providerEmployeeId" }, { header: "Name", field: "name" }, { header: "Net", field: "net" }, { header: "Ccy", field: "currency" }, { header: "Ref", field: "reference" }] }));
  for (const [key, code] of [["amal", "E-101"], ["badr", "E-102"], ["dana", "E-103"]]) await ctx(accountant, () => setEmployee(accountant, staff[key], { providerIds: { DEMOPAY: code } }));
  await ctx(accountant, () => addAdjustment(accountant, { userId: staff.dana, year: 2027, month: 3, kind: "EARNING", label: "Loan deferral", amount: 70_000, reason: "Loan instalment deferred to April by principal" }));
  const second = await ctx(principal, () => prepareRun(principal, { year: 2027, month: 3 }));
  assert.equal(second.version, 2);
  assert.equal((await raw.payrollCalculation.findUniqueOrThrow({ where: { id: first.id } })).status, "SUPERSEDED");
  assert.deepEqual(second.exceptions, []);
  for (const line of second.lines as { components: { kind: string; rule: string; source: string }[] }[]) for (const c of line.components) assert.ok(c.rule && c.source, "every amount names its rule and input");
  await assert.rejects(() => ctx(principal, () => approveRun(principal, second.id)), /Another approver is required/);
  await assert.rejects(() => ctx(otherAdmin, () => approveRun(otherAdmin, second.id)), { status: 404 }, "another entity's run is not visible");
  await assert.rejects(() => ctx(teacherUser, () => payrollOverview(teacherUser, { year: 2027, month: 3 })), { status: 403 }, "no salary preview without payroll access");
  assert.equal((await ctx(campusAdmin, () => approveRun(campusAdmin, second.id))).status, "APPROVED");
});

test("a leave change after approval makes the export stale; the new version is approved again", async () => {
  const approved = await raw.payrollCalculation.findFirstOrThrow({ where: { campusId, year: 2027, month: 3, status: "APPROVED" } });
  await raw.leaveRequest.create({ data: { schoolId, campusId, userId: staff.badr, leaveTypeId, fromDate: new Date("2027-03-10T00:00:00Z"), toDate: new Date("2027-03-11T00:00:00Z"), days: 20, status: "APPROVED" } });
  await assert.rejects(() => ctx(accountant, () => submitRun(accountant, approved.id)), /now stale/);
  assert.equal((await raw.payrollCalculation.findUniqueOrThrow({ where: { id: approved.id } })).status, "STALE");
  assert.equal(await raw.payrollSubmission.count({ where: { calculationId: approved.id } }), 0);
  const next = await ctx(accountant, () => prepareRun(accountant, { year: 2027, month: 3 }));
  const badr = (next.lines as { userId: string; components: { code: string; amount: number; source: string }[] }[]).find((l) => l.userId === staff.badr)!;
  const leave = badr.components.find((c) => c.code === "UNPAID_LEAVE")!;
  assert.equal(leave.amount, Math.round((800_000 / 30) * 2), "two unallocated days at the 30-day divisor of policy v2");
  assert.match(leave.source, /Approved leave/u);
  await ctx(campusAdmin, () => approveRun(campusAdmin, next.id));
});

test("submitting twice keeps one reference; rejected rows are corrected alone and accepted rows are never resent", async () => {
  const calc = await raw.payrollCalculation.findFirstOrThrow({ where: { campusId, year: 2027, month: 3, status: "APPROVED" } });
  const [a, b] = await Promise.all([ctx(accountant, () => submitRun(accountant, calc.id)), ctx(accountant, () => submitRun(accountant, calc.id))]);
  assert.equal(a.submission.reference, b.submission.reference);
  assert.equal(await raw.payrollSubmission.count({ where: { calculationId: calc.id } }), 1);
  assert.match(a.submission.file, /^EmpID,Name,Net,Ccy,Ref\nE-10[123],/u);
  await assert.rejects(() => ctx(accountant, () => prepareRun(accountant, { year: 2027, month: 3 })), /already exported/);
  const result = await ctx(accountant, () => recordProviderResult(accountant, a.submission.id, { rows: [{ providerEmployeeId: "E-101", outcome: "ACCEPTED" }, { providerEmployeeId: "E-103", outcome: "ACCEPTED" }], acknowledgement: "ACK-1" }));
  assert.equal(result.submission.status, "PARTIAL");
  const retry = await ctx(accountant, () => submitRun(accountant, calc.id));
  assert.deepEqual([retry.replayed, retry.resent, retry.submission.reference], [true, 1, a.submission.reference], "a timeout retry resends only the unresolved row");
  const rejected = await ctx(accountant, () => recordProviderResult(accountant, a.submission.id, { rows: [{ providerEmployeeId: "E-102", outcome: "REJECTED", reason: "Unknown IBAN" }, { providerEmployeeId: "E-101", outcome: "REJECTED", reason: "late duplicate" }] }));
  assert.deepEqual(rejected.ignored, ["E-101"], "an accepted row stays accepted");
  const correction = await ctx(accountant, () => createCorrection(accountant, a.submission.id));
  assert.deepEqual([correction.scopeUserIds, correction.correctionOfId, correction.status], [[staff.badr], calc.id, "DRAFT"]);
  assert.equal((correction.lines as unknown[]).length, 1, "the correction covers only the rejected row");
  await assert.rejects(() => ctx(accountant, () => submitRun(accountant, correction.id)), /Only an approved version/);
  await ctx(campusAdmin, () => approveRun(campusAdmin, correction.id));
  const fix = await ctx(accountant, () => submitRun(accountant, correction.id));
  assert.notEqual(fix.submission.reference, a.submission.reference);
  assert.equal((fix.submission.rows as unknown[]).length, 1);
  const overview = await ctx(accountant, () => payrollOverview(accountant, { year: 2027, month: 3 }));
  assert.equal(overview.corrections.filter((c) => c.outcome === "REJECTED" && c.correctionStarted).length, 1);
  assert.equal((await raw.payrollSubmission.findUniqueOrThrow({ where: { id: a.submission.id } })).status, "PARTIAL", "the original batch is preserved");
});
