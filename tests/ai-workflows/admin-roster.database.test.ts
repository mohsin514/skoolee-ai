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
import { importReviewToken } from "../../src/lib/imports/review-token";
import { ADMIN_ROSTER_ENTRIES } from "../../src/lib/ai-workflows/registry/domains/admin/roster";
import type { CapabilityContext, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * Campus-operator roster import and academic-year entries, exercised directly (resolve → preview → execute,
 * or resolve → prepare) until the lead wires them into the registry.
 */
const entry = <T extends ExecEntry<any> | HandoffEntry<any>>(key: string) => ADMIN_ROSTER_ENTRIES.find(item => item.key === key) as T;
const exec = (key: string) => entry<ExecEntry<any>>(key);
const handoff = (key: string) => entry<HandoffEntry<any>>(key);
const HOME = { address: "Street 1", city: "Lahore", medicalNotes: "None" };
const KEY = () => `wf-test-${randomUUID()}`;

async function fixture(role: "ADMIN" | "CAMPUS_ADMIN" = "CAMPUS_ADMIN") {
  const schoolId = `roster-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic roster school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, regId: otherCampusId, name: "Other campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic operator", role, isActive: true } });
  const klass = await db.class.create({ data: { schoolId, campusId, name: "5", section: "A", academicYear: 2026, status: "ACTIVE" } });
  const foreignClass = await db.class.create({ data: { schoolId, campusId: otherCampusId, name: "5", section: "A", academicYear: 2026, status: "ACTIVE" } });
  const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, fullName: "Synthetic operator", accessVersion: 0 };
  return { user, schoolId, campusId, otherCampusId, klass, foreignClass };
}
const ctxFor = (user: AuthUser, campusId: string | null) => capabilityContext(user, campusId, "en");
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? `${error.code}${error.params.reason ? `:${error.params.reason}` : ""}` : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : `THROWN:${(error as Error).message}`; } };

async function confirmRun(ctx: CapabilityContext, key: string, input: unknown) {
  const item = exec(key);
  const parsed = item.input.parse(input);
  const resolved = item.resolve ? await item.resolve(ctx, parsed) : parsed;
  const bound = item.input.parse(resolved);
  const preview = await item.preview!(ctx, bound);
  const receipt = await item.execute(ctx, bound, { idempotencyKey: KEY() });
  return { resolved: bound, preview, receipt };
}
async function prepare(ctx: CapabilityContext, key: string, input: unknown) {
  const item = handoff(key);
  const parsed = item.input.parse(input);
  const resolved = item.resolve ? await item.resolve(ctx, parsed) : parsed;
  return item.handoff.prepare(ctx, item.input.parse(resolved), { idempotencyKey: KEY() });
}

test("all roster entries define and keep their static classes", () => {
  assert.deepEqual(ADMIN_ROSTER_ENTRIES.map(item => [item.key, item.class]), [
    ["imports.stage_batch", "B"], ["imports.commit_batch", "C"], ["academic.cycle.create", "B"], ["academic.cycle.activate", "C"], ["academic.class_teacher.assign", "C"],
  ]);
  assert.equal(handoff("imports.commit_batch").handoff.kind, "DOMAIN_SCREEN");
  assert.equal(handoff("academic.cycle.activate").handoff.kind, "ROLE_TASK");
  assert.equal(handoff("academic.class_teacher.assign").handoff.kind, "ROLE_TASK");
  assert.deepEqual(exec("imports.stage_batch").evidence, ["/rows/*/fullName", "/rows/*/rollNo"]);
});

test("staging: one batch, no students, duplicates matched, replay reconciles; commit hands off with the review token", async () => {
  const { user, schoolId, campusId, klass } = await fixture();
  await db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName: "Existing Pupil", rollNo: "10", gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } });
  const input = { classId: klass.id, rows: [
    { fullName: "Ayesha Khan", rollNo: "12", guardianPhone: "+923001234567", ...HOME, gender: "FEMALE", guardianRelationship: "MOTHER" },
    { fullName: "Bilal Ahmed", rollNo: "13", guardianPhone: "+923217654321", ...HOME },
    { fullName: "Existing Pupil", rollNo: "10", guardianPhone: "+923000000000", ...HOME },
    { fullName: "Repeat Row", rollNo: "13", guardianPhone: "+923000000001", ...HOME },
  ] };
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    assert.deepEqual(await runGates(ctx, exec("imports.stage_batch").gates), { ok: true });
    const { preview, receipt } = await confirmRun(ctx, "imports.stage_batch", input);
    assert.deepEqual(preview.counts, { total: 4, accepted: 2, rejected: 1, skipped: 1, unresolved: 0 });
    assert.equal(receipt.kind, "draft");
    assert.equal(receipt.link, "/ai?workflow=sources");
    assert.equal(receipt.detail?.status, "STAGED_NOT_COMMITTED");
    assert.equal(receipt.counts.committed, 0);
    assert.equal(await db.importBatch.count({ where: { schoolId } }), 1);
    assert.equal(await db.student.count({ where: { schoolId } }), 1, "staging never adds a student");
    const batch = await db.importBatch.findFirstOrThrow({ where: { schoolId } });
    assert.equal(batch.state, "STAGED");
    const rows = (batch.data as { rows: Array<{ state: string; proposal: { guardianRelationship?: string } | null }> }).rows;
    assert.deepEqual(rows.map(row => row.state), ["ACCEPTED", "ACCEPTED", "SKIPPED", "REJECTED"]);
    assert.equal(rows[0].proposal?.guardianRelationship, "mother");

    const again = await exec("imports.stage_batch").execute(ctx, exec("imports.stage_batch").input.parse(input), { idempotencyKey: KEY() });
    assert.equal(again.entities[0].id, receipt.entities[0].id);
    assert.equal(again.detail?.reconciled, true);
    assert.equal(await db.importBatch.count({ where: { schoolId } }), 1, "a replay never stages twice");

    const prepared = await prepare(ctx, "imports.commit_batch", {});
    assert.equal(prepared.kind, "DOMAIN_SCREEN");
    assert.equal(prepared.link, "/ai?workflow=sources");
    assert.equal(prepared.prefill.importBatchId, batch.id);
    assert.equal(prepared.prefill.reviewToken, importReviewToken(batch));
    assert.equal(prepared.prefill.inviteAccounts, false);
    assert.equal(prepared.prefill.guardiansVerified, false);
    assert.equal(await db.student.count({ where: { schoolId } }), 1, "the hand-off commits nothing");
    assert.equal(await db.user.count({ where: { schoolId, role: { in: ["PARENT", "STUDENT"] } } }), 0);
  });
});

test("commit: nothing staged is refused; several staged batches ask which one", async () => {
  const { user, campusId, klass } = await fixture("ADMIN");
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    assert.equal(await code(prepare(ctx, "imports.commit_batch", {})), "DOMAIN_REFUSED:NO_STAGED_ROSTER");
    await confirmRun(ctx, "imports.stage_batch", { classId: klass.id, sourceName: "Grade 5 list", rows: [{ fullName: "Ayesha Khan", rollNo: "12", guardianPhone: "+923001234567", ...HOME }] });
    await confirmRun(ctx, "imports.stage_batch", { classId: klass.id, sourceName: "Late joiners", rows: [{ fullName: "Bilal Ahmed", rollNo: "14", guardianPhone: "+923001234568", ...HOME }] });
    assert.equal(await code(prepare(ctx, "imports.commit_batch", { batch: "list" })), "OK");
    assert.equal(await code(prepare(ctx, "imports.commit_batch", { batch: "nothing like it" })), "INPUT:/batch");
  });
});

test("cycle: created as DRAFT only when the campus has none; never ACTIVE; refused once one exists", async () => {
  const { user, schoolId, campusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    assert.deepEqual(await runGates(ctx, exec("academic.cycle.create").gates), { ok: true });
    const { receipt } = await confirmRun(ctx, "academic.cycle.create", { academicYear: 2026, label: "2026-27" });
    const cycles = await db.academicCycle.findMany({ where: { schoolId, campusId } });
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0].status, "DRAFT");
    assert.equal(cycles[0].label, "2026-27");
    assert.equal(receipt.detail?.activated, false);
    assert.equal(await db.academicCycle.count({ where: { schoolId, status: "ACTIVE" } }), 0);

    const replay = await exec("academic.cycle.create").execute(ctx, { academicYear: 2026, label: "2026-27" }, { idempotencyKey: KEY() });
    assert.equal(replay.entities[0].id, cycles[0].id);
    assert.equal(replay.detail?.reconciled, true);
    assert.equal(await db.academicCycle.count({ where: { schoolId } }), 1);

    assert.equal(await code(exec("academic.cycle.create").resolve!(ctx, { academicYear: 2027 })), "DOMAIN_REFUSED:CYCLE_EXISTS");
    assert.equal(await code(exec("academic.cycle.create").execute(ctx, { academicYear: 2027 }, { idempotencyKey: KEY() })), "DOMAIN_REFUSED:CYCLE_EXISTS");
    assert.equal(await db.academicCycle.count({ where: { schoolId } }), 1);
  });
  const withActive = await fixture();
  await db.academicCycle.create({ data: { schoolId: withActive.schoolId, campusId: withActive.campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  await within(withActive.user, async () => {
    const ctx = await ctxFor(withActive.user, withActive.campusId);
    assert.equal(await code(exec("academic.cycle.create").resolve!(ctx, { academicYear: 2027 })), "DOMAIN_REFUSED:CYCLE_EXISTS");
  });
});

test("activation hands off to the PRINCIPAL when that seat is held, else to the campus operator; it never activates", async () => {
  const { user, schoolId, campusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    assert.equal(await code(prepare(ctx, "academic.cycle.activate", {})), "DOMAIN_REFUSED:NO_DRAFT_CYCLE");
  });
  const cycle = await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026-27", status: "DRAFT" } });
  await within(user, async () => {
    const vacant = await prepare(await ctxFor(user, campusId), "academic.cycle.activate", {});
    assert.equal(vacant.kind, "ROLE_TASK");
    assert.deepEqual([...vacant.targetRoles].sort(), ["ADMIN", "CAMPUS_ADMIN"]);
    assert.equal(vacant.link, "/admin?view=year-cycle");
    assert.equal(vacant.prefill.cycleId, cycle.id);
  });
  const principalId = randomUUID();
  await db.user.create({ data: { id: principalId, schoolId, campusId, email: `${principalId}@example.invalid`, fullName: "Synthetic principal", role: "PRINCIPAL", isActive: true } });
  await within(user, async () => {
    const held = await prepare(await ctxFor(user, campusId), "academic.cycle.activate", { cycleId: cycle.id });
    assert.deepEqual(held.targetRoles, ["PRINCIPAL"]);
    assert.equal(held.prefill.operation, "academics.transition_year");
    assert.equal(held.prefill.action, "activate");
  });
  assert.equal((await db.academicCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status, "DRAFT", "the hand-off never activates");
});

test("class teacher: the PRINCIPAL decides while seated, else the operator's Classes screen", async () => {
  const { user, schoolId, campusId, klass } = await fixture("ADMIN");
  const teacherId = randomUUID();
  await db.user.create({ data: { id: teacherId, schoolId, campusId, email: `${teacherId}@example.invalid`, fullName: "Ayesha Teacher", role: "TEACHER", isActive: true } });
  await within(user, async () => {
    const vacant = await prepare(await ctxFor(user, campusId), "academic.class_teacher.assign", { classId: klass.id, teacherId });
    assert.deepEqual([...vacant.targetRoles].sort(), ["ADMIN", "CAMPUS_ADMIN"]);
    assert.equal(vacant.link, "/admin?view=classes");
    assert.equal(vacant.prefill.classTeacherId, teacherId);
  });
  const principalId = randomUUID();
  await db.user.create({ data: { id: principalId, schoolId, campusId, email: `${principalId}@example.invalid`, fullName: "Synthetic principal", role: "PRINCIPAL", isActive: true } });
  await within(user, async () => {
    const held = await prepare(await ctxFor(user, campusId), "academic.class_teacher.assign", { classId: klass.id, teacherId });
    assert.deepEqual(held.targetRoles, ["PRINCIPAL"]);
    assert.equal(held.link, "/principal?view=classes");
  });
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: klass.id } })).classTeacherId, null);
});

test("a foreign campus or class gives SCOPE_DENIED and writes nothing", async () => {
  const { user, schoolId, campusId, otherCampusId, klass, foreignClass } = await fixture();
  const otherTeacher = randomUUID();
  await db.user.create({ data: { id: otherTeacher, schoolId, campusId: otherCampusId, email: `${otherTeacher}@example.invalid`, fullName: "Other teacher", role: "TEACHER", isActive: true } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const rows = [{ fullName: "Ayesha Khan", rollNo: "12", guardianPhone: "+923001234567", ...HOME }];
    assert.equal(await code(confirmRun(ctx, "imports.stage_batch", { classId: foreignClass.id, rows })), "SCOPE_DENIED");
    assert.equal(await code(exec("imports.stage_batch").execute(ctx, { classId: foreignClass.id, rows }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    assert.equal(await code(prepare(ctx, "academic.class_teacher.assign", { classId: foreignClass.id, teacherId: otherTeacher })), "SCOPE_DENIED");
    assert.equal(await code(prepare(ctx, "academic.class_teacher.assign", { classId: klass.id, teacherId: otherTeacher })), "SCOPE_DENIED");

    const foreign = await ctxFor(user, otherCampusId);
    for (const item of ADMIN_ROSTER_ENTRIES) assert.deepEqual(await runGates(foreign, item.gates), { ok: false, code: "SCOPE" }, item.key);
    assert.equal(await code(confirmRun(foreign, "academic.cycle.create", { academicYear: 2026 })), "SCOPE_DENIED");
    assert.equal(await code(exec("imports.stage_batch").execute(foreign, { classId: klass.id, rows }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
  });
  assert.equal(await db.importBatch.count({ where: { schoolId } }), 0);
  assert.equal(await db.academicCycle.count({ where: { schoolId } }), 0);
  assert.equal(await db.student.count({ where: { schoolId } }), 0);
});

test("a teacher or principal is refused by the operator gates", async () => {
  const { schoolId, campusId } = await fixture();
  for (const role of ["TEACHER", "PRINCIPAL"] as const) {
    const id = randomUUID();
    await db.user.create({ data: { id, schoolId, campusId, email: `${id}@example.invalid`, fullName: `Synthetic ${role}`, role, isActive: true } });
    const other: AuthUser = { schoolId, campusId, userId: id, role, email: `${id}@example.invalid`, fullName: `Synthetic ${role}`, accessVersion: 0 };
    await within(other, async () => {
      const ctx = await ctxFor(other, campusId);
      for (const item of ADMIN_ROSTER_ENTRIES) assert.equal((await runGates(ctx, item.gates)).ok, false, `${role} ${item.key}`);
    });
  }
});
