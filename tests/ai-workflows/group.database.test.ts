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
import { resolve as effectivePolicy } from "../../src/lib/group-policy/service";
import { GROUP_ENTRIES } from "../../src/lib/ai-workflows/registry/domains/group/group";
import type { CapabilityContext, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * The group owner's entries (SUPER_ADMIN of a school group), exercised directly (resolve → preview → execute,
 * or resolve → prepare) until the lead wires them into the registry.
 */
const entry = <T extends ExecEntry<any> | HandoffEntry<any>>(key: string) => GROUP_ENTRIES.find(item => item.key === key) as T;
const exec = (key: string) => entry<ExecEntry<any>>(key);
const handoff = (key: string) => entry<HandoffEntry<any>>(key);
const KEY = () => `wf-test-${randomUUID()}`;

async function fixture(opts: { plan?: string; kind?: "GROUP" | "STANDALONE"; role?: "SUPER_ADMIN" | "ADMIN" } = {}) {
  const kind = opts.kind ?? "GROUP", role = opts.role ?? (kind === "GROUP" ? "SUPER_ADMIN" : "ADMIN");
  const schoolId = `group-${randomUUID()}`, gulbergId = randomUUID(), dhaId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic group", contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: opts.plan ?? "PRO", registrationKind: kind } });
  await db.campus.create({ data: { id: gulbergId, schoolId, regId: gulbergId, name: "Gulberg Campus", city: "Lahore" } });
  await db.campus.create({ data: { id: dhaId, schoolId, regId: dhaId, name: "DHA Campus", city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId: gulbergId, academicYear: 2026, label: "2026-27", status: "ACTIVE" } });
  await db.weekend.createMany({ data: [{ schoolId, campusId: gulbergId, dayOfWeek: 5 }, { schoolId, campusId: gulbergId, dayOfWeek: 7 }] });
  const pinned = role === "SUPER_ADMIN" ? null : gulbergId;
  await db.user.create({ data: { id: userId, schoolId, campusId: pinned, email: `${userId}@example.invalid`, fullName: "Synthetic owner", role, isActive: true, isInstitutionOwner: true, canPurchaseSubscription: true } });
  const staff = (fullName: string, staffRole: "TEACHER" | "CAMPUS_ADMIN", campusId: string) => db.user.create({ data: { schoolId, campusId, email: `${randomUUID()}@example.invalid`, fullName, role: staffRole, isActive: true } });
  const ahmed = await staff("Ahmed Raza", "TEACHER", dhaId), sana = await staff("Sana Malik", "CAMPUS_ADMIN", gulbergId);
  const user: AuthUser = { schoolId, campusId: pinned, userId, role, email: `${userId}@example.invalid`, fullName: "Synthetic owner", accessVersion: 0, institutionKind: kind, isInstitutionOwner: true, canPurchaseSubscription: true, mfaVerified: true };
  return { user, schoolId, gulbergId, dhaId, ahmed, sana };
}
const ctxFor = (user: AuthUser, campusId: string | null = null) => capabilityContext(user, campusId, "en");
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? `${error.code}${error.params.reason ? `:${error.params.reason}` : ""}` : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : `THROWN:${(error as Error).message}`; } };

async function bind(ctx: CapabilityContext, key: string, input: unknown) {
  const item = entry<ExecEntry<any> | HandoffEntry<any>>(key);
  const parsed = item.input.parse(input);
  return item.input.parse(item.resolve ? await item.resolve(ctx, parsed) : parsed);
}
async function confirmRun(ctx: CapabilityContext, key: string, input: unknown, idempotencyKey = KEY()) {
  const item = exec(key);
  const bound = await bind(ctx, key, input);
  const preview = item.preview ? await item.preview(ctx, bound) : null;
  const receipt = await item.execute(ctx, bound, { idempotencyKey });
  return { bound, preview, receipt };
}
async function prepare(ctx: CapabilityContext, key: string, input: unknown) {
  return handoff(key).handoff.prepare(ctx, await bind(ctx, key, input), { idempotencyKey: KEY() });
}

