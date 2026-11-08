import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { observeHandoffs, claimHandoff } from "../../src/lib/ai-workflows/executor/handoff";
import { defineCapability } from "../../src/lib/ai-workflows/registry/define";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import { FINANCE_MONEY_ENTRIES } from "../../src/lib/ai-workflows/registry/domains/finance/money";
import type { HandoffEntry, HandoffPrepared } from "../../src/lib/ai-workflows/registry/types";
import { collectPaymentCore } from "../../src/lib/fees/collect-command";
import { PLATFORM_DEFAULT_DELIVERY_POLICY, DELIVERY_POLICY_KIND } from "../../src/lib/school-ai/delivery-policy";
import { scanForPII } from "../../src/lib/ai/pseudonymize";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * Money hand-offs and the Collect desk hardening (red team RT6), exercised directly until the lead wires the
 * entries into the registry: each hand-off writes no money row; a prepared collection posts once, only through
 * its own claimed hand-off; separation of duties targets someone other than the requester; and no account
 * number or IBAN reaches a prefill or detail.
 */
const entry = (key: string) => FINANCE_MONEY_ENTRIES.find(item => item.key === key) as HandoffEntry<any>;
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? `${error.code}${error.params.reason ? `:${error.params.reason}` : ""}` : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : (error as { status?: number; code?: string }).status ? `${(error as { status: number }).status}:${(error as { code?: string }).code ?? ""}` : `THROWN:${(error as Error).message}`; } };

async function staff(schoolId: string, campusId: string, role: AuthUser["role"], name = `Synthetic ${role.toLowerCase()}`): Promise<AuthUser> {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: name, role, isActive: true } });
  return { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, fullName: name, accessVersion: 0 };
}

