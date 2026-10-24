import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { catalog, preview as correctionPreview, requestCorrection, decideCorrection } from "../../src/lib/corrections/service";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { previewSchoolAiExecution, executeSchoolAiTool, listSchoolAiExecutions } from "../../src/lib/school-ai/execution";
import { deleteUnreconciledManualLedgerEntry } from "../../src/lib/fees/ledger-protection";
import { getFinanceOperationsOptions } from "../../src/lib/school-ai/finance-operations-service";
import type { FinanceOperationProposal, FinanceOperationsPreview } from "../../src/lib/school-ai/finance-operations";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only isolated PG55438.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const schoolId = `finance-ai-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), userId = randomUUID(), studentId = randomUUID(); schoolIds.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic finance school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", correctionSeparateApprover: false } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, fullName: "Finance reviewer", email: `${userId}@example.invalid`, role: "CAMPUS_ADMIN" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", academicYear: 2026 } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE", startDate: new Date("2026-01-01Z"), endDate: new Date("2026-12-31Z") } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2027, label: "2027", status: "DRAFT" } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic learner", rollNo: "1", gender: "OTHER", enrollmentDate: new Date("2026-01-01Z") } });
  const invoice = await db.invoice.create({ data: { schoolId, campusId, studentId, invoiceDate: new Date("2026-10-01Z"), dueDate: new Date("2026-10-15Z"), monthlyFee: 10000, subtotal: 10000, totalAmount: 10000, balanceDue: 10000, currency: "PKR" } });
  const account = await db.chartOfAccount.create({ data: { schoolId, campusId, name: "Supplies", type: "EXPENSE" } }), bank = await db.bankAccount.create({ data: { schoolId, campusId, name: "School bank", currency: "PKR", openingBalance: 100000 } });
  const user: AuthUser = { userId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid`, accessVersion: 0 };
  return { schoolId, campusId, classId, studentId, invoice, account, bank, user };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function school(run: (f: Fixture) => Promise<void>) { const f = await fixture(); try { await run(f); } finally { await db.school.delete({ where: { id: f.schoolId } }); } }