test("entries keep their static classes; class C entries never execute", () => {
  assert.deepEqual(GROUP_ENTRIES.map(item => [item.key, item.class]), [
    ["campus.create", "B"], ["campus.update_details", "B"], ["group_policy.create_template", "B"], ["group_policy.save_draft", "B"], ["group_policy.submit_for_review", "B"],
    ["identity.add_domain", "B"], ["staff.leader_invite_prepare", "B"], ["subscription.preview", "A"], ["readiness.view", "A"],
    ["group_policy.review_version", "C"], ["group_policy.decide_override", "C"], ["memberships.change_access", "C"], ["subscription.request_plan_change", "C"],
    ["staff.deactivate", "C"], ["governance.support_grant_decide", "C"], ["staff.leader_invite_send", "C"],
  ]);
  for (const item of GROUP_ENTRIES) {
    assert.deepEqual(item.roles, ["SUPER_ADMIN"], item.key);
    if (item.class === "C") assert.equal("execute" in item && item.execute !== undefined, false, item.key);
  }
});

test("campus.create: the campus and its calendar are created once; a replay reconciles", async () => {
  const { user, schoolId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user);
    assert.deepEqual(await runGates(ctx, exec("campus.create").gates), { ok: true });
    const key = KEY();
    const { preview, receipt } = await confirmRun(ctx, "campus.create", { name: "Johar Town", city: "Lahore", phone: "042 3571 0000" }, key);
    assert.equal(preview!.counts.campuses, 1);
    assert.ok(preview!.lines.some(line => line.value.includes("2026-27")), "the preview says which year is copied");
    const campusId = receipt.entities.find(item => item.model === "campus")!.id;
    assert.equal(receipt.counts.campuses, 1);
    assert.equal(receipt.counts.calendars, 1);
    assert.equal(receipt.link, "/super?view=campuses");
    assert.equal(await db.campus.count({ where: { schoolId } }), 3);
    assert.equal(await db.academicCycle.count({ where: { campusId, status: "ACTIVE", label: "2026-27" } }), 1, "the new campus copies the group's active year");
    assert.deepEqual((await db.weekend.findMany({ where: { campusId }, orderBy: { dayOfWeek: "asc" } })).map(row => row.dayOfWeek), [5, 7], "and its weekend");

    const replay = await exec("campus.create").execute(ctx, { name: "Johar Town", city: "Lahore", phone: "042 3571 0000" }, { idempotencyKey: key });
    assert.equal(replay.detail?.reconciled, true);
    assert.equal(replay.counts.campuses, 0);
    assert.equal(await db.campus.count({ where: { schoolId } }), 3, "a replay never adds a second campus");
    assert.equal(await db.academicCycle.count({ where: { campusId } }), 1, "nor a second calendar");

    assert.equal(await code(bind(ctx, "campus.create", { name: "gulberg campus", city: "Lahore" })), "DOMAIN_REFUSED:CAMPUS_NAME_TAKEN");
    assert.equal(await code(bind(ctx, "campus.create", { name: "Model Town", city: "Lahore", email: "not-an-email" })), "DOMAIN_REFUSED:CAMPUS_DETAILS_INVALID");
  });
});

test("campus.create over plan capacity is refused with a plan-change suggestion, and writes nothing", async () => {
  const { user, schoolId } = await fixture({ plan: "BASIC" });
  await within(user, async () => {
    const ctx = await ctxFor(user);
    const refused = await bind(ctx, "campus.create", { name: "Johar Town", city: "Lahore" }).catch(error => error);
    assert.ok(refused instanceof WorkflowError);
    assert.equal(refused.code, "DOMAIN_REFUSED");
    assert.equal(refused.params.reason, "PLAN_CAPACITY");
    assert.equal(refused.params.suggest, "subscription.request_plan_change");
    assert.equal(await code(exec("campus.create").execute(ctx, { name: "Johar Town", city: "Lahore" }, { idempotencyKey: KEY() })), "DOMAIN_REFUSED:PLAN_CAPACITY");
    assert.equal(await db.campus.count({ where: { schoolId } }), 2);
    const comparison = await exec("subscription.preview").execute(ctx, { extraCampuses: 1 }, { idempotencyKey: KEY() });
    assert.equal(comparison.kind, "read");
    assert.equal(comparison.detail?.proposedPlan, "PRO", "the smallest plan that fits three campuses");
    assert.equal(comparison.detail?.fits, true);
  });
});

