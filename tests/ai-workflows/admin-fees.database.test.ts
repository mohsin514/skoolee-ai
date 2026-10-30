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
import { ADMIN_FEE_ENTRIES } from "../../src/lib/ai-workflows/registry/domains/admin/fees";
import type { CapabilityContext, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * Finance-desk fee set-up entries, exercised directly (resolve → preview → execute) until the lead wires
 * them into the registry: groups, types, amounts, class assignment, fines, discounts and the reminder hand-off.
 */
const entry = <T extends ExecEntry<any> | HandoffEntry<any>>(key: string) => ADMIN_FEE_ENTRIES.find(item => item.key === key) as T;
const exec = (key: string) => entry<ExecEntry<any>>(key);
const KEY = () => `wf-test-${randomUUID()}`;

async function fixture(role: AuthUser["role"] = "ACCOUNTANT") {
  const schoolId = `fees-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic fees school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, regId: otherCampusId, name: "Other campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic finance", role, isActive: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, fullName: "Synthetic finance", accessVersion: 0 };
  return { user, schoolId, campusId, otherCampusId };
}
const ctxFor = (user: AuthUser, campusId: string | null) => capabilityContext(user, campusId, "en");
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? error.code : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : `THROWN:${(error as Error).message}`; } };

/** Resolve, preview and execute one exec entry the way a confirmed class-B step does. */
async function confirmRun(ctx: CapabilityContext, key: string, input: unknown) {
  const item = exec(key);
  const parsed = item.input.parse(input);
  const resolved = item.resolve ? await item.resolve(ctx, parsed) : parsed;
  const bound = item.input.parse(resolved);
  const preview = await item.preview!(ctx, bound);
  const receipt = await item.execute(ctx, bound, { idempotencyKey: KEY() });
  return { resolved: bound, preview, receipt };
}

test("fee entries define with their static classes, roles and evidence", () => {
  assert.deepEqual(ADMIN_FEE_ENTRIES.map(item => [item.key, item.class, item.risk]), [
    ["fees.create_fee_group", "B", "CREATE"], ["fees.create_fee_type", "B", "CREATE"], ["fees.create_master_line", "B", "CREATE"],
    ["fees.assign_fee_group", "B", "CREATE"], ["fees.create_fine_rule", "B", "CREATE"], ["fees.create_discount", "B", "CREATE"],
    ["fees.send_due_reminder", "C", "COMMUNICATION"],
  ]);
  for (const item of ADMIN_FEE_ENTRIES) {
    assert.deepEqual([...item.roles], ["ACCOUNTANT", "ADMIN", "CAMPUS_ADMIN"]);
    assert.ok(item.gates.some(gate => gate.id === "seat:accountant"), `${item.key} carries the accountant seat gate`);
    if (item.class !== "C") assert.deepEqual(item.idempotency, { mode: "natural" });
  }
  assert.deepEqual(exec("fees.create_fee_group").evidence, ["/name"]);
  assert.deepEqual(exec("fees.create_master_line").evidence, ["/amount"]);
  assert.deepEqual(exec("fees.create_fine_rule").evidence, ["/name", "/amount"]);
  assert.equal(entry<HandoffEntry<any>>("fees.send_due_reminder").handoff.kind, "DOMAIN_SCREEN");
});

test("each create works once and a replay reconciles without a second row", async () => {
  const { user, schoolId, campusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const cases: Array<[string, unknown, () => Promise<number>]> = [
      ["fees.create_fee_group", { name: "Grades 1-5" }, () => db.feeGroup.count({ where: { schoolId } })],
      ["fees.create_fee_type", { name: "Tuition" }, () => db.feeType.count({ where: { schoolId } })],
      ["fees.create_fine_rule", { name: "Late fine", type: "PER_DAY", amount: 50, graceDays: 10 }, () => db.feeFineRule.count({ where: { schoolId } })],
      ["fees.create_discount", { name: "Sibling discount", type: "PERCENT", amount: 10 }, () => db.feeDiscount.count({ where: { schoolId } })],
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
    const type = await db.feeType.findFirstOrThrow({ where: { schoolId } });
    assert.equal(type.code, "TUITION");
    const fine = await db.feeFineRule.findFirstOrThrow({ where: { schoolId } });
    assert.deepEqual([fine.type, fine.value, fine.graceDays], ["PER_DAY", 5000, 10], "Rs 50 per day is stored as 5000 paisa");
    const discount = await db.feeDiscount.findFirstOrThrow({ where: { schoolId } });
    assert.deepEqual([discount.code, discount.type, discount.value], ["SIBLING_DISCOUNT", "PERCENT", 10]);
    // The same name with different terms is refused, never silently updated.
    assert.equal(await code(exec("fees.create_fine_rule").resolve!(ctx, { name: "late fine", type: "PER_DAY", amount: 100 })), "DOMAIN_REFUSED");
    assert.equal(await code(exec("fees.create_discount").resolve!(ctx, { name: "Sibling discount", type: "PERCENT", amount: 150 })), "INPUT:/amount");
  });
});

test("a line names a group created by an earlier step; it binds when it runs, then assigns to grades", async () => {
  const { user, schoolId, campusId } = await fixture("CAMPUS_ADMIN");
  const grade = (name: string, section: string) => db.class.create({ data: { schoolId, campusId, name, section, academicYear: 2026, status: "ACTIVE" } });
  const [oneA, oneB, two] = [await grade("1", "A"), await grade("1", "B"), await grade("2", "A")];
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const lineInput = { group: "Grades 1-5", feeType: "Tuition", amount: 4500 };
    // Planned together: the line is resolved and previewed before the group and type exist.
    const early = exec("fees.create_master_line");
    const bound = await early.resolve!(ctx, early.input.parse(lineInput));
    assert.equal(bound.group, "Grades 1-5");
    const preview = await early.preview!(ctx, bound);
    assert.match(preview.lines[0].value, /earlier step/);
    assert.equal(preview.counts.amountMinor, 450000);
    assert.equal(await code(early.execute(ctx, bound, { idempotencyKey: KEY() })), "NOT_FOUND", "nothing to bind yet, nothing written");
    assert.equal(await db.feesMasterLine.count({ where: { schoolId } }), 0);

    await confirmRun(ctx, "fees.create_fee_group", { name: "Grades 1-5" });
    await confirmRun(ctx, "fees.create_fee_type", { name: "Tuition" });
    const ran = await early.execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(ran.counts.created, 1);
    const line = await db.feesMasterLine.findFirstOrThrow({ where: { schoolId }, include: { feeGroup: true, feeType: true } });
    assert.deepEqual([line.feeGroup.name, line.feeType.name, line.amount], ["Grades 1-5", "Tuition", 450000]);
    // Case and spacing differences still bind to the same rows; a replay reconciles.
    const replay = await confirmRun(ctx, "fees.create_master_line", { group: "grades  1-5", feeType: "tuition", amount: 4500 });
    assert.equal(replay.receipt.counts.created, 0);
    assert.equal(await db.feesMasterLine.count({ where: { schoolId } }), 1);
    assert.equal(await code(exec("fees.create_master_line").resolve!(ctx, { group: "Grades 1-5", feeType: "Tuition", amount: 5000 })), "DOMAIN_REFUSED", "a different amount is not overwritten");

    const assigned = await confirmRun(ctx, "fees.assign_fee_group", { group: "Grades 1-5", grades: ["Grade 1"], classIds: [two.id] });
    assert.deepEqual([...assigned.resolved.classIds].sort(), [oneA.id, oneB.id, two.id].sort());
    assert.equal(assigned.resolved.academicYear, 2026);
    assert.deepEqual(assigned.receipt.counts, { assigned: 3, alreadyAssigned: 0 });
    const again = await confirmRun(ctx, "fees.assign_fee_group", { group: "Grades 1-5", grades: ["1"], classIds: [two.id] });
    assert.deepEqual(again.receipt.counts, { assigned: 0, alreadyAssigned: 3 });
    assert.equal(await db.feeGroupAssignment.count({ where: { schoolId } }), 3);
    assert.equal(await code(exec("fees.assign_fee_group").resolve!(ctx, { group: "Grades 1-5", grades: ["9"] })), "INPUT:/grades/0");
  });
});

test("an operator is sent to the seat holder while an active accountant holds the desk", async () => {
  const { user, schoolId, campusId } = await fixture("ADMIN");
  await within(user, async () => {
    const vacant = await ctxFor(user, campusId);
    for (const item of ADMIN_FEE_ENTRIES) assert.deepEqual(await runGates(vacant, item.gates), { ok: true }, `${item.key} open while the seat is empty`);
  });
  const accountantId = randomUUID();
  await db.user.create({ data: { id: accountantId, schoolId, campusId, email: `${accountantId}@example.invalid`, fullName: "Synthetic accountant", role: "ACCOUNTANT", isActive: true } });
  await within(user, async () => {
    const held = await ctxFor(user, campusId);
    for (const item of ADMIN_FEE_ENTRIES) {
      const result = await runGates(held, item.gates);
      assert.equal(result.ok, false);
      assert.deepEqual(result.ok ? null : [result.code, result.whoCan], ["SEAT", ["ACCOUNTANT"]], item.key);
    }
  });
  const accountant: AuthUser = { schoolId, campusId, userId: accountantId, role: "ACCOUNTANT", email: `${accountantId}@example.invalid`, fullName: "Synthetic accountant", accessVersion: 0 };
  await within(accountant, async () => assert.deepEqual(await runGates(await ctxFor(accountant, campusId), exec("fees.create_fee_group").gates), { ok: true }));
});

test("a foreign campus is SCOPE_DENIED and writes nothing", async () => {
  const { user, schoolId, otherCampusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, otherCampusId);
    assert.equal((await runGates(ctx, exec("fees.create_fee_group").gates) as { code?: string }).code, "SCOPE");
    const inputs: Record<string, unknown> = {
      "fees.create_fee_group": { name: "Grades 1-5" }, "fees.create_fee_type": { name: "Tuition" },
      "fees.create_master_line": { group: "Grades 1-5", feeType: "Tuition", amount: 100 }, "fees.assign_fee_group": { group: "Grades 1-5", grades: ["1"] },
      "fees.create_fine_rule": { name: "Late fine", type: "FLAT", amount: 200 }, "fees.create_discount": { name: "Staff child", type: "FLAT", amount: 500 },
    };
    for (const [key, input] of Object.entries(inputs)) {
      const item = exec(key);
      assert.equal(await code(item.resolve!(ctx, item.input.parse(input))), "SCOPE_DENIED", `${key} resolve`);
      assert.equal(await code(item.execute(ctx, item.input.parse(input), { idempotencyKey: KEY() })), "SCOPE_DENIED", `${key} execute`);
    }
    const reminder = entry<HandoffEntry<any>>("fees.send_due_reminder");
    assert.equal(await code(reminder.handoff.prepare(ctx, {}, { idempotencyKey: KEY() })), "SCOPE_DENIED");
  });
  const rows = await Promise.all([db.feeGroup.count({ where: { schoolId } }), db.feeType.count({ where: { schoolId } }), db.feesMasterLine.count({ where: { schoolId } }), db.feeGroupAssignment.count({ where: { schoolId } }), db.feeFineRule.count({ where: { schoolId } }), db.feeDiscount.count({ where: { schoolId } })]);
  assert.deepEqual(rows, [0, 0, 0, 0, 0, 0]);
});

test("the reminder hand-off opens the reminders screen with the dues and sends nothing", async () => {
  const { user, schoolId, campusId } = await fixture();
  const klass = await db.class.create({ data: { schoolId, campusId, name: "5", section: "A", academicYear: 2026, status: "ACTIVE" } });
  const pupil = await db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName: "Ali Raza", rollNo: "12", gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } });
  await db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName: "Sara Khan", rollNo: "13", gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } });
  const invoice = await db.invoice.create({ data: { schoolId, campusId, studentId: pupil.id, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-09-30Z"), currency: "PKR", invoiceNumber: `SYN-FEES-${randomUUID().slice(0, 8)}`, monthlyFee: 450000, subtotal: 450000, totalAmount: 450000, balanceDue: 450000 } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const reminder = entry<HandoffEntry<any>>("fees.send_due_reminder");
    const bound = await reminder.resolve!(ctx, reminder.input.parse({ student: "ali" }));
    assert.equal(bound.student, "Ali Raza");
    const prepared = await reminder.handoff.prepare(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(prepared.kind, "DOMAIN_SCREEN");
    assert.equal(prepared.link, "/accountant?view=fee-reports&tab=defaulters");
    assert.deepEqual(prepared.targetRoles, []);
    assert.equal(prepared.prefill.studentId, pupil.id);
    assert.equal(prepared.prefill.invoiceId, invoice.id);
    assert.equal(prepared.prefill.balanceDueMinor, 450000);
    assert.equal(prepared.detail?.sent, false);
    const all = await reminder.handoff.prepare(ctx, reminder.input.parse({ classId: klass.id }), { idempotencyKey: KEY() });
    assert.deepEqual(all.prefill, { scope: "DEFAULTERS", classId: klass.id, defaulters: 1 });
    assert.equal(await code(reminder.resolve!(ctx, { student: "Sara Khan" }).then(input => reminder.handoff.prepare(ctx, input, { idempotencyKey: KEY() }))), "DOMAIN_REFUSED", "no dues, nothing to remind");
    assert.equal(await code(reminder.resolve!(ctx, { student: "Nobody Here" })), "INPUT:/student");
  });
  assert.equal(await db.parentCommunication.count({ where: { schoolId } }), 0, "nothing was sent");
});