const base = { operation: "finance.apply_operation" as const, currency: "PKR" as const, reason: "Verified synthetic evidence" };
const payment = (f: Fixture, amount = 10000): FinanceOperationProposal => ({ ...base, action: "PAYMENT", invoiceId: f.invoice.id, amount, date: "2026-10-13", method: "CASH", reference: randomUUID() });
async function approved(f: Fixture, proposal: FinanceOperationProposal, reviewer = f.user) { const record = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", campusId: f.campusId, title: proposal.action, idempotencyKey: randomUUID(), data: { goal: "Reviewed finance", steps: [{ id: "finance", title: "Review exact effects", status: "ready", module: "accounts" }], sourceIds: [], missingInformation: [], proposal } }); return updateWorkspaceRecord(reviewer, record.id, { action: "approve", version: record.version }); }
const input = (p: FinanceOperationsPreview, key = randomUUID()) => ({ operation: "finance.apply_operation" as const, version: p.version, previewHash: p.previewHash, idempotencyKey: key });
async function execute(f: Fixture, proposal: FinanceOperationProposal) { const record = await approved(f, proposal), preview = await previewSchoolAiExecution(f.user, record.id, "finance.apply_operation", record.version), request = input(preview), receipt = await executeSchoolAiTool(f.user, record.id, request); return { record, preview, request, receipt }; }

test("reviewed collection conserves invoice balance, carries excess once, posts cash once and retries exactly", () => school(async f => {
  const result = await execute(f, payment(f, 12000)); assert.deepEqual(await executeSchoolAiTool(f.user, result.record.id, result.request), result.receipt);
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: f.invoice.id } }); assert.equal(invoice.balanceDue, 0); assert.equal(invoice.totalAmountPaid, 10000);
  assert.equal((await db.feeCarryForward.findFirstOrThrow({ where: { studentId: f.studentId } })).balance, -2000);
  assert.equal(await db.payment.count({ where: { schoolId: f.schoolId } }), 1); assert.equal(await db.ledgerEntry.count({ where: { schoolId: f.schoolId } }), 1); assert.equal(await db.paymentReceipt.count({ where: { schoolId: f.schoolId } }), 1);
  assert.equal(await db.parentCommunication.count({ where: { schoolId: f.schoolId } }), 0);
}));
test("partial refund compensates allocated cash and unused credit while preserving the original receipt", () => school(async f => {
  const collected = await execute(f, payment(f, 12000)), paymentId = collected.receipt.createdIds[0], original = await db.paymentReceipt.findUniqueOrThrow({ where: { paymentId } });
  const refund = await execute(f, { ...base, action: "REFUND", paymentId, invoiceAmount: 3000, creditAmount: 1000, date: "2026-10-14", reference: "refund-1" });
  assert.equal(refund.receipt.action, "REFUND"); const invoice = await db.invoice.findUniqueOrThrow({ where: { id: f.invoice.id } }); assert.equal(invoice.totalAmountPaid, 7000); assert.equal(invoice.balanceDue, 3000);
  assert.equal((await db.feeCarryForward.findFirstOrThrow({ where: { studentId: f.studentId } })).balance, -1000);
  assert.deepEqual((await db.paymentReceipt.findUniqueOrThrow({ where: { paymentId } })).snapshot, original.snapshot);
  assert.equal((await db.ledgerEntry.aggregate({ where: { schoolId: f.schoolId }, _sum: { amount: true } }))._sum.amount, 8000);
  const record = await approved(f, { ...base, action: "REFUND", paymentId, invoiceAmount: 8000, creditAmount: 0, date: "2026-10-14", reference: "refund-too-much" });
  await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "finance.apply_operation", record.version), { code: "FINANCE_REFUND_EXCEEDS" });
}));
test("refund respects separately approved policy and refuses consumed credit", () => school(async f => {
  const collected = await execute(f, payment(f, 12000)), p: FinanceOperationProposal = { ...base, action: "REFUND", paymentId: collected.receipt.createdIds[0], invoiceAmount: 0, creditAmount: 2000, date: "2026-10-14", reference: "refund-1" };
  await db.school.update({ where: { id: f.schoolId }, data: { correctionSeparateApprover: true } });
  const self = await approved(f, p); await assert.rejects(() => previewSchoolAiExecution(f.user, self.id, "finance.apply_operation", self.version), { code: "FINANCE_SEPARATE_APPROVER" });
  const reviewerId = randomUUID(); await db.user.create({ data: { id: reviewerId, schoolId: f.schoolId, campusId: f.campusId, role: "CAMPUS_ADMIN", fullName: "Second reviewer", email: `${reviewerId}@example.invalid` } }); const reviewer = { ...f.user, userId: reviewerId };
  const record = await approved(f, p, reviewer), preview = await previewSchoolAiExecution(reviewer, record.id, "finance.apply_operation", record.version); assert.equal(preview.separateApprover, true);
  await db.feeCarryForward.updateMany({ where: { studentId: f.studentId }, data: { balance: 0 } }); await assert.rejects(() => executeSchoolAiTool(reviewer, record.id, input(preview)), { code: "FINANCE_CREDIT_CONSUMED" });
}));
test("invoice credit reduces only unpaid balance and cannot consume already paid money", () => school(async f => {
  await execute(f, payment(f, 4000)); const result = await execute(f, { ...base, action: "CREDIT", invoiceId: f.invoice.id, amount: 5000 });
  assert.equal(result.receipt.action, "CREDIT"); const invoice = await db.invoice.findUniqueOrThrow({ where: { id: f.invoice.id } }); assert.equal(invoice.totalAmount, 5000); assert.equal(invoice.balanceDue, 1000); assert.equal(invoice.totalAmountPaid, 4000); assert.equal(invoice.discountAmount, 5000);
  const record = await approved(f, { ...base, action: "CREDIT", invoiceId: f.invoice.id, amount: 1001 }); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "finance.apply_operation", record.version), { code: "FINANCE_CREDIT_EXCEEDS" });
}));
test("historical opening balances are explicit and never overwrite billed or imported years", () => school(async f => {
  const proposal: FinanceOperationProposal = { ...base, action: "OPENING_BALANCE", studentId: f.studentId, academicYear: 2027, amount: -1500, sourceReference: "Legacy signed ledger page 3" };
  const result = await execute(f, proposal); assert.equal((await db.feeCarryForward.findUniqueOrThrow({ where: { id: result.receipt.createdIds[0] } })).balance, -1500);
  for (const p of [proposal, { ...proposal, academicYear: 2026 }]) { const record = await approved(f, p); await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "finance.apply_operation", record.version), { code: "FINANCE_OPENING_EXISTS" }); }
}));
test("expense and bank reconciliation retain exact evidence, signs, currency and duplicate period protection", () => school(async f => {
  const expense = await execute(f, { ...base, action: "EXPENSE", accountId: f.account.id, bankAccountId: f.bank.id, amount: 2000, date: "2026-10-13", reference: "expense-1", sourceName: "Books" });
  const proposal: FinanceOperationProposal = { ...base, action: "RECONCILE", bankAccountId: f.bank.id, from: "2026-10-01", to: "2026-10-31", openingBalance: 100000, closingBalance: 98000, rows: [{ ledgerId: expense.receipt.createdIds[0], date: "2026-10-13", amount: -2000, reference: "bank-line-1" }] };
  const result = await execute(f, proposal), reconciliation = await db.bankReconciliation.findUniqueOrThrow({ where: { id: result.receipt.createdIds[0] } }); assert.equal(reconciliation.matchedCount, 1); assert.equal(reconciliation.status, "reconciled");
  await assert.rejects(() => deleteUnreconciledManualLedgerEntry(f.user, expense.receipt.createdIds[0]), { status: 409 });
  const duplicate = await approved(f, proposal); await assert.rejects(() => previewSchoolAiExecution(f.user, duplicate.id, "finance.apply_operation", duplicate.version), { code: "FINANCE_STATEMENT_EXISTS" });
}));
test("statement gaps and stale ledger edits cannot be silently reconciled", () => school(async f => {
  const expense = await execute(f, { ...base, action: "EXPENSE", accountId: f.account.id, bankAccountId: f.bank.id, amount: 2000, date: "2026-10-13", reference: "expense-1", sourceName: "Books" });
  const proposal: FinanceOperationProposal = { ...base, action: "RECONCILE", bankAccountId: f.bank.id, from: "2026-10-01", to: "2026-10-31", openingBalance: 100000, closingBalance: 98000, rows: [{ ledgerId: expense.receipt.createdIds[0], date: "2026-10-13", amount: -2000, reference: "bank-line-1" }] };
  const record = await approved(f, proposal), preview = await previewSchoolAiExecution(f.user, record.id, "finance.apply_operation", record.version);
  await db.ledgerEntry.update({ where: { id: expense.receipt.createdIds[0] }, data: { amount: 2001 } }); await assert.rejects(() => executeSchoolAiTool(f.user, record.id, input(preview)), { code: "FINANCE_STATEMENT_MISMATCH" }); assert.equal(await db.bankReconciliation.count({ where: { schoolId: f.schoolId } }), 0);
}));
test("forecast saves assumptions and evidence without posting money or creating invoices", () => school(async f => {
  const before = await db.invoice.count({ where: { schoolId: f.schoolId } });
  const result = await execute(f, { ...base, action: "SCENARIO", from: "2026-10-01", to: "2026-10-31", months: 12, feeGrowthBps: 0, collectionBps: 9000, expenseGrowthBps: 0 });
  assert.equal(result.receipt.effects.find(row => row.label === "billed")?.after, 10000); assert.equal(result.receipt.effects.find(row => row.label === "overdue")?.after, 1); assert.deepEqual(result.receipt.createdIds, []);
  assert.equal(await db.invoice.count({ where: { schoolId: f.schoolId } }), before); assert.equal(await db.ledgerEntry.count({ where: { schoolId: f.schoolId } }), 0);
}));
test("scope and fresh financial permissions protect options, previews, writes and receipt history", () => school(async f => {
  const result = await execute(f, payment(f, 1000));
  for (const moduleName of ["fees", "accounts", "ai"]) { const grant = await db.rolePermission.create({ data: { schoolId: f.schoolId, role: f.user.role, module: moduleName, canView: false, canAdd: true, canEdit: true } }); try { await assert.rejects(() => getFinanceOperationsOptions(f.user, f.campusId), { status: 403 }); await assert.rejects(() => executeSchoolAiTool(f.user, result.record.id, result.request), { status: 403 }); await assert.rejects(() => listSchoolAiExecutions(f.user, result.record.id), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); } }
  await assert.rejects(() => getFinanceOperationsOptions(f.user, randomUUID()), { status: 403 });
  await db.user.update({ where: { id: f.user.userId }, data: { accessVersion: 1 } }); await assert.rejects(() => getFinanceOperationsOptions(f.user, f.campusId), { status: 403 });
}));
test("concurrent exact plans and duplicate transaction references cannot double collect", () => school(async f => {
  const p = payment(f, 1000), records = await Promise.all([approved(f, p), approved(f, p)]), previews = await Promise.all(records.map(record => previewSchoolAiExecution(f.user, record.id, "finance.apply_operation", record.version)));
  const results = await Promise.allSettled(records.map((record, index) => executeSchoolAiTool(f.user, record.id, input(previews[index])))); assert.equal(results.filter(row => row.status === "fulfilled").length, 1); assert.equal(await db.payment.count({ where: { schoolId: f.schoolId } }), 1);
}));

