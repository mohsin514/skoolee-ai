import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { runGates } from "../../src/lib/ai-workflows/registry/gates";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import { checkEvidence } from "../../src/lib/ai-workflows/planner/evidence";
import { normalizeText } from "../../src/lib/ai-workflows/planner/normalize";
import { FINANCE_BOOKS_ENTRIES, bankAccountInput } from "../../src/lib/ai-workflows/registry/domains/finance/books";
import type { CapabilityContext, ExecEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * Accountant books, tax draft, discounts to pupils, payroll fields and the two money reads, exercised directly
 * (resolve → preview → execute) until the lead wires them into the registry.
 */
const exec = (key: string) => FINANCE_BOOKS_ENTRIES.find(item => item.key === key) as ExecEntry<any>;
const KEY = () => `wf-test-${randomUUID()}`;
const WRITES = ["accounts.create_account", "accounts.create_bank_account", "accounts.create_payment_method", "tax.save_package_draft", "fees.assign_discount", "payroll.set_employee_details"];

async function fixture(role: AuthUser["role"] = "ACCOUNTANT") {
  const schoolId = `books-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic books school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, regId: otherCampusId, name: "Other campus", city: "Test" } });
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi", country: "PK", currency: "PKR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: userId, financeReviewedBy: userId } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic finance", role, isActive: true } });
  const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, fullName: "Synthetic finance", accessVersion: 0 };
  return { user, schoolId, campusId, otherCampusId };
}
const ctxFor = (user: AuthUser, campusId: string | null) => capabilityContext(user, campusId, "en");
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? error.code : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : `THROWN:${(error as Error).message}`; } };

async function confirmRun(ctx: CapabilityContext, key: string, input: unknown) {
  const item = exec(key);
  const parsed = item.input.parse(input);
  const resolved = item.resolve ? await item.resolve(ctx, parsed) : parsed;
  const bound = item.input.parse(resolved);
  const preview = await item.preview!(ctx, bound);
  const receipt = await item.execute(ctx, bound, { idempotencyKey: KEY() });
  return { resolved: bound, preview, receipt };
}

async function pupils(schoolId: string, campusId: string) {
  const klass = await db.class.create({ data: { schoolId, campusId, name: "5", section: "A", academicYear: 2026, status: "ACTIVE" } });
  const make = (fullName: string, rollNo: string) => db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName, rollNo, gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } });
  return { klass, ali: await make("Ali Raza", "12"), sara: await make("Sara Raza", "13"), omar: await make("Omar Khan", "14") };
}

test("books entries define with their static classes, roles, evidence and seat gates", () => {
  assert.deepEqual(FINANCE_BOOKS_ENTRIES.map(item => [item.key, item.class, item.risk]), [
    ["accounts.create_account", "B", "CREATE"], ["accounts.create_bank_account", "B", "CREATE"], ["accounts.create_payment_method", "B", "CREATE"],
    ["tax.save_package_draft", "B", "CREATE"], ["fees.assign_discount", "B", "CREATE"], ["payroll.set_employee_details", "B", "UPDATE"],
    ["read.fees.defaulters", "A", "READ"], ["read.fees.collection_summary", "A", "READ"],
  ]);
  for (const item of FINANCE_BOOKS_ENTRIES) {
    assert.deepEqual([...item.roles], ["ACCOUNTANT", "ADMIN", "CAMPUS_ADMIN"]);
    if (WRITES.includes(item.key)) assert.ok(item.gates.some(gate => gate.id === "seat:accountant"), `${item.key} carries the accountant seat gate`);
  }
  assert.deepEqual(exec("fees.assign_discount").evidence, ["/discount", "/students/*/said"]);
  assert.deepEqual(exec("fees.assign_discount").humanFields, ["studentIds"]);
  assert.deepEqual(exec("payroll.set_employee_details").humanFields, ["userId"]);
});

test("the bank account input takes names only: no account number, IBAN or number-like name", () => {
  assert.ok(bankAccountInput.safeParse({ name: "Meezan Bank – Fees", bankName: "Meezan Bank" }).success);
  for (const extra of [{ accountNumber: "01234567890" }, { iban: "PK36SCBL0000001123456702" }, { IBAN: "PK36SCBL0000001123456702" }, { openingBalance: 100000 }, { cardNumber: "4111111111111111" }]) {
    assert.equal(bankAccountInput.safeParse({ name: "Meezan Bank – Fees", ...extra }).success, false, `refuses ${Object.keys(extra)[0]}`);
  }
  assert.equal(bankAccountInput.safeParse({ name: "Meezan 0123-4567-890" }).success, false, "a number hidden in the name is refused");
  assert.equal(bankAccountInput.safeParse({ name: "Fees", bankName: "PK36SCBL0000001123456702" }).success, false);
  const shape = Object.keys((bankAccountInput as unknown as { shape: Record<string, unknown> }).shape);
  assert.deepEqual(shape.sort(), ["bankName", "name"]);
});

test("each create works once and a replay reconciles without a second row", async () => {
  const { user, schoolId, campusId } = await fixture();
  await db.feeType.create({ data: { schoolId, campusId, name: "Transport", code: "TRANSPORT" } });
  const staffId = randomUUID();
  await db.user.create({ data: { id: staffId, schoolId, campusId, email: `${staffId}@example.invalid`, fullName: "Ayesha Khan", role: "TEACHER", isActive: true } });
  await db.payrollProvider.create({ data: { schoolId, campusId, code: "EOBI", name: "EOBI", version: 1, currencies: ["PKR"], columns: [], createdById: user.userId } });
  const { ali, sara } = await pupils(schoolId, campusId);
  await db.feeDiscount.create({ data: { schoolId, campusId, currency: "PKR", name: "Sibling discount", code: "SIBLING_DISCOUNT", type: "PERCENT", value: 10 } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const cases: Array<[string, unknown, () => Promise<number>]> = [
      ["accounts.create_account", { name: "Stationery", type: "EXPENSE" }, () => db.chartOfAccount.count({ where: { campusId } })],
      ["accounts.create_bank_account", { name: "Meezan Bank – Fees", bankName: "Meezan Bank" }, () => db.bankAccount.count({ where: { campusId } })],
      ["accounts.create_payment_method", { name: "JazzCash", kind: "WALLET" }, () => db.paymentMethodRef.count({ where: { campusId } })],
      ["tax.save_package_draft", { legalName: "Al Noor Education System", exemptFeeTypes: ["transport"] }, () => db.taxActivation.count({ where: { schoolId } })],
    ];
    for (const [key, input, count] of cases) {
      const first = await confirmRun(ctx, key, input);
      assert.equal(first.receipt.counts.created, 1, `${key} creates`);
      assert.equal(await count(), 1);
      const replay = await confirmRun(ctx, key, input);
      assert.equal(replay.receipt.counts.created, 0, `${key} replay creates nothing`);
      assert.equal((replay.receipt.detail as { reconciled?: boolean }).reconciled, true);
      assert.equal(replay.receipt.entities[0].id, first.receipt.entities[0].id);
      assert.equal(await count(), 1, `${key} still one row`);
    }
    // Reconciles on the name, folded; a different type under the same name is refused, never changed.
    assert.equal((await confirmRun(ctx, "accounts.create_account", { name: "stationery", type: "EXPENSE" })).receipt.counts.created, 0);
    assert.equal(await code(exec("accounts.create_account").resolve!(ctx, { name: "Stationery", type: "INCOME" })), "DOMAIN_REFUSED");
    const bank = await db.bankAccount.findFirstOrThrow({ where: { campusId } });
    assert.deepEqual([bank.accountNumber, bank.openingBalance, bank.currency], [null, 0, "PKR"], "no number, no balance from the AI");
    const bankRun = await confirmRun(ctx, "accounts.create_bank_account", { name: "HBL Fees" });
    assert.equal(bankRun.receipt.link, "/accountant?view=accounts&tab=banks");
    assert.ok(bankRun.preview.lines.some(line => /Accounts screen/.test(line.value)), "the preview says where the number goes");
    const draft = await db.taxActivation.findFirstOrThrow({ where: { schoolId } });
    assert.deepEqual([draft.status, draft.packageCode, draft.currency, draft.exemptFeeCodes, draft.campusIds, draft.taxId, draft.preparedById], ["DRAFT", "PK-DEMO", "PKR", ["TRANSPORT"], [campusId], null, user.userId]);
    assert.equal(await code(exec("tax.save_package_draft").resolve!(ctx, { legalName: "Another Legal Name" })), "DOMAIN_REFUSED", "a different draft is edited on the Tax screen");

    // Discounts to named pupils: bound by the server, once each.
    const discountInput = { discount: "sibling discount", students: [{ name: "ali", said: "Ali Raza" }, { name: "Sara Raza", said: "Sara Raza" }] };
    const given = await confirmRun(ctx, "fees.assign_discount", discountInput);
    assert.deepEqual(given.resolved.studentIds, [ali.id, sara.id]);
    assert.deepEqual(given.receipt.counts, { assigned: 2, alreadyAssigned: 0 });
    const again = await confirmRun(ctx, "fees.assign_discount", discountInput);
    assert.deepEqual(again.receipt.counts, { assigned: 0, alreadyAssigned: 2 });
    assert.equal(await db.feeDiscountAssignment.count({ where: { studentId: { in: [ali.id, sara.id] } } }), 2);
    assert.equal(await code(exec("fees.assign_discount").resolve!(ctx, { discount: "Sibling discount", students: [{ name: "Raza", said: "Raza" }] })), "INPUT:/students/0/name", "two Razas: a question, not a guess");

    // Payroll fields: provider id and last day only; a replay leaves approved runs alone.
    const employee = { employee: "Ayesha", providers: [{ provider: "eobi", employeeId: "E-1042" }], leavingDate: "2026-12-31" };
    const set = await confirmRun(ctx, "payroll.set_employee_details", employee);
    assert.equal(set.resolved.userId, staffId);
    assert.equal(set.receipt.counts.updated, 1);
    const row = await db.payrollEmployee.findFirstOrThrow({ where: { schoolId, userId: staffId } });
    assert.deepEqual([row.providerIds, row.leavingDate?.toISOString().slice(0, 10)], [{ EOBI: "E-1042" }, "2026-12-31"]);
    const replay = await confirmRun(ctx, "payroll.set_employee_details", employee);
    assert.equal(replay.receipt.counts.created, 0);
    assert.equal((replay.receipt.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(await db.payrollEmployee.count({ where: { schoolId } }), 1);
    assert.equal(await code(exec("payroll.set_employee_details").resolve!(ctx, { employee: "Ayesha", providers: [{ provider: "Unknown", employeeId: "1" }] })), "INPUT:/providers/0/provider");
  });
});

test("the discount needs the user's own quote for each pupil", async () => {
  const entry = exec("fees.assign_discount");
  const text = "Give the sibling discount to Ali Raza and Sara Raza";
  const segments = [{ id: "u1", normalized: normalizeText(text) }];
  const input = { discount: "Sibling discount", students: [{ name: "Ali Raza", said: "Ali Raza" }, { name: "Sara Raza", said: "Sara Raza" }] };
  const both = checkEvidence(input, entry.evidence, [{ pointer: "/discount", quote: "sibling discount" }, { pointer: "/students/0/said", quote: "Ali Raza" }, { pointer: "/students/1/said", quote: "Sara Raza" }], segments);
  assert.deepEqual(both.missing, []);
  const one = checkEvidence(input, entry.evidence, [{ pointer: "/discount", quote: "sibling discount" }, { pointer: "/students/0/said", quote: "Ali Raza" }], segments);
  assert.deepEqual(one.missing, ["/students/1/said"], "the second pupil has no quote");
  const invented = checkEvidence({ ...input, students: [...input.students, { name: "Omar Khan", said: "Omar Khan" }] }, entry.evidence, [{ pointer: "/discount", quote: "sibling discount" }, { pointer: "/students/0/said", quote: "Ali Raza" }, { pointer: "/students/1/said", quote: "Sara Raza" }, { pointer: "/students/2/said", quote: "Omar Khan" }], segments);
  assert.deepEqual(invented.missing, ["/students/2/said"], "a pupil the user never named is a question");
});

test("an operator with an accountant in post gets SEAT on every write", async () => {
  const { user, schoolId, campusId } = await fixture("ADMIN");
  await within(user, async () => {
    const vacant = await ctxFor(user, campusId);
    for (const item of FINANCE_BOOKS_ENTRIES) assert.deepEqual(await runGates(vacant, item.gates), { ok: true }, `${item.key} open while the seat is empty`);
  });
  const accountantId = randomUUID();
  await db.user.create({ data: { id: accountantId, schoolId, campusId, email: `${accountantId}@example.invalid`, fullName: "Synthetic accountant", role: "ACCOUNTANT", isActive: true } });
  await within(user, async () => {
    const held = await ctxFor(user, campusId);
    for (const key of WRITES) {
      const result = await runGates(held, exec(key).gates);
      assert.deepEqual(result.ok ? null : [result.code, result.whoCan], ["SEAT", ["ACCOUNTANT"]], key);
    }
  });
  const accountant: AuthUser = { schoolId, campusId, userId: accountantId, role: "ACCOUNTANT", email: `${accountantId}@example.invalid`, fullName: "Synthetic accountant", accessVersion: 0 };
  await within(accountant, async () => { for (const key of WRITES) assert.deepEqual(await runGates(await ctxFor(accountant, campusId), exec(key).gates), { ok: true }, key); });
});

test("a foreign campus is SCOPE_DENIED and writes nothing", async () => {
  const { user, schoolId, campusId, otherCampusId } = await fixture();
  const { klass } = await pupils(schoolId, campusId);
  const staffId = randomUUID();
  await db.user.create({ data: { id: staffId, schoolId, campusId, email: `${staffId}@example.invalid`, fullName: "Ayesha Khan", role: "TEACHER", isActive: true } });
  await within(user, async () => {
    const ctx = await ctxFor(user, otherCampusId);
    for (const item of FINANCE_BOOKS_ENTRIES) assert.equal((await runGates(ctx, item.gates) as { code?: string }).code, "SCOPE", item.key);
    const inputs: Record<string, unknown> = {
      "accounts.create_account": { name: "Stationery", type: "EXPENSE" }, "accounts.create_bank_account": { name: "Meezan Bank – Fees" },
      "accounts.create_payment_method": { name: "Cash" }, "tax.save_package_draft": { legalName: "Al Noor Education System" },
      "fees.assign_discount": { discount: "Sibling discount", students: [{ name: "Ali Raza", said: "Ali Raza" }], classId: klass.id },
      "payroll.set_employee_details": { employee: "Ayesha Khan", leavingDate: "2026-12-31" },
    };
    for (const [key, input] of Object.entries(inputs)) {
      const item = exec(key);
      assert.equal(await code(item.resolve!(ctx, item.input.parse(input))), "SCOPE_DENIED", `${key} resolve`);
      assert.equal(await code(item.execute(ctx, item.input.parse(input), { idempotencyKey: KEY() })), "SCOPE_DENIED", `${key} execute`);
    }
    for (const key of ["read.fees.defaulters", "read.fees.collection_summary"]) assert.equal(await code(exec(key).execute(ctx, exec(key).input.parse({}), { idempotencyKey: KEY() })), "SCOPE_DENIED", key);
    // A pupil id bound on this campus does not carry into another campus's job.
    const home = await ctxFor(user, campusId);
    const bound = await exec("fees.assign_discount").resolve!(home, { discount: "Sibling discount", students: [{ name: "Ali Raza", said: "Ali Raza" }] });
    assert.equal(await code(exec("fees.assign_discount").execute(ctx, bound, { idempotencyKey: KEY() })), "SCOPE_DENIED");
  });
  const rows = await Promise.all([
    db.chartOfAccount.count({ where: { schoolId } }), db.bankAccount.count({ where: { schoolId } }), db.paymentMethodRef.count({ where: { schoolId } }),
    db.taxActivation.count({ where: { schoolId } }), db.feeDiscountAssignment.count({ where: { student: { schoolId } } }), db.payrollEmployee.count({ where: { schoolId } }),
  ]);
  assert.deepEqual(rows, [0, 0, 0, 0, 0, 0]);
});

test("the money reads count only this campus's own invoices and payments", async () => {
  const { user, schoolId, campusId, otherCampusId } = await fixture();
  const { ali, sara, omar } = await pupils(schoolId, campusId);
  const otherClass = await db.class.create({ data: { schoolId, campusId: otherCampusId, name: "5", section: "B", academicYear: 2026, status: "ACTIVE" } });
  const outsider = await db.student.create({ data: { schoolId, campusId: otherCampusId, classId: otherClass.id, fullName: "Other Campus Pupil", rollNo: "99", gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } });
  const now = new Date();
  const month = (offset: number, day = 10) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day));
  let n = 0;
  const invoice = (studentId: string, onCampus: string, dueDate: Date, balanceDue: number, extra: Record<string, unknown> = {}) => db.invoice.create({ data: { schoolId, campusId: onCampus, studentId, invoiceDate: dueDate, dueDate, currency: "PKR", invoiceNumber: `SYN-BOOKS-${randomUUID().slice(0, 8)}-${n++}`, monthlyFee: 450000, subtotal: 450000, totalAmount: 450000, balanceDue, ...extra } });
  // Ali owes three past months, Sara one, Omar is paid up; the other campus's pupil owes four.
  for (const offset of [-3, -2, -1]) await invoice(ali.id, campusId, month(offset), 450000);
  await invoice(sara.id, campusId, month(-1), 200000, { totalAmountPaid: 250000, status: "PARTIAL" });
  await invoice(omar.id, campusId, month(-1), 0, { totalAmountPaid: 450000, status: "PAID" });
  for (const offset of [-4, -3, -2, -1]) await invoice(outsider.id, otherCampusId, month(offset), 450000);
  const thisMonth = await invoice(omar.id, campusId, month(1, 0), 450000);
  const otherThisMonth = await invoice(outsider.id, otherCampusId, month(1, 0), 450000);
  await db.payment.create({ data: { schoolId, campusId, invoiceId: thisMonth.id, studentId: omar.id, amount: 100000, currency: "PKR", paymentDate: month(0, 1), paymentMethod: "CASH" } });
  await db.payment.create({ data: { schoolId, campusId: otherCampusId, invoiceId: otherThisMonth.id, studentId: outsider.id, amount: 999900, currency: "PKR", paymentDate: month(0, 1), paymentMethod: "CASH" } });

  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const defaulters = exec("read.fees.defaulters");
    const moreThanTwo = await defaulters.execute(ctx, defaulters.input.parse({ moreThanMonths: 2 }), { idempotencyKey: KEY() });
    assert.equal(moreThanTwo.kind, "read");
    assert.equal(moreThanTwo.counts.defaulters, 1);
    const detail = moreThanTwo.detail as { pupils: Array<{ studentId: string; monthsOwed: number }>; totals: Array<{ currency: string; minor: number }>; text: string };
    assert.deepEqual(detail.pupils.map(row => [row.studentId, row.monthsOwed]), [[ali.id, 3]]);
    assert.deepEqual(detail.totals, [{ currency: "PKR", minor: 1350000 }]);
    assert.match(detail.text, /Ali Raza/);
    assert.ok(!detail.text.includes("Other Campus Pupil"));
    const anyone = await defaulters.execute(ctx, defaulters.input.parse({}), { idempotencyKey: KEY() });
    assert.deepEqual((anyone.detail as typeof detail).pupils.map(row => row.studentId).sort(), [ali.id, sara.id].sort(), "only this campus's pupils who owe");
    assert.equal(anyone.link, "/accountant?view=fee-reports&tab=defaulters");

    const summary = exec("read.fees.collection_summary");
    const read = await summary.execute(ctx, {}, { idempotencyKey: KEY() });
    const rows = (read.detail as { currencies: Array<Record<string, number | string>> }).currencies;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].currency, "PKR");
    assert.equal(rows[0].collected, 100000, "the other campus's payment is not counted");
    assert.equal(rows[0].dueThisMonth, 450000);
    assert.equal(rows[0].overdue, 450000 * 3 + 200000, "overdue is this campus's past-due balances only");
  });
});