test("RT13: one step names exactly one campus; two campuses, every campus or another pinned campus are refused", async () => {
  const { user, schoolId, gulbergId, dhaId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user);
    const audit = () => db.auditLog.count({ where: { schoolId, tableName: "campus" } });
    assert.equal(await code(bind(ctx, "campus.update_details", { campus: "Gulberg and DHA", changes: { phone: "042 1111 2222" } })), "DOMAIN_REFUSED:ONE_CAMPUS_PER_STEP");
    assert.equal(await code(bind(ctx, "campus.update_details", { campus: "Gulberg, DHA", changes: { phone: "042 1111 2222" } })), "DOMAIN_REFUSED:ONE_CAMPUS_PER_STEP");
    assert.equal(await code(bind(ctx, "campus.update_details", { campus: "all campuses", changes: { phone: "042 1111 2222" } })), "DOMAIN_REFUSED:ONE_CAMPUS_PER_STEP");
    assert.equal(await code(bind(ctx, "staff.leader_invite_prepare", { campus: "Gulberg اور DHA", role: "PRINCIPAL", fullName: "Hina Shah", email: "hina@example.invalid" })), "DOMAIN_REFUSED:ONE_CAMPUS_PER_STEP");
    assert.equal(await code(bind(ctx, "campus.update_details", { campus: "Model Town", changes: { phone: "042 1111 2222" } })), "INPUT:/campus");

    const pinned = await ctxFor(user, gulbergId);
    assert.equal(await code(bind(pinned, "campus.update_details", { campus: "DHA", changes: { phone: "042 1111 2222" } })), "SCOPE_DENIED", "a job pinned to Gulberg cannot act on DHA");
    assert.equal(await code(exec("campus.update_details").execute(pinned, { campus: "DHA", campusId: dhaId, changes: { phone: "042 1111 2222" } }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    assert.equal(await audit(), 0);
    assert.equal((await db.campus.findUniqueOrThrow({ where: { id: dhaId } })).phone, null);

    const { bound, preview, receipt } = await confirmRun(ctx, "campus.update_details", { campus: "dha", changes: { phone: "042 1111 2222" } });
    assert.equal(bound.campusId, dhaId);
    assert.equal(preview!.counts.changes, 1);
    assert.equal(receipt.counts.changes, 1);
    assert.equal((await db.campus.findUniqueOrThrow({ where: { id: dhaId } })).phone, "042 1111 2222");
    const again = await exec("campus.update_details").execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(again.counts.changes, 0, "the same values again change nothing");
    assert.equal(await audit(), 1, "one audit entry for the one real change");
  });
});

test("group policy: drafted and submitted, not live until reviewed; a replay does not submit twice", async () => {
  const { user, schoolId, gulbergId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user);
    const template = await confirmRun(ctx, "group_policy.create_template", { domain: "GRADING", title: "Group grading" });
    assert.deepEqual(template.bound.campusIds.length, 2, "every live campus when none is named");
    const replayTemplate = await exec("group_policy.create_template").execute(ctx, template.bound, { idempotencyKey: KEY() });
    assert.equal(replayTemplate.detail?.reconciled, true);
    assert.equal(await db.policyTemplate.count({ where: { schoolId } }), 1);

    const draft = await confirmRun(ctx, "group_policy.save_draft", { template: "grading", values: { passingPercentage: 40, gradeA: 80, gradeB: 70, gradeC: 60 }, overridableKeys: ["passingPercentage"] });
    assert.equal(draft.receipt.kind, "draft");
    assert.equal(draft.receipt.detail?.live, false);
    assert.equal(await code(bind(ctx, "group_policy.save_draft", { template: "grading", values: { termCount: 3 } })), "DOMAIN_REFUSED:KEY_NOT_IN_DOMAIN");

    const submit = await confirmRun(ctx, "group_policy.submit_for_review", { template: "Group grading", effectiveFrom: "2026-11-01" });
    assert.equal(submit.bound.reviewerId, user.userId, "the only group admin reviews their own version");
    assert.ok(submit.preview!.lines.some(line => line.value.startsWith("Submitted for review, not live")));
    assert.equal(submit.receipt.detail?.status, "IN_REVIEW");
    assert.equal(submit.receipt.detail?.live, false);
    const versions = await db.policyTemplateVersion.findMany({ where: { schoolId } });
    assert.deepEqual(versions.map(row => row.status), ["IN_REVIEW"]);
    const effective = await effectivePolicy(schoolId, gulbergId, "GRADING");
    assert.equal(effective.version, null, "no version applies at any campus while it waits for review");
    assert.ok(effective.rows.every(row => row.source === "CAMPUS"));

    const replay = await exec("group_policy.submit_for_review").execute(ctx, submit.bound, { idempotencyKey: KEY() });
    assert.equal(replay.detail?.reconciled, true);
    assert.equal(await db.policyEvent.count({ where: { schoolId, kind: "SUBMITTED" } }), 1);

    // Reviewing stays with the person: the hand-off opens Group standards and changes nothing.
    const review = await prepare(ctx, "group_policy.review_version", { template: "Group grading", decision: "APPROVE" });
    assert.equal(review.kind, "DOMAIN_SCREEN");
    assert.equal(review.prefill.versionId, versions[0].id);
    assert.equal(review.detail?.reasonRequired, true);
    assert.equal((await db.policyTemplateVersion.findUniqueOrThrow({ where: { id: versions[0].id } })).status, "IN_REVIEW");
  });
});

