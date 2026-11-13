import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { approveRun, prepareRun, savePolicy, saveProvider, setEmployee } from "../../src/lib/payroll-runs/service";

// SKAI-1505: a deactivated member with a recorded last working day is paid, prorated, for the periods they worked.
// Two schools and two campuses prove the run for one campus pulls in only that campus's staff, and a draft that
// predates a recorded last working day cannot be approved as it was prepared.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient();
const schoolA = `termA-${randomUUID()}`, schoolB = `termB-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const actor = (schoolId: string, campusId: string, role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const adminA1 = actor(schoolA, campusA1, "CAMPUS_ADMIN"), accountantA1 = actor(schoolA, campusA1, "ACCOUNTANT");
const adminA2 = actor(schoolA, campusA2, "CAMPUS_ADMIN");
const accountantA2 = actor(schoolA, campusA2, "ACCOUNTANT"), accountantB1 = actor(schoolB, campusB1, "ACCOUNTANT");
const approverA1 = actor(schoolA, campusA1, "CAMPUS_ADMIN");
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId!, userId: user.userId, role: user.role }, work);
const REASON = "Checked against attendance, leave and salary records.";
const staff: Record<string, { id: string; schoolId: string; campusId: string }> = {};

const policy = (over: Record<string, unknown> = {}) => ({
  entityName: "Synthetic Cedar School", currency: "SAR", effectiveFrom: "2026-01-01", packageLabel: "Calendar demo v1",
  scopeNote: "Demonstration rules; requires local validation before use.", prorationBasis: "CALENDAR_DAYS", leaveDivisor: "CALENDAR_DAYS",
  leaveYearStartMonth: 9, rounding: "HALF_UP", ...over,
});
const provider = () => ({ code: "DEMOPAY", name: "Synthetic provider", currencies: ["SAR"], columns: [{ header: "EmpID", field: "providerEmployeeId" }, { header: "Net", field: "net" }] });

async function newStaff(key: string, manager: AuthUser, opts: { isActive: boolean; leaving?: string; basic?: number; loan?: number }) {
  const id = randomUUID();
  await raw.user.create({ data: { id, schoolId: manager.schoolId, campusId: manager.campusId!, role: "TEACHER", email: `${id}@example.invalid`, fullName: `Synthetic ${key}`, onboardingComplete: true, isActive: opts.isActive, joiningDate: new Date("2026-01-01T00:00:00Z") } });
  await raw.staffProfile.create({ data: { schoolId: manager.schoolId, userId: id, basicSalary: opts.basic ?? 310_000, deductionsJson: opts.loan ? { Loan: opts.loan } : {} } });
  staff[key] = { id, schoolId: manager.schoolId, campusId: manager.campusId! };
  // Every staff member needs a provider employee id, or approval stops on the mapping check before the stale-input check.
  await ctx(manager, () => setEmployee(manager, id, { providerIds: { DEMOPAY: `E-${key}` }, ...(opts.leaving ? { leavingDate: opts.leaving } : {}) }));
  return id;
}

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic termination school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  for (const [schoolId, campusId] of [[schoolA, campusA1], [schoolA, campusA2], [schoolB, campusB1]]) await raw.campus.create({ data: { id: campusId, schoolId, name: `Synthetic ${campusId.slice(0, 4)}`, regId: campusId, city: "Riyadh" } });
  for (const user of [adminA1, adminA2, accountantA1, accountantA2, accountantB1, approverA1]) await raw.user.create({ data: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  // Policy and provider mappings are per campus, so each campus that prepares a run needs its own.
  for (const admin of [adminA1, adminA2]) {
    await ctx(admin, () => savePolicy(admin, policy()));
    await ctx(admin, () => saveProvider(admin, provider()));
  }
  // Campus A1 staff: a terminated leaver with a loan, and an active peer.
  await newStaff("leaverA1", accountantA1, { isActive: false, leaving: "2026-10-15", loan: 12_000 });
  await newStaff("peerA1", accountantA1, { isActive: true });
  // Same-named situation on the other campus of the same school, and on another school entirely.
  await newStaff("leaverA2", accountantA2, { isActive: false, leaving: "2026-10-15", loan: 12_000 });
  await newStaff("leaverB1", accountantB1, { isActive: false, leaving: "2026-10-15", loan: 12_000 });
});
after(async () => {
  for (const m of [raw.payrollSubmission, raw.payrollCalculation, raw.payrollAdjustment, raw.payrollEmployee, raw.payrollProvider, raw.payrollPolicy]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId: { in: [schoolA, schoolB] } } });
  await raw.$disconnect(); await prisma.$disconnect();
});

test("a terminated leaver is paid 15 of 31 days on their campus only; other campus and school staff are not pulled in", async () => {
  const calc = await ctx(accountantA1, () => prepareRun(accountantA1, { year: 2026, month: 10 }));
  const lines = calc.lines as unknown as { userId: string; employedDays: number; periodDays: number; gross: number; deductions: number }[];
  const leaver = lines.find((l) => l.userId === staff.leaverA1.id);
  assert.ok(leaver, "the deactivated leaver with a last working day is in the run");
  assert.equal(leaver.employedDays, 15);
  assert.equal(leaver.periodDays, 31);
  assert.equal(leaver.gross, 150_000, "310000 basic x 15/31");
  assert.ok(leaver.deductions > 0, "the loan deduction applies to the final line");
  assert.ok(lines.some((l) => l.userId === staff.peerA1.id));
  const ids = new Set(lines.map((l) => l.userId));
  assert.equal(ids.has(staff.leaverA2.id), false, "a leaver on another campus of the same school is not in this run");
  assert.equal(ids.has(staff.leaverB1.id), false, "a leaver on another school is not in this run");
});

test("the other campus of the same school gets its own leaver and not campus A1's", async () => {
  const calc = await ctx(accountantA2, () => prepareRun(accountantA2, { year: 2026, month: 10 }));
  const ids = new Set((calc.lines as unknown as { userId: string }[]).map((l) => l.userId));
  assert.ok(ids.has(staff.leaverA2.id));
  assert.equal(ids.has(staff.leaverA1.id), false);
  assert.equal(ids.has(staff.leaverB1.id), false);
});

test("a draft prepared before a last working day was recorded cannot be approved as it was prepared", async () => {
  const late = await newStaff("lateA1", accountantA1, { isActive: false });
  const draft = await ctx(accountantA1, () => prepareRun(accountantA1, { year: 2026, month: 10 }));
  assert.equal((draft.lines as unknown as { userId: string }[]).some((l) => l.userId === late), false, "not paid before the last working day is recorded");
  await ctx(accountantA1, () => setEmployee(accountantA1, late, { leavingDate: "2026-10-20" }));
  await assert.rejects(() => ctx(approverA1, () => approveRun(approverA1, draft.id, REASON)), /Inputs changed since this version was prepared/);
  const fresh = await ctx(accountantA1, () => prepareRun(accountantA1, { year: 2026, month: 10 }));
  assert.equal((fresh.lines as unknown as { userId: string }[]).some((l) => l.userId === late), true, "a new version includes the leaver");
});
