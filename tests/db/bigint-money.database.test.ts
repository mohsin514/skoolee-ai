import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { parseOpeningBalance } from "../../src/lib/accounts/bank-account-command";

// SKAI-1902 (DB-01): bank opening balances and payroll run totals are 64-bit in the database, and the app client
// returns them as plain numbers, so a 50M PKR value saves, reads back exactly and serialises to JSON.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const raw = new PrismaClient();
const schoolId = `bm1902-${randomUUID()}`, campusId = randomUUID();
const FIFTY_MILLION_PKR = 5_000_000_000; // minor units (paisa); above the 32-bit ceiling of 2,147,483,647
const inSchool = <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId }, fn);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Money School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Money Main", regId: campusId, city: "Lahore" } });
});
after(async () => {
  await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await raw.$disconnect();
});

test("a 50M PKR opening balance saves and reads back as an exact number", async () => {
  assert.equal(parseOpeningBalance(FIFTY_MILLION_PKR), FIFTY_MILLION_PKR);
  const bank = await inSchool(() => prisma.bankAccount.create({ data: { schoolId, campusId, name: "Main account", currency: "PKR", openingBalance: FIFTY_MILLION_PKR } }));
  assert.equal(typeof bank.openingBalance, "number");
  assert.equal(bank.openingBalance, FIFTY_MILLION_PKR);
  const read = await inSchool(() => prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } }));
  assert.equal(read.openingBalance, FIFTY_MILLION_PKR);
  assert.equal(JSON.parse(JSON.stringify(read)).openingBalance, FIFTY_MILLION_PKR);
  const listed = await inSchool(() => prisma.campus.findUniqueOrThrow({ where: { id: campusId }, include: { bankAccounts: true } }));
  assert.equal(JSON.parse(JSON.stringify(listed)).bankAccounts[0].openingBalance, FIFTY_MILLION_PKR);
});

test("a 50M PKR payroll run total saves and reads back as an exact number", async () => {
  const run = await inSchool(() => prisma.payrollCalculation.create({ data: { schoolId, campusId, year: 2026, month: 11, version: 1, policyId: randomUUID(), policyVersion: 1, currency: "PKR", entityName: "Synthetic", providerId: "synthetic", scopeUserIds: [], inputs: {}, inputHash: "h", lines: [], totalNet: FIFTY_MILLION_PKR, preparedById: randomUUID() } }));
  assert.equal(typeof run.totalNet, "number");
  const read = await inSchool(() => prisma.payrollCalculation.findUniqueOrThrow({ where: { id: run.id } }));
  assert.equal(read.totalNet, FIFTY_MILLION_PKR);
  assert.equal(JSON.parse(JSON.stringify(read)).totalNet, FIFTY_MILLION_PKR);
});

test("an opening balance beyond the safe-integer range is refused", () => {
  assert.throws(() => parseOpeningBalance(Number.MAX_SAFE_INTEGER + 2), /supported range/);
});
