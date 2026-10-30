import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPlanContract } from "@/config/commercial-contract";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import type { AuthUser } from "@/lib/auth";
import {
  SetupCompletionError,
  SetupConflictError,
  assertSetupPurchaser,
  assignSetupDelegate,
  completeSetup,
  resolveSetupActor,
  revokeSetupDelegate,
  saveSetup,
  setupTenantContext,
  setupView,
} from "@/lib/onboarding/setup-service";
import type { SetupStepId } from "@/lib/onboarding/setup-state";

// SKO-391 database acceptance. Only the isolated local database may be used.
const databaseUrl = new URL(process.env.DATABASE_URL || "http://invalid");
if (databaseUrl.hostname !== "127.0.0.1" || databaseUrl.port !== "55470" || databaseUrl.pathname !== "/sko391") {
  throw new Error("Use only the isolated local sko391 database on 127.0.0.1:55470");
}

const raw = new PrismaClient();
const schools: string[] = [];

type Kind = "STANDALONE" | "GROUP";
async function institution(kind: Kind, plan: "FREE" | "BASIC" | "PRO" = "FREE") {
  const schoolId = `setup391-${kind.toLowerCase()}-${randomUUID()}`;
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  const role = kind === "GROUP" ? "SUPER_ADMIN" : "ADMIN";
  schools.push(schoolId);
  await raw.school.create({ data: { id: schoolId, name: `Synthetic ${kind}`, slug: schoolId, regId: schoolId, contactEmail: email, city: "", status: "TRIAL", plan, registrationKind: kind, commercialContract: createPlanContract(plan) } });
  await raw.user.create({ data: { id: userId, email, fullName: "Synthetic owner", schoolId, role, isInstitutionOwner: true, canPurchaseSubscription: true, canManageMemberships: true, onboardingComplete: false } });
  const owner: AuthUser = { userId, email, role, schoolId, campusId: null, isInstitutionOwner: true, canPurchaseSubscription: true, canManageMemberships: true, onboardingComplete: false, accessVersion: 0 };
  return { schoolId, owner };
}

const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext(setupTenantContext(user), fn);
const view = (user: AuthUser) => as(user, async () => setupView(await resolveSetupActor(user)));

/** Walks the wizard the way the browser does: one completed save per step. */
async function walk(user: AuthUser, steps: { step: SetupStepId; patch?: (draft: any) => void; mode?: "EXAM_STUDIO" | "FULL_OPERATIONS"; type?: Kind }[]) {
  let current = await view(user);
  for (const { step, patch, mode, type } of steps) {
    const draft = structuredClone(current.draft);
    patch?.(draft);
    current = await as(user, () => saveSetup(user, { expectedVersion: current.version, step, complete: true, draft, adoptionMode: mode, institutionType: type }));
  }
  return current;
}

const campus = (key: string, name: string, regId: string) => ({ key, name, city: "Karachi", address: "", phone: "", email: "", website: "", principalName: "", regId, autoId: false, board: "Federal Board" });

async function counts(schoolId: string) {
  const campuses = await raw.campus.findMany({ where: { schoolId }, select: { id: true, name: true, regId: true } });
  const cycles = await raw.academicCycle.count({ where: { schoolId } });
  const weekends = await raw.weekend.count({ where: { schoolId } });
  return { campuses, cycles, weekends };
}

