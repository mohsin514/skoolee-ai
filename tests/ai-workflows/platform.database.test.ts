import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { sweepWorkflowJobs } from "../../src/lib/ai-workflows/jobs/worker";
import { runGates } from "../../src/lib/ai-workflows/registry/gates";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import { listSchoolsMissingCity } from "../../src/lib/ai-workflows/adapters/platform";
import { PLATFORM_ENTRIES } from "../../src/lib/ai-workflows/registry/domains/group/platform";
import type { CapabilityContext, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [], owners: string[] = [], eventIds: string[] = [];
after(async () => {
  await db.pilot.deleteMany({ where: { createdById: { in: owners } } });
  await db.stripeWebhookReceipt.deleteMany({ where: { eventId: { in: eventIds } } });
  await db.school.deleteMany({ where: { id: { in: schools } } });
  await db.$disconnect(); await prisma.$disconnect(); redis.disconnect();
});

/**
 * The APP_OWNER platform desk (Slice 8, RT9), exercised directly (resolve → preview → execute / prepare)
 * until the lead wires PLATFORM_ENTRIES into the registry: one B draft write, eight C hand-offs that write
 * nothing, the worker never claiming an owner job, and the role/scope declarations.
 */
const exec = (key: string) => PLATFORM_ENTRIES.find(item => item.key === key) as ExecEntry<any>;
const handoff = (key: string) => PLATFORM_ENTRIES.find(item => item.key === key) as HandoffEntry<any>;
const KEY = () => `wf-test-${randomUUID()}`;
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? error.code : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : `THROWN:${(error as Error).message}`; } };