async function fixture() {
  const schoolId = `money-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic money school", contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  const accountant = await staff(schoolId, campusId, "ACCOUNTANT", "Synthetic accountant");
  const admin = await staff(schoolId, campusId, "CAMPUS_ADMIN", "Synthetic campus admin");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "7", section: "B", academicYear: 2026, status: "ACTIVE" } });
  const pupil = async (fullName: string, rollNo: string) => db.student.create({ data: { schoolId, campusId, classId, fullName, rollNo, gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
  const invoice = (studentId: string, month: string, amount = 1_500_000) => db.invoice.create({ data: { schoolId, campusId, studentId, invoiceDate: new Date(`${month}-01T00:00:00Z`), dueDate: new Date(`${month}-10T00:00:00Z`), currency: "PKR", invoiceNumber: `INV-2026-SYN-${String(Math.floor(Math.random() * 90000) + 10000)}`, monthlyFee: amount, subtotal: amount, totalAmount: amount, balanceDue: amount } });
  const ali = await pupil("Ali Raza", "12"), sara = await pupil("Sara Khan", "13");
  const october = await invoice(ali.id, "2026-10"), saraOctober = await invoice(sara.id, "2026-10");
  return { schoolId, campusId, classId, accountant, admin, ali, sara, october, saraOctober, invoice };
}

const ctxFor = (user: AuthUser) => capabilityContext(user, user.campusId, "en");

/** Resolve and prepare one hand-off entry inside the actor's tenant, the way runHandoffStep does. */
async function prepare(user: AuthUser, key: string, input: unknown) {
  return inTenant(user, async () => {
    const ctx = await ctxFor(user);
    const item = entry(key);
    const parsed = item.input.parse(input);
    const bound = item.input.parse(item.resolve ? await item.resolve(ctx, parsed) : parsed);
    return { bound, prepared: await item.handoff.prepare(ctx, bound, { idempotencyKey: `wf-${randomUUID()}` }) };
  });
}

/** Stores the prepared hand-off on a job and step exactly as step-runner's openHandoff does. */
async function open(user: AuthUser, capabilityKey: string, prepared: HandoffPrepared) {
  const job = await db.aiWorkflowJob.create({ data: { schoolId: user.schoolId, campusId: user.campusId, actorId: user.userId, actorRole: user.role, accessVersion: 0, origin: "FREEFORM", language: "en", requestHash: "a".repeat(64), idempotencyKey: `job-${randomUUID()}`, status: "WAITING_HANDOFF", budget: {}, expiresAt: new Date(Date.now() + 86_400_000) } });
  const step = await db.aiWorkflowStep.create({ data: { schoolId: user.schoolId, campusId: user.campusId, jobId: job.id, planVersion: 1, stepKey: "s1", capabilityKey, capabilityVersion: 1, staticClass: "C", effectiveClass: "C", status: "WAITING_HANDOFF", modelInput: {}, idempotencyKey: `step-${randomUUID()}` } });
  return db.aiWorkflowHandoff.create({ data: {
    schoolId: user.schoolId, campusId: user.campusId, jobId: job.id, stepId: step.id, kind: prepared.kind, targetRoute: prepared.link, targetRoles: [...prepared.targetRoles],
    originRole: user.role, originUserId: user.userId, prefill: prepared.prefill as Prisma.InputJsonValue, idempotencyKey: `h-${randomUUID()}`, expiresAt: new Date(Date.now() + 14 * 86_400_000),
  } });
}

const collect = (user: AuthUser, body: Record<string, unknown>) => inTenant(user, () => collectPaymentCore(user, { paymentMethod: "CASH", paymentDate: "2026-10-20", idempotencyKey: `col-${randomUUID()}`, ...body }));
const claim = (user: AuthUser, id: string) => inTenant(user, () => claimHandoff(user, id));
async function moneyRows(schoolId: string) {
  const [payments, adjustments, plans, invoices, reconciliations, payroll, ledger] = await Promise.all([
    db.payment.count({ where: { schoolId } }), db.financialAdjustment.count({ where: { schoolId } }), db.paymentPlan.count({ where: { schoolId } }), db.invoice.count({ where: { schoolId } }),
    db.bankReconciliation.count({ where: { schoolId } }), db.payrollCalculation.count({ where: { schoolId } }), db.ledgerEntry.count({ where: { schoolId } }),
  ]);
  return { payments, adjustments, plans, invoices, reconciliations, payroll, ledger };
}
const IBAN_OR_ACCOUNT = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}|\b\d{10,18}\b/;

test("money entries define as class C hand-offs with the finance desk's roles and the accountant seat gate", () => {
  assert.deepEqual(FINANCE_MONEY_ENTRIES.map(item => [item.key, item.class, item.risk, item.class === "C" ? item.handoff.kind : null]), [
    ["fees.collect_payment", "C", "FINANCIAL", "DOMAIN_SCREEN"], ["fees.request_adjustment", "C", "FINANCIAL", "DOMAIN_REQUEST"],
    ["fees.generate_monthly_invoices", "C", "FINANCIAL", "DOMAIN_SCREEN"], ["fees.propose_payment_plan", "C", "FINANCIAL", "DOMAIN_SCREEN"],
    ["tax.request_signoff", "C", "UPDATE", "DOMAIN_SCREEN"], ["imports.commit_bank_statement", "C", "FINANCIAL", "DEEP_LINK"],
    ["fees.post_bank_reconciliation", "C", "FINANCIAL", "DOMAIN_SCREEN"], ["payroll.prepare_run", "C", "FINANCIAL", "ROLE_TASK"],
  ]);
  for (const item of FINANCE_MONEY_ENTRIES) {
    assert.ok(!("execute" in item) || item.execute === undefined, `${item.key} never executes`);
    assert.ok(item.gates.some(gate => gate.id === "seat:accountant"), `${item.key} carries the accountant seat gate`);
    assert.ok(item.copy.examples.ur[0] && /[؀-ۿ]/.test(item.copy.examples.ur[0]), `${item.key} has an Urdu example in Urdu script`);
    defineCapability(item);
  }
});

test("collect: binds the invoice by pupil and month, masks its number, prepares the Collect desk and writes no money row", async () => {
  const f = await fixture();
  const before = await moneyRows(f.schoolId);
  const { bound, prepared } = await prepare(f.accountant, "fees.collect_payment", { student: "Ali Raza", month: "2026-10", amount: 12_500, method: "CASH" });
  assert.equal(bound.student, "Ali Raza");
  assert.deepEqual(prepared.prefill, { invoiceId: f.october.id, studentId: f.ali.id, amount: 1_250_000, currency: "PKR", method: "CASH" });
  assert.deepEqual([...prepared.targetRoles], ["ACCOUNTANT"]);
  assert.match(prepared.link, /^\/accountant\?view=payments&tab=payments/);
  assert.equal(prepared.detail?.invoice, `INV-…-${f.october.invoiceNumber!.slice(-5)}`);
  assert.ok(!JSON.stringify(prepared).includes(f.october.invoiceNumber!), "the full invoice number never appears");
  assert.deepEqual(await moneyRows(f.schoolId), before);
  // No invoice for the month is a refusal, an unknown pupil a question.
  assert.equal(await code(prepare(f.accountant, "fees.collect_payment", { student: "Ali Raza", month: "2026-07", amount: 100 })), "DOMAIN_REFUSED:NO_PAYABLE_INVOICE");
  assert.equal(await code(prepare(f.accountant, "fees.collect_payment", { student: "Zainab Noor", month: "2026-10", amount: 100 })), "INPUT:/student");
  // Two invoices and no month: the question names the months.
  await f.invoice(f.ali.id, "2026-11");
  assert.equal(await code(prepare(f.accountant, "fees.collect_payment", { student: "Ali", amount: 100 })), "INPUT:/month");
});

test("collect: two claimers give one payment; the second post from the same hand-off is a 409 from the unique index", async () => {
  const f = await fixture();
  const { prepared } = await prepare(f.accountant, "fees.collect_payment", { student: "Ali Raza", month: "2026-10", amount: 5_000 });
  const handoff = await open(f.accountant, "fees.collect_payment", prepared);
  // A second accountant cannot take the claim while it is held: "Being handled by …".
  const second = await staff(f.schoolId, f.campusId, "ACCOUNTANT", "Second accountant");
  await claim(f.accountant, handoff.id);
  assert.equal(await code(claim(second, handoff.id)), "LEASED");
  // Two devices of the claimer post at once with different operation keys: one payment.
  const body = { studentId: f.ali.id, invoiceId: f.october.id, amount: 500_000, workflowHandoffId: handoff.id };
  const outcomes = await Promise.all([code(collect(f.accountant, body)), code(collect(f.accountant, body))]);
  assert.deepEqual(outcomes.sort(), ["409:HANDOFF_ALREADY_POSTED", "OK"].sort());
  const payments = await db.payment.findMany({ where: { invoiceId: f.october.id } });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].workflowHandoffId, handoff.id);
  // The lease expires and the second accountant claims and posts again: still refused, still one payment.
  await db.aiWorkflowHandoff.update({ where: { id: handoff.id }, data: { claimExpiresAt: new Date(Date.now() - 1000) } });
  await claim(second, handoff.id);
  assert.match(await code(collect(second, body)), /^409:/);
  assert.equal(await db.payment.count({ where: { invoiceId: f.october.id } }), 1);
  // Once posted the prepared collection no longer blocks the desk: a later payment typed by hand goes through.
  assert.equal(await code(collect(f.accountant, { studentId: f.ali.id, invoiceId: f.october.id, amount: 1_000 })), "OK");
});

test("collect: a payment typed directly on Collect while a prepared hand-off is open is refused", async () => {
  const f = await fixture();
  const { prepared } = await prepare(f.accountant, "fees.collect_payment", { student: "Ali Raza", month: "2026-10", amount: 5_000 });
  const handoff = await open(f.accountant, "fees.collect_payment", prepared);
  assert.equal(await code(collect(f.accountant, { studentId: f.ali.id, invoiceId: f.october.id, amount: 500_000 })), "409:PREPARED_COLLECTION_OPEN");
  assert.equal(await code(collect(f.admin, { studentId: f.ali.id, invoiceId: f.october.id, amount: 500_000 })), "409:PREPARED_COLLECTION_OPEN");
  // Unclaimed, the hand-off id alone is not enough.
  assert.equal(await code(collect(f.accountant, { studentId: f.ali.id, invoiceId: f.october.id, amount: 500_000, workflowHandoffId: handoff.id })), "409:HANDOFF_NOT_CLAIMED");
  assert.equal(await db.payment.count({ where: { schoolId: f.schoolId } }), 0);
  // A second prepared collection for the same invoice is refused while the first is open.
  assert.equal(await code(prepare(f.accountant, "fees.collect_payment", { student: "Ali Raza", month: "2026-10", amount: 5_000 })), "DOMAIN_REFUSED:COLLECTION_ALREADY_PREPARED");
  // Another invoice is untouched by it.
  assert.equal(await code(collect(f.accountant, { studentId: f.sara.id, invoiceId: f.saraOctober.id, amount: 1_000 })), "OK");
});

test("collect: a forged hand-off id for an unrelated invoice is a 409 and posts nothing", async () => {
  const f = await fixture();
  const { prepared } = await prepare(f.accountant, "fees.collect_payment", { student: "Sara Khan", month: "2026-10", amount: 2_000 });
  const saraHandoff = await open(f.accountant, "fees.collect_payment", prepared);
  await claim(f.accountant, saraHandoff.id);
  assert.equal(await code(collect(f.accountant, { studentId: f.ali.id, invoiceId: f.october.id, amount: 200_000, workflowHandoffId: saraHandoff.id })), "409:HANDOFF_NOT_OPEN");
  assert.equal(await code(collect(f.accountant, { studentId: f.ali.id, invoiceId: f.october.id, amount: 200_000, workflowHandoffId: randomUUID() })), "409:HANDOFF_NOT_OPEN");
  // A reminder hand-off that happens to name the same invoice does not authorise a collection.
  const reminder = await open(f.accountant, "fees.send_due_reminder", { kind: "DOMAIN_SCREEN", targetRoles: ["ACCOUNTANT"], link: "/accountant?view=fee-reports", prefill: { invoiceId: f.october.id, studentId: f.ali.id } });
  await claim(f.accountant, reminder.id);
  assert.equal(await code(collect(f.accountant, { studentId: f.ali.id, invoiceId: f.october.id, amount: 200_000, workflowHandoffId: reminder.id })), "409:HANDOFF_NOT_OPEN");
  assert.equal(await db.payment.count({ where: { schoolId: f.schoolId } }), 0);
});

test("separation of duties: with a second person required the hand-off targets an eligible colleague, never the requester", async () => {
  const f = await fixture();
  const record = await db.schoolAiRecord.create({ data: { schoolId: f.schoolId, campusId: f.campusId, kind: DELIVERY_POLICY_KIND, title: "Delivery policy", status: "APPROVED", data: {}, createdById: f.admin.userId, updatedById: f.admin.userId, idempotencyKey: `dp-${randomUUID()}`, requestHash: "b".repeat(64) } });
  await db.schoolAiRevision.create({ data: { schoolId: f.schoolId, campusId: f.campusId, recordId: record.id, version: 1, action: "APPROVE", title: "Delivery policy", status: "APPROVED", actorId: f.admin.userId, data: { ...PLATFORM_DEFAULT_DELIVERY_POLICY, separationOfDuties: "REQUIRED" } as unknown as Prisma.InputJsonValue } });
  const { prepared } = await prepare(f.accountant, "fees.collect_payment", { student: "Ali Raza", month: "2026-10", amount: 5_000 });
  assert.equal(prepared.detail?.separation, "REQUIRED");
  assert.deepEqual([...prepared.targetRoles], ["CAMPUS_ADMIN"]);
  assert.deepEqual(prepared.detail?.approverIds, [f.admin.userId]);
  assert.ok(!(prepared.detail?.approverIds as string[]).includes(f.accountant.userId));
  assert.match(prepared.link, /^\/admin\?view=fees&tab=payments/);
  const handoff = await open(f.accountant, "fees.collect_payment", prepared);
  assert.equal(await code(claim(f.accountant, handoff.id)), "NOT_FOUND", "the requester's role is not targeted");
  await claim(f.admin, handoff.id);
  assert.equal(await code(collect(f.admin, { studentId: f.ali.id, invoiceId: f.october.id, amount: 500_000, workflowHandoffId: handoff.id })), "OK");
  // With a colleague in the requester's own role, the claim is possible but the Collect command still refuses the requester.
  const { prepared: again } = await prepare(f.accountant, "fees.collect_payment", { student: "Sara Khan", month: "2026-10", amount: 1_000 });
  const forced = await open(f.accountant, "fees.collect_payment", { ...again, targetRoles: ["ACCOUNTANT"] });
  await claim(f.accountant, forced.id);
  assert.equal(await code(collect(f.accountant, { studentId: f.sara.id, invoiceId: f.saraOctober.id, amount: 100_000, workflowHandoffId: forced.id })), "409:HANDOFF_SEPARATION");
  // Nobody else on the campus: refused, with who can.
  await db.user.update({ where: { id: f.admin.userId }, data: { isActive: false } });
  assert.equal(await code(prepare(f.accountant, "fees.generate_monthly_invoices", { month: "2026-12" })), "DOMAIN_REFUSED:NO_ELIGIBLE_APPROVER");
});

test("adjustments, invoice runs, plans, tax, statements, reconciliations and payroll prepare hand-offs and write no money row", async () => {
  const f = await fixture();
  // A payment to refund, posted directly before any hand-off exists.
  await collect(f.accountant, { studentId: f.ali.id, invoiceId: f.october.id, amount: 600_000 });
  const before = await moneyRows(f.schoolId);

  const refund = await prepare(f.accountant, "fees.request_adjustment", { kind: "REFUND", student: "Ali Raza", month: "2026-10", amount: 5_000, reason: "Paid the transport fee twice" });
  assert.equal(refund.prepared.kind, "DOMAIN_REQUEST");
  assert.equal(refund.prepared.detail?.completesWith, "financialAdjustment.workflowHandoffId");
  assert.deepEqual(refund.prepared.detail?.approverIds, [f.admin.userId], "the campus admin decides, not the requester");
  assert.ok(typeof refund.prepared.prefill.paymentId === "string");
  assert.equal(await code(prepare(f.accountant, "fees.request_adjustment", { kind: "WAIVER", student: "Sara Khan", month: "2026-10", amount: 99_999, reason: "Hardship waiver" })), "DOMAIN_REFUSED:ADJUSTMENT_EXCEEDS_BALANCE");

  const run = await prepare(f.accountant, "fees.generate_monthly_invoices", { month: "2026-11" });
  assert.deepEqual(run.prepared.prefill, { generationMonth: "2026-11", includeLateFees: true });
  assert.deepEqual([run.prepared.detail?.pupils, run.prepared.detail?.toInvoice, run.prepared.detail?.classesWithoutFeeGroup], [2, 2, 1]);
  assert.equal(await code(prepare(f.accountant, "fees.generate_monthly_invoices", { month: "2026-10" })), "DOMAIN_REFUSED:ALREADY_INVOICED");

  const plan = await prepare(f.accountant, "fees.propose_payment_plan", { student: "Sara Khan", month: "2026-10", instalments: 3, firstDueDate: "2099-11-10" });
  const instalments = plan.prepared.prefill.installments as Array<{ amount: number; dueDate: string }>;
  assert.deepEqual(instalments.map(row => row.dueDate), ["2099-11-10", "2099-12-10", "2100-01-10"]);
  assert.equal(instalments.reduce((sum, row) => sum + row.amount, 0), f.saraOctober.balanceDue);
  assert.equal(await code(prepare(f.accountant, "fees.propose_payment_plan", { student: "Sara Khan", month: "2026-10", instalments: 3, firstDueDate: "2020-01-01" })), "DOMAIN_REFUSED:PLAN_INVALID");

  assert.equal(await code(prepare(f.accountant, "tax.request_signoff", {})), "DOMAIN_REFUSED:NO_TAX_DRAFT");
  await db.taxActivation.create({ data: { schoolId: f.schoolId, packageCode: "PK-DEMO", packageVersion: 1, campusIds: [f.campusId], legalName: "Synthetic Money School", currency: "PKR", configHash: "c".repeat(64), preparedById: f.accountant.userId } });
  assert.equal(await code(prepare(f.accountant, "tax.request_signoff", { package: "PK-DEMO" })), "DOMAIN_REFUSED:NO_ELIGIBLE_APPROVER", "no institution authority to sign it off");
  const authority = await staff(f.schoolId, f.campusId, "ADMIN", "Synthetic school admin");
  const tax = await prepare(f.accountant, "tax.request_signoff", { package: "pk demo" });
  assert.equal(tax.prepared.prefill.action, "request-signoff");
  assert.deepEqual([tax.prepared.detail?.decidedBy, tax.prepared.detail?.approverIds], [["SUPER_ADMIN", "ADMIN"], [authority.userId]]);

  assert.equal(await code(prepare(f.accountant, "imports.commit_bank_statement", {})), "DOMAIN_REFUSED:NO_STAGED_STATEMENT");
  const batch = await db.importBatch.create({ data: { schoolId: f.schoolId, campusId: f.campusId, kind: "BANK_STATEMENT", fingerprint: randomUUID(), targetScope: "fees", sourceName: "statement-PK36SCBL0000001123456702.csv", state: "STAGED", createdById: f.accountant.userId, expiresAt: new Date(Date.now() + 86_400_000),
    data: { rows: [{ rowNumber: 1, state: "ACCEPTED", selected: true, proposal: { matchedInvoiceId: f.saraOctober.id, amountMinor: 1000 } }, { rowNumber: 2, state: "UNRESOLVED", selected: false }], metadata: { accountName: "HBL 0123456789012", statementFrom: "2026-10-01", statementTo: "2026-10-31" }, summary: {} } } });
  const statement = await prepare(f.accountant, "imports.commit_bank_statement", { month: "2026-10" });
  assert.deepEqual(statement.prepared.prefill, { batchId: batch.id });
  assert.deepEqual([statement.prepared.detail?.selected, statement.prepared.detail?.unresolved], [1, 1]);

  const rec = await db.bankReconciliation.create({ data: { schoolId: f.schoolId, campusId: f.campusId, importDate: new Date(), bankAccount: "HBL PK36SCBL0000001123456702", statementPeriodFrom: new Date("2026-10-01Z"), statementPeriodTo: new Date("2026-10-31Z"), totalTransactions: 1, matchedCount: 1, unmatchedCount: 0, reconciliationDetailsJson: [{ rowNumber: 1, amountMinor: 1000, matchedInvoiceId: f.saraOctober.id }], unmatchedJson: [], status: "pending" } });
  const reconciliation = await prepare(f.accountant, "fees.post_bank_reconciliation", {});
  assert.deepEqual(reconciliation.prepared.prefill, { reconciliationId: rec.id, action: "post" });
  assert.equal(reconciliation.prepared.detail?.matchedMinor, 1000);

  const payroll = await prepare(f.accountant, "payroll.prepare_run", { month: "2026-10" });
  assert.equal(payroll.prepared.kind, "ROLE_TASK");
  assert.deepEqual([...payroll.prepared.targetRoles], ["CAMPUS_ADMIN", "ADMIN"], "without a policy and mapping the campus admin sets payroll up first");
  assert.equal(payroll.prepared.detail?.step, "setup");

  const after = await moneyRows(f.schoolId);
  assert.deepEqual({ ...after, reconciliations: after.reconciliations - 1 }, before, "no hand-off writes a payment, adjustment, plan, invoice, posting, run or ledger entry");

  // No account number, IBAN or card pattern in any serialised prefill or detail.
  for (const prepared of [refund, run, plan, tax, statement, reconciliation, payroll].map(item => item.prepared)) {
    const serialised = JSON.stringify({ prefill: prepared.prefill, detail: prepared.detail, link: prepared.link });
    const ids = serialised.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>");
    assert.deepEqual(scanForPII(ids), [], `${prepared.link} carries no PII`);
    assert.doesNotMatch(ids, IBAN_OR_ACCOUNT);
  }
});

test("collect prefill and detail carry no account number or IBAN, even when the user typed one", async () => {
  const f = await fixture();
  const { prepared } = await prepare(f.accountant, "fees.collect_payment", { student: "Ali Raza", month: "2026-10", amount: 12_500, method: "BANK" });
  const serialised = JSON.stringify({ prefill: prepared.prefill, detail: prepared.detail, link: prepared.link }).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>");
  assert.deepEqual(scanForPII(serialised), []);
  assert.doesNotMatch(serialised, IBAN_OR_ACCOUNT);
  // The input itself has nowhere to put one: strict schemas refuse unknown fields.
  assert.throws(() => entry("fees.collect_payment").input.parse({ student: "Ali Raza", amount: 100, iban: "PK36SCBL0000001123456702" }));
  assert.throws(() => entry("fees.post_bank_reconciliation").input.parse({ accountNumber: "0123456789012" }));
});

test("a posted collection completes its hand-off: the step reads approved elsewhere with the payment as receipt", async () => {
  const f = await fixture();
  const { prepared } = await prepare(f.accountant, "fees.collect_payment", { student: "Ali Raza", month: "2026-10", amount: 5_000 });
  const handoff = await open(f.accountant, "fees.collect_payment", prepared);
  await claim(f.accountant, handoff.id);
  assert.equal(await code(collect(f.accountant, { studentId: f.ali.id, invoiceId: f.october.id, amount: 500_000, workflowHandoffId: handoff.id })), "OK");
  const job = await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: handoff.jobId } });
  assert.equal(await inTenant(f.accountant, () => observeHandoffs(job)), 1);
  const after = await db.aiWorkflowHandoff.findUniqueOrThrow({ where: { id: handoff.id } });
  assert.equal(after.status, "COMPLETED");
  assert.equal(after.completedModel, "payment");
  assert.equal((await db.aiWorkflowStep.findUniqueOrThrow({ where: { id: handoff.stepId } })).status, "HANDED_OFF_DONE");
  assert.equal(await inTenant(f.accountant, () => observeHandoffs(job)), 0, "observing again changes nothing");
});