after(async () => {
  await raw.campus.deleteMany({ where: { schoolId: { in: schools } } }).catch(() => undefined);
  await raw.school.deleteMany({ where: { id: { in: schools } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("standalone setup asks identity once, creates one primary campus and owner membership, and a retried completion is a no-op", async () => {
  const { schoolId, owner } = await institution("STANDALONE");
  const first = await view(owner);
  assert.equal(first.institutionType, "STANDALONE");
  assert.deepEqual(first.flow, ["structure", "identity", "package", "academic", "review"]);
  assert.equal(first.draft.school.email, owner.email, "registration details are carried forward");

  const ready = await walk(owner, [
    { step: "structure", mode: "EXAM_STUDIO" },
    { step: "identity", patch: (d) => { d.school.name = "Synthetic Crescent School"; d.school.city = "Lahore"; d.school.primaryCampusRegId = `BR-${randomUUID().slice(0, 6)}`; } },
    { step: "package" },
    { step: "academic", patch: (d) => { d.school.weekends = [5, 6]; d.school.timezone = "Asia/Karachi"; } },
  ]);
  assert.equal(ready.currentStep, "review");

  const result = await as(owner, () => completeSetup(owner, ready.version));
  assert.equal(result.replayed, false);
  assert.equal(result.activatedCampusIds.length, 1);
  const after1 = await counts(schoolId);
  assert.equal(after1.campuses.length, 1);
  assert.equal(after1.campuses[0].name, "Synthetic Crescent School", "the primary campus uses the school details");
  assert.equal(after1.cycles, 1);
  assert.equal(after1.weekends, 2);
  const ownerRow = await raw.user.findUniqueOrThrow({ where: { id: owner.userId } });
  assert.equal(ownerRow.onboardingComplete, true);
  assert.equal(ownerRow.campusId, after1.campuses[0].id);
  assert.equal(ownerRow.role, "ADMIN");
  assert.equal(ownerRow.isInstitutionOwner, true);
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).registrationKind, "STANDALONE");

  // Retry the final request (lost response, double click): same result, nothing new.
  const retry = await as(owner, () => completeSetup(owner, ready.version));
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.activatedCampusIds, result.activatedCampusIds);
  const after2 = await counts(schoolId);
  assert.equal(after2.campuses.length, 1);
  assert.equal(after2.cycles, 1);
  assert.equal(await raw.auditLog.count({ where: { schoolId, tableName: "institution_setup" } }), 1);
});

test("two simultaneous completions write once", async () => {
  const { schoolId, owner } = await institution("STANDALONE");
  const ready = await walk(owner, [
    { step: "structure", mode: "FULL_OPERATIONS" },
    { step: "identity", patch: (d) => { d.school.city = "Quetta"; d.school.primaryCampusRegId = `BR-${randomUUID().slice(0, 6)}`; } },
    { step: "package" },
    { step: "academic" },
  ]);
  const results = await Promise.allSettled([as(owner, () => completeSetup(owner, ready.version)), as(owner, () => completeSetup(owner, ready.version))]);
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof completeSetup>>> => r.status === "fulfilled");
  assert.ok(fulfilled.length >= 1, JSON.stringify(results.map((r) => r.status === "rejected" ? String(r.reason) : "ok")));
  assert.equal(fulfilled.filter((r) => !r.value.replayed).length, 1);
  for (const r of results) if (r.status === "rejected") assert.ok(r.reason instanceof SetupConflictError);
  const c = await counts(schoolId);
  assert.equal(c.campuses.length, 1);
  assert.equal(c.cycles, 1);
});

test("a group with three campus drafts on a one-campus package activates one, keeps two drafts and stays a group", async () => {
  const { schoolId, owner } = await institution("GROUP", "FREE");
  const tag = randomUUID().slice(0, 6);
  const ready = await walk(owner, [
    { step: "structure", mode: "FULL_OPERATIONS" },
    { step: "identity", patch: (d) => { d.school.name = "Synthetic Horizon Schools"; d.school.city = "Karachi"; d.school.regId = `SKL-${tag}`; } },
    { step: "package" },
    { step: "campuses", patch: (d) => { d.campuses = [campus("n", "North campus", `BR-N${tag}`), campus("s", "South campus", `BR-S${tag}`), campus("e", "East campus", `BR-E${tag}`)]; } },
    { step: "academic" },
  ]);
  const result = await as(owner, () => completeSetup(owner, ready.version));
  assert.equal(result.institutionType, "GROUP");
  assert.equal(result.activatedCampusIds.length, 1);
  assert.deepEqual(result.draftCampusKeys, ["s", "e"]);
  const c = await counts(schoolId);
  assert.deepEqual(c.campuses.map((x) => x.name), ["North campus"]);
  assert.equal(c.cycles, 1);
  const setup = await raw.institutionSetup.findUniqueOrThrow({ where: { schoolId } });
  assert.equal(setup.status, "COMPLETED");
  assert.equal((setup.draft as any).campuses.length, 3, "draft campuses are preserved after activation");
  const school = await raw.school.findUniqueOrThrow({ where: { id: schoolId } });
  assert.equal(school.registrationKind, "GROUP");
  const ownerRow = await raw.user.findUniqueOrThrow({ where: { id: owner.userId } });
  assert.equal(ownerRow.role, "SUPER_ADMIN");
  assert.equal(ownerRow.campusId, null, "a group owner works across campuses");
});

test("a fault after the first group campus rolls everything back, leaves recoverable state, and the retry creates no duplicates", async () => {
  const { schoolId, owner } = await institution("GROUP", "PRO");
  const tag = randomUUID().slice(0, 6);
  const ready = await walk(owner, [
    { step: "structure", mode: "FULL_OPERATIONS" },
    { step: "identity", patch: (d) => { d.school.city = "Islamabad"; d.school.regId = `SKL-${tag}`; } },
    { step: "package" },
    { step: "campuses", patch: (d) => { d.campuses = [campus("a", "Alpha campus", `BR-A${tag}`), campus("b", "Beta campus", `BR-B${tag}`)]; } },
    { step: "academic" },
  ]);
  await assert.rejects(as(owner, () => completeSetup(owner, ready.version, { failAfterCampuses: 1 })), SetupCompletionError);
  const failed = await raw.institutionSetup.findUniqueOrThrow({ where: { schoolId } });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.failedStep, "campuses");
  assert.match(failed.lastError ?? "", /Nothing was activated/);
  assert.equal((failed.draft as any).campuses.length, 2, "drafts survive the failure");
  assert.equal((await counts(schoolId)).campuses.length, 0, "no half-created campus");
  assert.equal((await raw.user.findUniqueOrThrow({ where: { id: owner.userId } })).onboardingComplete, false, "no false-ready state");

  const resumed = await view(owner);
  assert.equal(resumed.status, "FAILED");
  const done = await as(owner, () => completeSetup(owner, resumed.version));
  assert.equal(done.activatedCampusIds.length, 2);
  const c = await counts(schoolId);
  assert.equal(c.campuses.length, 2);
  assert.equal(c.cycles, 2);
  assert.equal((await as(owner, () => completeSetup(owner, resumed.version))).replayed, true);
  assert.equal((await counts(schoolId)).campuses.length, 2);
});