test("existing payment correction cannot rewrite a reconciled bank period", () => school(async f => {
  const collected = await execute(f, { ...payment(f, 10000), bankAccountId: f.bank.id } as FinanceOperationProposal), paymentId = collected.receipt.createdIds[0];
  const scoped = <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId: f.schoolId, campusId: f.campusId, userId: f.user.userId, role: f.user.role }, fn);
  const { items: [original] } = await scoped(() => catalog(f.user, "PAYMENT"));
  const proposal = { kind: "PAYMENT" as const, sourceId: paymentId, expectedVersion: original.version, allocations: [{ invoiceId: f.invoice.id, minor: 1000 }], unappliedMinor: 0 };
  const preview = await schoolAiTransaction(f.user, tx => correctionPreview(tx, f.user, proposal));
  const correction = await scoped(() => requestCorrection(f.user, proposal, preview.hash, { reason: "Returned overcollection", publicExplanation: "Refund approved" }));
  const ledger = await db.ledgerEntry.findUniqueOrThrow({ where: { paymentId } });
  const today = new Date().toISOString().slice(0, 10);
  await db.bankReconciliation.create({ data: { schoolId: f.schoolId, campusId: f.campusId, bankAccount: f.bank.id, importDate: new Date(), statementPeriodFrom: new Date(today + "T00:00:00Z"), statementPeriodTo: new Date(today + "T00:00:00Z"), status: "reconciled", reconciliationDetailsJson: { rows: [{ ledgerId: ledger.id }] } } });
  await assert.rejects(() => scoped(() => decideCorrection(f.user, correction.id, "APPLIED", correction.previewHash)), { code: "FINANCE_PERIOD_CLOSED" });
  assert.equal((await db.correction.findUniqueOrThrow({ where: { id: correction.id } })).status, "PENDING"); assert.equal(await db.payment.count({ where: { schoolId: f.schoolId } }), 1);
}));