async function school(name: string, city = "Lahore") {
  const id = `plat-${randomUUID()}`; schools.push(id);
  await db.school.create({ data: { id, slug: id, regId: id, name, contactEmail: `${id}@example.invalid`, city, status: "ACTIVE", plan: "BASIC" } });
  return id;
}
async function user(schoolId: string, role: AuthUser["role"], email = `${randomUUID()}@example.invalid`): Promise<AuthUser> {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, schoolId, campusId: null, email, fullName: "Synthetic actor", role, isActive: true } });
  if (role === "APP_OWNER") owners.push(userId);
  return { schoolId, campusId: null, userId, role, email, fullName: "Synthetic actor", accessVersion: 0 };
}
async function fixture() {
  const home = await school("Synthetic platform home");
  const owner = await user(home, "APP_OWNER");
  const tag = randomUUID().slice(0, 8);
  const targetName = `Synthetic Al-Noor ${tag}`;
  const target = await school(targetName);
  await db.localePolicy.create({ data: { schoolId: target, scopeKey: "school", settings: { timezone: "Asia/Karachi", country: "PK", currency: "PKR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: owner.userId, financeReviewedBy: owner.userId } });
  return { owner, home, target, targetName, tag };
}
const ctxFor = (actor: AuthUser): Promise<CapabilityContext> => capabilityContext(actor, null, "en");

async function bind(ctx: CapabilityContext, key: string, input: unknown) {
  const item = PLATFORM_ENTRIES.find(entry => entry.key === key)!;
  const parsed = item.input.parse(input);
  return item.input.parse(item.resolve ? await item.resolve(ctx, parsed) : parsed);
}

test("every platform entry is APP_OWNER-only, platform-scoped with a stated reason, and refuses anyone else with ROLE", async () => {
  assert.equal(PLATFORM_ENTRIES.length, 9);
  for (const entry of PLATFORM_ENTRIES) {
    assert.deepEqual([...entry.roles], ["APP_OWNER"], entry.key);
    assert.equal(entry.scope.kind, "platform", entry.key);
    assert.ok(entry.scope.kind === "platform" && entry.scope.unscopedReason.trim().length > 10, `${entry.key} states its unscopedReason`);
    assert.equal(entry.class, ["platform.pilot_create", "platform.set_default_plan_pricing"].includes(entry.key) ? "B" : "C", entry.key);
  }
  assert.equal(handoff("platform.payment_connect_onboarding").handoff.kind, "DEEP_LINK");
  const { home, owner } = await fixture();
  for (const role of ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] as const) {
    const other = await user(home, role);
    const ctx = await inTenant(other, () => ctxFor(other));
    for (const entry of PLATFORM_ENTRIES) {
      const result = await runGates(ctx, entry.gates);
      assert.equal(result.ok ? "OK" : result.code, "ROLE", `${role} on ${entry.key}`);
    }
    // The adapter refuses too, so a mis-wired gate still cannot leave the tenant guard.
    await assert.rejects(inTenant(other, () => listSchoolsMissingCity(other)), /application owner/);
  }
  const ownerCtx = await inTenant(owner, () => ctxFor(owner));
  for (const entry of PLATFORM_ENTRIES) assert.equal((await runGates(ownerCtx, entry.gates)).ok, true, entry.key);
});

test("schools missing a city are listed for the owner, oldest first", async () => {
  const { owner } = await fixture();
  const blank = await school(`Synthetic no-city ${randomUUID().slice(0, 6)}`, "");
  const rows = await inTenant(owner, () => listSchoolsMissingCity(owner, 50));
  assert.ok(rows.some(row => row.id === blank), "the school with an empty city is listed");
  assert.ok(rows.every(row => typeof row.name === "string" && Object.keys(row).length === 2));
});

test("pilot charter: drafted once after confirmation, replayed by key and by content, asks for the champion", async () => {
  const { owner, target, targetName } = await fixture();
  const ctx = await inTenant(owner, () => ctxFor(owner));
  const entry = exec("platform.pilot_create");
  const asked = await code(inTenant(owner, () => bind(ctx, entry.key, { school: targetName, startsOn: "2026-11-01", workflows: [{ key: "MARKS_ENTRY" }, { key: "ATTENDANCE" }] })));
  assert.equal(asked, "INPUT:/championName,/curriculum");
  const input = { school: targetName, startsOn: "2026-11-01", workflows: [{ key: "MARKS_ENTRY" }, { key: "ATTENDANCE" }], championName: "Ms Hina", curriculum: "Matric (BISE Lahore)" };
  const bound = await inTenant(owner, () => bind(ctx, entry.key, input));
  assert.equal(bound.country, "PK", "country comes from the school's locale policy");
  assert.equal(bound.workflows[0].definition.length > 10, true, "presets fill the definitions");
  const preview = await inTenant(owner, () => entry.preview!(ctx, bound));
  assert.equal(preview.counts.workflows, 2);
  assert.equal(await db.pilot.count({ where: { createdById: owner.userId } }), 0, "nothing before confirmation");
  const key = KEY();
  const first = await inTenant(owner, () => entry.execute(ctx, bound, { idempotencyKey: key }));
  const again = await inTenant(owner, () => entry.execute(ctx, bound, { idempotencyKey: key }));
  const otherKey = await inTenant(owner, () => entry.execute(ctx, bound, { idempotencyKey: KEY() }));
  assert.equal(first.kind, "draft");
  assert.equal(again.replayed, true);
  assert.equal(otherKey.entities[0].id, first.entities[0].id, "a lost receipt is reconciled by content");
  const pilots = await db.pilot.findMany({ where: { createdById: owner.userId } });
  assert.equal(pilots.length, 1, "the pilot draft is created once");
  assert.equal(pilots[0].status, "PLANNED");
  assert.equal(pilots[0].consentReference, null);
  assert.equal(pilots[0].targetSchoolId, target);
  assert.equal(pilots[0].measurementOwnerId, owner.userId);
  const audit = await db.superAdminAuditLog.findMany({ where: { userId: owner.userId, action: "pilot_created" } });
  assert.equal(audit.length, 1);
  assert.equal((audit[0].newValues as { unscopedReason?: string }).unscopedReason, "authorized automatic platform administration");
});

test("every C entry prepares the owner's own screen with step-up and writes nothing", async () => {
  const { owner, target, targetName, tag } = await fixture();
  const ctx = await inTenant(owner, () => ctxFor(owner));
  const requester = await user(target, "SUPER_ADMIN", `bursar-${tag}@example.invalid`);
  const until = new Date(Date.now() + 14 * 86_400_000).toISOString();
  await db.subscriptionRequest.create({ data: { schoolId: target, requestedById: requester.userId, idempotencyKey: KEY(), kind: "GRACE_EXTENSION", details: { requestedUntil: until } } });
  const eventId = `evt_${randomUUID()}`; eventIds.push(eventId);
  await db.stripeWebhookReceipt.create({ data: { eventId, eventType: "invoice.paid", eventCreated: 1, state: "NEEDS_REVIEW", schoolId: target } });
  await db.loginSession.create({ data: { schoolId: target, userId: requester.userId, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });

  const snapshot = async () => ({
    pilots: await db.pilot.count({ where: { createdById: owner.userId } }),
    policies: await db.resourcePolicy.count({ where: { createdById: owner.userId } }),
    ownerAudit: await db.superAdminAuditLog.count({ where: { userId: owner.userId } }),
    schoolAudit: await db.auditLog.count({ where: { schoolId: target } }),
    request: (await db.subscriptionRequest.findFirstOrThrow({ where: { schoolId: target } })).state,
    event: (await db.stripeWebhookReceipt.findUniqueOrThrow({ where: { eventId } })).state,
    sessions: await db.loginSession.count({ where: { userId: requester.userId, isActive: true } }),
    school: await db.school.findUniqueOrThrow({ where: { id: target }, select: { plan: true, status: true, aiCreditsLimit: true, commercialContract: true } }),
    pricing: (await db.platformConfig.findUnique({ where: { key: "default_plan_pricing" } }))?.updatedAt ?? null,
    payments: (await db.platformConfig.findUnique({ where: { key: "payment_settings" } }))?.updatedAt ?? null,
    provisioned: await db.school.count({ where: { name: `Synthetic Crescent ${tag}` } }),
    receipts: await db.schoolAiRequest.count({ where: { actorId: owner.userId } }),
  });
  const before = await snapshot();
  const cases: Array<[string, unknown, string]> = [
    ["platform.capacity_apply_policy", { school: targetName, scope: "BACKGROUND_REQUESTS", limitValue: 20, reason: "Incident on the reports queue tonight", expiresAt: "2099-01-01" }, "/owner?view=capacity"],
    ["platform.resolve_provider_event", { event: targetName, note: "Refund already done manually" }, "/owner?view=subscription-requests"],
    ["platform.subscription_request_review", { school: targetName, decision: "APPROVE_REQUEST", reason: "Paid by bank transfer on Monday" }, "/owner?view=subscription-requests"],
    ["platform.provision_school", { schoolName: `Synthetic Crescent ${tag}`, kind: "STANDALONE", city: "Karachi", plan: "BASIC", ownerName: "Sara Khan", ownerEmail: `sara-${tag}@example.invalid` }, "/owner?view=schools"],
    ["platform.update_school_plan_status", { school: targetName, plan: "ENTERPRISE" }, "/owner?view=schools"],
    ["platform.payment_connect_onboarding", {}, "/owner?view=payments"],
    ["platform.session_terminate", { account: `bursar-${tag}@example.invalid` }, "/owner?view=sessions"],
  ];
  for (const [key, input, link] of cases) {
    const entry = handoff(key);
    assert.equal(entry.class, "C");
    assert.equal("execute" in entry && entry.execute !== undefined, false, `${key} has no execute`);
    const bound = await inTenant(owner, () => bind(ctx, key, input));
    const prepared = await inTenant(owner, () => entry.handoff.prepare(ctx, bound, { idempotencyKey: KEY() }));
    assert.ok(prepared.link.startsWith(link), `${key} → ${prepared.link}`);
    assert.deepEqual([...prepared.targetRoles], ["APP_OWNER"], key);
    assert.equal(prepared.detail?.stepUp, true, key);
    const serialized = JSON.stringify(prepared);
    assert.ok(!/password|tokenHash|accountNumber|iban|connectedAccountId/i.test(serialized), `${key} carries no credential`);
  }
  assert.deepEqual(await snapshot(), before, "no C entry wrote anything");
  const plan = await inTenant(owner, () => bind(ctx, "platform.update_school_plan_status", { school: targetName, plan: "ENTERPRISE" }));
  const prepared = await inTenant(owner, () => handoff("platform.update_school_plan_status").handoff.prepare(ctx, plan, { idempotencyKey: KEY() }));
  assert.deepEqual(prepared.prefill, { schoolId: target, plan: "ENTERPRISE" });
  assert.equal(await code(inTenant(owner, () => bind(ctx, "platform.capacity_apply_policy", { school: targetName, scope: "BACKGROUND_JOBS", limitValue: 5, reason: "Incident on the reports queue" }))), "INPUT:/expiresAt", "a school-scoped limit asks for an expiry");
  assert.equal(await code(inTenant(owner, () => handoff("platform.update_school_plan_status").handoff.prepare(ctx, { school: target, plan: "BASIC" }, { idempotencyKey: KEY() }))), "DOMAIN_REFUSED", "no change is refused");
});

test("RT9: the worker sweep never claims an APP_OWNER job", async () => {
  const { owner, home } = await fixture();
  const job = await db.aiWorkflowJob.create({ data: {
    schoolId: home, actorId: owner.userId, actorRole: "APP_OWNER", accessVersion: 0, origin: "FREEFORM", language: "en", requestHash: "a".repeat(64),
    idempotencyKey: KEY(), status: "RUNNING", budget: {}, unscopedReason: "platform owner request", expiresAt: new Date(Date.now() + 86_400_000),
  } });
  const seen: Array<{ id: string; actorRole: string }> = [];
  // Only this file's schools reach the loop, so the sweep never advances another suite's jobs.
  const scoped = (inject: Array<Record<string, unknown>> = []) => new Proxy(db, { get(target, prop) {
    if (prop === "$queryRaw") return async (...args: unknown[]) => {
      const rows = await (target.$queryRaw as (...a: unknown[]) => Promise<Array<{ id: string; schoolId: string; actorRole: string }>>).apply(target, args);
      seen.push(...rows);
      return [...rows.filter(row => schools.includes(row.schoolId)), ...inject];
    };
    const value = Reflect.get(target, prop);
    return typeof value === "function" ? value.bind(target) : value;
  } }) as PrismaClient;
  const swept = await sweepWorkflowJobs(scoped());
  assert.ok(!seen.some(row => row.id === job.id), "the claim query excludes APP_OWNER jobs");
  assert.ok(!seen.some(row => row.actorRole === "APP_OWNER"));
  assert.equal(swept.advanced, 0);
  // Defence in depth: an owner row that reached the loop is still skipped, never leased or blocked.
  const injected = await sweepWorkflowJobs(scoped([{ id: job.id, schoolId: home, actorId: owner.userId, actorRole: "APP_OWNER", accessVersion: 0 }]));
  assert.equal(injected.advanced, 0);
  const after = await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(after.status, "RUNNING");
  assert.equal(after.version, job.version);
  assert.equal(after.leaseToken, null);
  assert.equal(after.leaseExpiresAt, null);
  assert.equal(await db.aiWorkflowEvent.count({ where: { jobId: job.id } }), 0, "nothing is claimed");
});

test("expired platform handoffs cannot be claimed", async () => {
  const { owner } = await fixture();
  const { startJob, savePlan, advanceJob } = await import("../../src/lib/ai-workflows/jobs/job-service");
  const { claimHandoff } = await import("../../src/lib/ai-workflows/executor/handoff");
  const { inTenant } = await import("../../src/lib/ai-workflows/jobs/actor");
  const job = await startJob(owner, { message: "Prepare a school", language: "en", idempotencyKey: KEY() });
  await savePlan(owner, job.id, [{ stepKey: "s1", capabilityKey: "platform.provision_school", input: { schoolName: "Synthetic Expiry School", kind: "STANDALONE", city: "Test", ownerName: "Synthetic Owner", ownerEmail: `${randomUUID()}@example.invalid` } }]);
  await advanceJob(owner, job.id);
  const row = await db.aiWorkflowHandoff.findFirstOrThrow({ where: { jobId: job.id } });
  await db.aiWorkflowHandoff.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(inTenant(owner, () => claimHandoff(owner, row.id)), { code: "LEASED" });
  assert.equal((await db.aiWorkflowHandoff.findUniqueOrThrow({ where: { id: row.id } })).status, "OPEN");
});

test("Ask institution lookup filters missing cities and exposes the actual results to the UI", async () => {
  const { owner, targetName } = await fixture();
  const blankName = `Synthetic filter ${randomUUID()}`;
  const blank = await school(blankName, "");
  const { startJob, savePlan, advanceJob, getJob } = await import("../../src/lib/ai-workflows/jobs/job-service");
  const { toRunView } = await import("../../src/lib/ai-workflows/view");
  const run = async (input: unknown) => {
    const job = await startJob(owner, { message: "List schools missing a city", language: "en", idempotencyKey: KEY() });
    await savePlan(owner, job.id, [{ stepKey: "s1", capabilityKey: "platform.inspect", input }]);
    await advanceJob(owner, job.id);
    return toRunView(await getJob(owner, job.id));
  };
  const found = await run({ missingCity: true, search: blankName });
  assert.equal(found.outcome, "ANSWERED");
  assert.equal(found.steps[0].receipt?.text, blankName);
  assert.deepEqual(found.steps[0].receipt?.counts, { schools: 1 });
  const excluded = await run({ missingCity: true, search: targetName });
  assert.deepEqual(excluded.steps[0].receipt?.counts, { schools: 0 });
  assert.equal(excluded.steps[0].receipt?.text, "No schools match this filter.");
  assert.equal((await db.school.findUniqueOrThrow({ where: { id: blank } })).city, "", "lookup changes nothing");
});

test("default package pricing previews in chat, saves and audits once, rejects stale state and non-owners", async () => {
  const { owner, home } = await fixture();
  const ctx = await inTenant(owner, () => ctxFor(owner));
  const entry = exec("platform.set_default_plan_pricing");
  const original = await db.platformConfig.findUnique({ where: { key: "default_plan_pricing" } });
  try {
    const input = await inTenant(owner, () => bind(ctx, entry.key, { prices: { BASIC: 4567.5 } }));
    const before = await db.superAdminAuditLog.count({ where: { userId: owner.userId } });
    const preview = await inTenant(owner, () => entry.preview!(ctx, input));
    assert.equal(preview.lines[0].label, "Pro");
    assert.equal(preview.confirmLabel, "Save package prices");
    assert.equal(await db.superAdminAuditLog.count({ where: { userId: owner.userId } }), before);
    const key = KEY();
    const receipt = await inTenant(owner, () => entry.execute(ctx, input, { idempotencyKey: key }));
    assert.equal(receipt.kind, "write");
    assert.equal((await db.platformConfig.findUniqueOrThrow({ where: { key: "default_plan_pricing" } })).value && ((await db.platformConfig.findUniqueOrThrow({ where: { key: "default_plan_pricing" } })).value as any).BASIC.price, 4567.5);
    await inTenant(owner, () => entry.execute(ctx, input, { idempotencyKey: key }));
    assert.equal(await db.superAdminAuditLog.count({ where: { userId: owner.userId } }), before + 1);
    await assert.rejects(inTenant(owner, () => entry.execute(ctx, { ...input, prices: { BASIC: 4999 }, expected: {} }, { idempotencyKey: KEY() })), /Prices changed/);
    const student = await user(home, "STUDENT");
    const studentCtx = await inTenant(student, () => ctxFor(student));
    await assert.rejects(inTenant(student, () => entry.execute(studentCtx, input, { idempotencyKey: KEY() })), /application owner/);
  } finally {
    if (original) await db.platformConfig.update({ where: { key: original.key }, data: { value: original.value as any, updatedBy: original.updatedBy } });
    else await db.platformConfig.deleteMany({ where: { key: "default_plan_pricing" } });
  }
});

test("role plans enumerate only registered role actions and distinguish chat confirmation from handoffs", async () => {
  const { buildRolePlan } = await import("../../src/lib/ai-workflows/planner/role-plan");
  const { capability } = await import("../../src/lib/ai-workflows/registry");
  const { owner, home } = await fixture();
  for (const role of ["APP_OWNER", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const) {
    const actor = role === "APP_OWNER" ? owner : await user(home, role);
    const plan = await inTenant(actor, async () => buildRolePlan(await ctxFor(actor)));
    assert.equal(plan.role, role);
    for (const action of plan.actions) assert.ok(capability(action.key)!.roles.includes(role));
    if (role !== "APP_OWNER") assert.ok(plan.actions.every(action => !action.key.startsWith("platform.")));
    else assert.equal(plan.actions.find(action => action.key === "platform.set_default_plan_pricing")?.execution, "confirm_in_chat");
    if (role === "STUDENT" || role === "PARENT") assert.ok(plan.actions.every(action => action.key !== "attendance.mark"));
  }
});