test("a campus ID taken by another institution fails at the campus step and recovers after correction", async () => {
  const other = await institution("STANDALONE");
  const takenId = `BR-T${randomUUID().slice(0, 6)}`.toUpperCase();
  await raw.campus.create({ data: { schoolId: other.schoolId, name: "Other campus", city: "Multan", regId: takenId } });
  const { schoolId, owner } = await institution("GROUP", "PRO");
  const tag = randomUUID().slice(0, 6);
  const ready = await walk(owner, [
    { step: "structure", mode: "EXAM_STUDIO" },
    { step: "identity", patch: (d) => { d.school.city = "Peshawar"; d.school.regId = `SKL-${tag}`; } },
    { step: "package" },
    { step: "campuses", patch: (d) => { d.campuses = [campus("a", "First campus", `BR-F${tag}`), campus("b", "Second campus", takenId)]; } },
    { step: "academic" },
  ]);
  const error = await as(owner, () => completeSetup(owner, ready.version)).then(() => null, (e) => e);
  assert.ok(error instanceof SetupCompletionError);
  assert.equal(error.failedStep, "campuses");
  assert.match(error.message, /Second campus/);
  assert.equal((await counts(schoolId)).campuses.length, 0);

  let state = await view(owner);
  const draft = structuredClone(state.draft);
  draft.campuses[1].regId = `BR-G${tag}`;
  state = await as(owner, () => saveSetup(owner, { expectedVersion: state.version, step: "campuses", complete: true, nextStep: "review", draft }));
  assert.equal(state.lastError, null, "re-saving the failing step clears the failure");
  await as(owner, () => completeSetup(owner, state.version));
  assert.equal((await counts(schoolId)).campuses.length, 2);
});

