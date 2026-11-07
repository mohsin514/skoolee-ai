import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { reversePayrollLine } from "../../src/lib/payroll-reversal";

// SKAI-1506: a posted payroll expense is reversed by an opposite, linked ledger entry; the original entry is never
// edited or deleted; the line becomes REVERSED; a replay (same line or same key) returns the first reversal; a closed
// period is refused; another school, another campus and a role without accounts write access are refused.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only an isolated local PostgreSQL.");
const raw = new PrismaClient();
const schoolA = `payrev-a-${randomUUID()}`, schoolB = `payrev-b-${randomUUID()}`;
const campusA = randomUUID(), campusA2 = randomUUID(), campusB = randomUUID();
const users: Record<string, AuthUser> = {};
const REASON = "Paid to the wrong month; reposting in the correct run.";

async function actor(key: string, role: AuthUser["role"], schoolId: string, campusId: string) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await raw.user.create({ data: { id, email, password: "x", fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true } });
  users[key] = { userId: id, schoolId, campusId, role, email };
}

async function paidLine(schoolId: string, campusId: string, month: number, bankAccountId: string | null = null) {
  const staff = await raw.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.invalid`, password: "x", fullName: "Synthetic staff", role: "TEACHER", schoolId, campusId, isActive: true } });
  const run = await raw.payrollRun.create({ data: { schoolId, campusId, month, year: 2026 } });
  const line = await raw.payrollLine.create({ data: { schoolId, payrollRunId: run.id, userId: staff.id, basic: 100_000, net: 100_000, status: "PAID", paidAt: new Date() } });
  const account = await raw.chartOfAccount.upsert({ where: { campusId_name: { campusId, name: "Salaries Expense" } }, create: { schoolId, campusId, name: "Salaries Expense", type: "EXPENSE", isSystem: true }, update: {} });
  const entry = await raw.ledgerEntry.create({ data: { schoolId, campusId, kind: "EXPENSE", currency: "PKR", sourceName: "Payroll", accountId: account.id, bankAccountId, date: new Date(), amount: 100_000, payrollLineId: line.id } });
  return { line, entry };
}

before(async () => {
  for (const [id, name] of [[schoolA, "A"], [schoolB, "B"]]) await raw.school.create({ data: { id, name: `Synthetic Payroll ${name}`, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [id, schoolId] of [[campusA, schoolA], [campusA2, schoolA], [campusB, schoolB]]) await raw.campus.create({ data: { id, schoolId, name: `Campus ${id.slice(0, 4)}`, regId: id, city: "Lahore" } });
  await actor("accountant", "ACCOUNTANT", schoolA, campusA);
  await actor("admin", "CAMPUS_ADMIN", schoolA, campusA);
  await actor("principal", "PRINCIPAL", schoolA, campusA);
  await actor("otherCampus", "CAMPUS_ADMIN", schoolA, campusA2);
  await actor("otherSchool", "CAMPUS_ADMIN", schoolB, campusB);
});

after(async () => {
  for (const schoolId of [schoolA, schoolB]) {
    await raw.ledgerEntry.updateMany({ where: { schoolId }, data: { reversalOfId: null } });
    await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  }
  await raw.$disconnect(); await prisma.$disconnect();
});

test("an accountant reverses a posted payroll expense with an opposite, linked entry; the original is untouched", async () => {
  const { line, entry } = await paidLine(schoolA, campusA, 1);
  const result = await reversePayrollLine(users.accountant, line.id, REASON, "payrev-key-0001");
  assert.equal(result.replayed, false);
  assert.equal(result.entry.amount, -100_000);
  assert.equal(result.entry.reversalOfId, entry.id);
  assert.equal(result.entry.kind, "EXPENSE");
  assert.equal(result.entry.payrollLineId, null, "the link to the line stays on the original entry");
  const original = await raw.ledgerEntry.findUniqueOrThrow({ where: { id: entry.id } });
  assert.deepEqual([original.amount, original.payrollLineId, original.sourceName], [100_000, line.id, "Payroll"], "the original entry is never edited");
  assert.equal((await raw.payrollLine.findUniqueOrThrow({ where: { id: line.id } })).status, "REVERSED");
  const audits = await raw.auditLog.findMany({ where: { schoolId: schoolA, recordId: { in: [line.id, entry.id] } } });
  assert.ok(audits.length >= 2, "the reversal is audited on the line and the ledger entry");
});

test("a replay with the same key, or a second reversal of the same line, returns the first result", async () => {
  const { line } = await paidLine(schoolA, campusA, 2);
  const first = await reversePayrollLine(users.admin, line.id, REASON, "payrev-key-0002");
  const sameKey = await reversePayrollLine(users.admin, line.id, REASON, "payrev-key-0002");
  const again = await reversePayrollLine(users.accountant, line.id, REASON, "payrev-key-0003");
  assert.deepEqual([sameKey.replayed, sameKey.entry.id, again.replayed, again.entry.id], [true, first.entry.id, true, first.entry.id]);
  assert.equal(await raw.ledgerEntry.count({ where: { reversalOf: { payrollLineId: line.id } } }), 1);
  const other = await paidLine(schoolA, campusA, 3);
  await assert.rejects(reversePayrollLine(users.admin, other.line.id, REASON, "payrev-key-0002"), (e: { status?: number }) => e.status === 409, "a key already used for another line is refused");
});

test("a closed (reconciled) period is refused and nothing is posted", async () => {
  const bank = await raw.bankAccount.create({ data: { schoolId: schoolA, campusId: campusA, name: "Synthetic bank" } });
  const { line } = await paidLine(schoolA, campusA, 4, bank.id);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  await raw.bankReconciliation.create({ data: { schoolId: schoolA, campusId: campusA, importDate: today, bankAccount: bank.id, status: "reconciled", statementPeriodFrom: new Date(today.getTime() - 86_400_000 * 5), statementPeriodTo: new Date(today.getTime() + 86_400_000) } });
  await assert.rejects(reversePayrollLine(users.accountant, line.id, REASON), (e: { status?: number }) => e.status === 409);
  assert.equal((await raw.payrollLine.findUniqueOrThrow({ where: { id: line.id } })).status, "PAID");
  assert.equal(await raw.ledgerEntry.count({ where: { reversalOf: { payrollLineId: line.id } } }), 0);
});

test("another school, another campus and a role without accounts write access cannot reverse", async () => {
  const { line } = await paidLine(schoolA, campusA, 5);
  await assert.rejects(reversePayrollLine(users.otherSchool, line.id, REASON), (e: { status?: number }) => e.status === 404);
  await assert.rejects(reversePayrollLine(users.otherCampus, line.id, REASON), (e: { status?: number }) => e.status === 404);
  await assert.rejects(reversePayrollLine(users.principal, line.id, REASON), (e: { status?: number }) => e.status === 403);
  await assert.rejects(reversePayrollLine(users.accountant, line.id, "no"), (e: { status?: number }) => e.status === 400, "a reason is required");
  assert.equal((await raw.payrollLine.findUniqueOrThrow({ where: { id: line.id } })).status, "PAID");
  const unpaid = await raw.payrollLine.create({ data: { schoolId: schoolA, payrollRunId: line.payrollRunId, userId: users.admin.userId, net: 5, status: "UNPAID" } });
  await assert.rejects(reversePayrollLine(users.accountant, unpaid.id, REASON), (e: { status?: number }) => e.status === 409, "only a posted line can be reversed");
});