test("leader invitations are prepared unsent once, then handed to People & access to send with MFA", async () => {
  const { user, schoolId, dhaId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user);
    const input = { campus: "DHA", role: "PRINCIPAL", fullName: "Hina Shah", email: "Hina@Example.invalid" };
    const key = KEY();
    const { bound, receipt } = await confirmRun(ctx, "staff.leader_invite_prepare", input, key);
    assert.equal(receipt.detail?.delivery, "NOT_SENT");
    const invites = await db.staffInvitation.findMany({ where: { schoolId } });
    assert.equal(invites.length, 1);
    assert.equal(invites[0].campusId, dhaId);
    assert.equal(invites[0].deliveryStatus, "unknown", "nothing is emailed");
    const replay = await exec("staff.leader_invite_prepare").execute(ctx, bound, { idempotencyKey: key });
    assert.equal(replay.detail?.reconciled, true);
    assert.equal(await db.staffInvitation.count({ where: { schoolId } }), 1);
    assert.equal(await code(bind(ctx, "staff.leader_invite_prepare", { ...input, email: "other@example.invalid", fullName: "Other Person" })), "DOMAIN_REFUSED:LEADER_SEAT_TAKEN");

    const send = await prepare(ctx, "staff.leader_invite_send", { campus: "DHA" });
    assert.deepEqual(send.prefill.inviteIds, [invites[0].id]);
    assert.equal(send.detail?.mfaRequired, true);
    assert.equal((await db.staffInvitation.findUniqueOrThrow({ where: { id: invites[0].id } })).deliveryStatus, "unknown");
  });
});

test("identity domain is added as pending; a replay keeps the same token", async () => {
  const { user, schoolId } = await fixture();
  const connection = await db.identityConnection.create({ data: { schoolId, name: "Google Workspace", issuer: "https://accounts.example.invalid", clientId: "synthetic", createdById: user.userId } });
  await within(user, async () => {
    const ctx = await ctxFor(user);
    const { bound, receipt } = await confirmRun(ctx, "identity.add_domain", { domain: "Beacon.Example.edu" });
    assert.equal(receipt.detail?.status, "PENDING_VERIFICATION");
    const replay = await exec("identity.add_domain").execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(replay.detail?.reconciled, true);
    assert.equal(replay.detail?.token, receipt.detail?.token);
    const stored = await db.identityConnection.findUniqueOrThrow({ where: { id: connection.id } });
    assert.deepEqual(stored.verifiedDomains, []);
    assert.equal((stored.pendingDomains as unknown[]).length, 1);
  });
});

test("readiness is read per campus", async () => {
  const { user, gulbergId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user);
    const all = await exec("readiness.view").execute(ctx, {}, { idempotencyKey: KEY() });
    assert.equal(all.kind, "read");
    const campuses = all.detail?.campuses as Array<{ campusId: string; missing: string[]; campusAdmin: string }>;
    assert.equal(campuses.length, 2);
    const gulberg = campuses.find(row => row.campusId === gulbergId)!;
    assert.equal(gulberg.campusAdmin, "ACTIVE");
    assert.ok(!gulberg.missing.includes("NO_ACTIVE_YEAR"));
    assert.ok(campuses.find(row => row.campusId !== gulbergId)!.missing.includes("NO_ACTIVE_YEAR"));
    const one = await exec("readiness.view").execute(ctx, await bind(ctx, "readiness.view", { campus: "Gulberg" }), { idempotencyKey: KEY() });
    assert.equal((one.detail?.campuses as unknown[]).length, 1);
  });
});