test("stale saves are rejected and plain saves keep validated progress", async () => {
  const { owner } = await institution("STANDALONE");
  const s1 = await walk(owner, [{ step: "structure", mode: "EXAM_STUDIO" }]);
  await as(owner, () => saveSetup(owner, { expectedVersion: s1.version, step: "identity", complete: false, draft: { ...s1.draft, school: { ...s1.draft.school, city: "Sialkot" } } }));
  await assert.rejects(as(owner, () => saveSetup(owner, { expectedVersion: s1.version, step: "identity", complete: false })), SetupConflictError);
  const latest = await view(owner);
  assert.equal(latest.draft.school.city, "Sialkot");
  assert.deepEqual(latest.completedSteps, ["structure"]);
  assert.equal(latest.currentStep, "identity", "resumes at the exact saved step");
});

test("changing a standalone draft to a group keeps campus drafts and re-opens dependent steps", async () => {
  const { owner } = await institution("GROUP", "FREE");
  const tag = randomUUID().slice(0, 6);
  const grouped = await walk(owner, [
    { step: "structure", mode: "FULL_OPERATIONS" },
    { step: "identity", patch: (d) => { d.school.city = "Hyderabad"; d.school.regId = `SKL-${tag}`; } },
    { step: "package" },
    { step: "campuses", patch: (d) => { d.campuses = [campus("a", "A campus", `BR-A${tag}`), campus("b", "B campus", `BR-B${tag}`)]; } },
  ]);
  const standalone = await as(owner, () => saveSetup(owner, { expectedVersion: grouped.version, step: "structure", complete: true, institutionType: "STANDALONE", nextStep: "identity" }));
  assert.equal(standalone.institutionType, "STANDALONE");
  assert.equal(standalone.draft.campuses.length, 2, "campus drafts are never discarded");
  assert.ok(!standalone.completedSteps.includes("campuses" as never));
  const back = await as(owner, () => saveSetup(owner, { expectedVersion: standalone.version, step: "structure", complete: true, institutionType: "GROUP" }));
  assert.equal(back.draft.campuses.length, 2);
});