test("class C entries prepare a hand-off and write nothing", async () => {
  const { user, schoolId, gulbergId, ahmed, sana } = await fixture();
  const incident = await db.supportIncident.create({ data: { schoolId, reference: `INC-${randomUUID().slice(0, 8)}`, purpose: "Check the fee setup at Gulberg", impact: "Fee invoices", ownerActorId: randomUUID() } });
  const grant = await db.supportGrant.create({ data: { schoolId, incidentId: incident.id, requestedById: randomUUID(), purpose: "Read the fee setup", scope: ["fees"], expiresAt: new Date(Date.now() + 86_400_000) } });
  const template = await db.policyTemplate.create({ data: { schoolId, domain: "CALENDAR", title: "Group calendar", campusIds: [gulbergId], createdById: user.userId } });
  const version = await db.policyTemplateVersion.create({ data: { schoolId, templateId: template.id, version: 1, status: "ACTIVE", values: { weekend: [5, 6] }, overridableKeys: ["weekend"], effectiveFrom: new Date("2026-01-01"), reviewedAt: new Date("2025-12-20"), activatedAt: new Date("2026-01-01"), submittedById: sana.id, reviewerId: user.userId, createdById: user.userId } });
  const override = await db.policyOverride.create({ data: { schoolId, campusId: gulbergId, templateId: template.id, versionId: version.id, key: "weekend", value: [0], reason: "Ramadan timing", requestedById: sana.id, validFrom: new Date(), validUntil: new Date(Date.now() + 30 * 86_400_000) } });
  const snapshot = async () => JSON.stringify({
    users: await db.user.findMany({ where: { schoolId }, select: { id: true, isActive: true, role: true, campusId: true, canManageMemberships: true, accessVersion: true }, orderBy: { id: "asc" } }),
    grants: await db.supportGrant.findMany({ where: { schoolId }, select: { id: true, status: true, approvedById: true } }),
    overrides: await db.policyOverride.findMany({ where: { schoolId }, select: { id: true, status: true } }),
    requests: await db.subscriptionRequest.count({ where: { schoolId } }),
    audit: await db.auditLog.count({ where: { schoolId } }),
    events: await db.policyEvent.count({ where: { schoolId } }),
  });
  await within(user, async () => {
    const ctx = await ctxFor(user);
    const before = await snapshot();
    const access = await prepare(ctx, "memberships.change_access", { person: "Sana Malik", change: "ALLOW_MEMBERSHIP_MANAGEMENT" });
    assert.equal(access.prefill.userId, sana.id);
    assert.equal(access.prefill.canManageMemberships, true);
    assert.equal(access.detail?.mfaRequired, true);
    const deactivate = await prepare(ctx, "staff.deactivate", { person: "Ahmed", campus: "DHA" });
    assert.equal(deactivate.prefill.userId, ahmed.id);
    assert.equal(await code(bind(ctx, "staff.deactivate", { person: "Ahmed", campus: "Gulberg" })), "INPUT:/person", "Ahmed is not on Gulberg");
    assert.equal(await code(bind(ctx, "staff.deactivate", { person: "Synthetic owner" })), "DOMAIN_REFUSED:OWN_ACCOUNT");
    const plan = await prepare(ctx, "subscription.request_plan_change", { plan: "PRO", billingPeriod: "ANNUAL" });
    assert.equal(plan.link, "/super?view=billing&plan=PRO&period=annual");
    const support = await prepare(ctx, "governance.support_grant_decide", { request: "fee setup", decision: "APPROVE" });
    assert.equal(support.prefill.grantId, grant.id);
    const exception = await prepare(ctx, "group_policy.decide_override", { campus: "Gulberg", setting: "weekend", decision: "APPROVE" });
    assert.equal(exception.prefill.overrideId, override.id);
    for (const prepared of [access, deactivate, plan, support, exception]) assert.equal(prepared.kind, "DOMAIN_SCREEN");
    assert.equal(await snapshot(), before, "no hand-off writes a record");
  });
});

test("a single school's ADMIN (and an ADMIN inside a group) is refused every group entry", async () => {
  for (const opts of [{ kind: "STANDALONE" as const, role: "ADMIN" as const }, { kind: "GROUP" as const, role: "ADMIN" as const }]) {
    const { user, schoolId } = await fixture(opts);
    await within(user, async () => {
      const ctx = await ctxFor(user, user.campusId);
      for (const item of GROUP_ENTRIES) assert.equal((await runGates(ctx, item.gates)).ok, false, `${opts.kind} ADMIN passes ${item.key}`);
      assert.equal(await code(exec("campus.create").execute(ctx, { name: "Johar Town", city: "Lahore" }, { idempotencyKey: KEY() })), "ROLE_NOT_ALLOWED");
      assert.equal(await code(exec("group_policy.create_template").execute(ctx, { domain: "GRADING", title: "Group grading" }, { idempotencyKey: KEY() })), "ROLE_NOT_ALLOWED");
      assert.equal(await code(handoff("staff.deactivate").handoff.prepare(ctx, { person: "Ahmed" }, { idempotencyKey: KEY() })), "ROLE_NOT_ALLOWED");
      assert.equal(await db.campus.count({ where: { schoolId } }), 2);
      assert.equal(await db.policyTemplate.count({ where: { schoolId } }), 0);
    });
  }
});