test("handover: a named delegate resumes the same task, a revoked delegate is denied, and purchase rights need explicit delegation", async () => {
  const { schoolId, owner } = await institution("GROUP", "BASIC");
  const tag = randomUUID().slice(0, 6);
  const midway = await walk(owner, [
    { step: "structure", mode: "EXAM_STUDIO" },
    { step: "identity", patch: (d) => { d.school.city = "Faisalabad"; d.school.regId = `SKL-${tag}`; } },
  ]);
  assert.equal(midway.currentStep, "package");

  const first = await as(owner, () => assignSetupDelegate(owner, { fullName: "Synthetic Delegate One", email: `one-${tag}@example.invalid`, canPurchaseSubscription: false }));
  assert.ok(first.temporaryPassword.length >= 12);
  const firstRow = await raw.user.findFirstOrThrow({ where: { schoolId, email: first.email } });
  assert.equal(firstRow.isInstitutionOwner, false);
  assert.equal(firstRow.canManageMemberships, false);
  assert.equal(firstRow.mustChangePassword, true);
  const delegateOne: AuthUser = { userId: firstRow.id, email: firstRow.email, role: firstRow.role, schoolId, campusId: null, isInstitutionOwner: false, canPurchaseSubscription: false, onboardingComplete: false, accessVersion: firstRow.accessVersion };

  const asDelegate = await view(delegateOne);
  assert.equal(asDelegate.actor.kind, "delegate");
  assert.equal(asDelegate.currentStep, "package", "the delegate resumes the persisted step");
  assert.equal(asDelegate.actor.canPurchase, false);
  await assert.rejects(as(delegateOne, () => assertSetupPurchaser(delegateOne)), /cannot access/i);
  await assert.rejects(as(delegateOne, () => assignSetupDelegate(delegateOne, { fullName: "Nope", email: `x-${tag}@example.invalid`, canPurchaseSubscription: true })));

  const progressed = await walk(delegateOne, [
    { step: "package" },
    { step: "campuses", patch: (d) => { d.campuses = [campus("a", "Delegate campus", `BR-D${tag}`)]; } },
    { step: "academic" },
  ]);
  assert.equal(progressed.currentStep, "review");

  // Owner changes the implementation owner: revoke one, name another.
  await as(owner, () => revokeSetupDelegate(owner));
  const revokedRow = await raw.user.findUniqueOrThrow({ where: { id: firstRow.id } });
  assert.equal(revokedRow.isActive, false);
  assert.equal(revokedRow.accessVersion, firstRow.accessVersion + 1);
  await assert.rejects(as(delegateOne, () => completeSetup(delegateOne, progressed.version)), /cannot access/i, "the old review submission is refused");
  await assert.rejects(as(delegateOne, () => saveSetup(delegateOne, { expectedVersion: progressed.version, step: "review", complete: false })), /cannot access/i);

  const second = await as(owner, () => assignSetupDelegate(owner, { fullName: "Synthetic Delegate Two", email: `two-${tag}@example.invalid`, canPurchaseSubscription: true }));
  const secondRow = await raw.user.findFirstOrThrow({ where: { schoolId, email: second.email } });
  const delegateTwo: AuthUser = { userId: secondRow.id, email: secondRow.email, role: secondRow.role, schoolId, campusId: null, isInstitutionOwner: false, canPurchaseSubscription: true, onboardingComplete: false, accessVersion: secondRow.accessVersion };
  await as(delegateTwo, () => assertSetupPurchaser(delegateTwo));
  const resumed = await view(delegateTwo);
  assert.equal(resumed.currentStep, "review");
  assert.equal(resumed.draft.campuses[0].name, "Delegate campus");

  const done = await as(delegateTwo, () => completeSetup(delegateTwo, resumed.version));
  assert.equal(done.activatedCampusIds.length, 1);
  const ownerAfter = await raw.user.findUniqueOrThrow({ where: { id: owner.userId } });
  assert.equal(ownerAfter.onboardingComplete, true, "the owner is not sent back into setup");
  assert.equal(ownerAfter.isInstitutionOwner, true);
  const delegateAfter = await raw.user.findUniqueOrThrow({ where: { id: secondRow.id } });
  assert.equal(delegateAfter.isInstitutionOwner, false, "handover never grants ownership");
  assert.equal(delegateAfter.canManageMemberships, false);
});

test("invitees, other staff and other tenants cannot open or buy for this setup", async () => {
  const { schoolId, owner } = await institution("GROUP");
  await view(owner);
  const staffId = randomUUID();
  await raw.user.create({ data: { id: staffId, email: `${staffId}@example.invalid`, fullName: "Synthetic admin", schoolId, role: "SUPER_ADMIN", isInstitutionOwner: false, onboardingComplete: true } });
  const staff: AuthUser = { userId: staffId, email: `${staffId}@example.invalid`, role: "SUPER_ADMIN", schoolId, campusId: null, isInstitutionOwner: false, canPurchaseSubscription: true, onboardingComplete: false };
  await assert.rejects(view(staff), /cannot access/i);
  await assert.rejects(as(staff, () => assertSetupPurchaser(staff)), /cannot access/i);
  for (const role of ["TEACHER", "PARENT", "STUDENT", "PRINCIPAL"] as const) {
    const user: AuthUser = { ...staff, role, isInstitutionOwner: true };
    await assert.rejects(view(user), /cannot access/i, role);
  }
  // An owner flag whose email does not match the registering account is not the creator.
  await assert.rejects(view({ ...owner, email: "someone-else@example.invalid" }), /cannot access/i);
  const outsider = await institution("STANDALONE");
  const outsiderView = await view(outsider.owner);
  assert.notEqual(outsiderView.id, (await view(owner)).id);
});
