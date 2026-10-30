import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { generateSetupWorkflows, getSetupGeneration, getSetupGenerationState } from "../../src/lib/school-ai/setup-generation-service";
import { ONBOARDING_ANSWER_KEYS, parseWorkspaceData } from "../../src/lib/school-ai/schemas";
import type { OnboardingData } from "../../src/lib/school-ai/types";
import type { generateAIDraft } from "../../src/lib/ai/openai";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient();
const schoolId = `setupgen-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID();
const admin: AuthUser = { userId: randomUUID(), schoolId, campusId, role: "CAMPUS_ADMIN", email: "setup-lead@example.invalid", fullName: "Synthetic setup lead", accessVersion: 0 };
const other: AuthUser = { ...admin, userId: randomUUID(), campusId: otherCampusId, email: "other-setup@example.invalid" };
const within = <T>(work: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: admin.userId, role: admin.role }, work);
const data = (): OnboardingData => ({
  path: "new", step: "review", confirmedKeys: ONBOARDING_ANSWER_KEYS.filter(key => key !== "migrationSource"),
  answers: { schoolName: "Synthetic School", country: "Pakistan", timezone: "Asia/Karachi", campuses: "Main", grades: "Grade 8", academicYear: "2026–2027", startDate: "2026-08-01", endDate: "2027-06-30", workingDays: "Monday–Friday", firstOutcome: "complete", curriculum: "Grade 8 Mathematics: fractions, decimals, ratios and algebra.", assessmentPolicy: "Monthly tests: 20 marks. Pass threshold: 50%.", feePolicy: "Monthly PKR 5000, due on the 10th.", communications: "School notices require review before guardian email.", resources: "Two classrooms and one laboratory.", staff: "PrivateSyntheticTeacherName", students: "PrivateSyntheticStudentName" },
});
const source = () => createWorkspaceRecord(admin, { kind: "ONBOARDING", campusId, title: "Questionnaire", data: data() as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
const inputFor = (record: { id: string; version: number }) => ({ recordId: record.id, expectedVersion: record.version, language: "en" as const });
const creditCount = async () => (await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed;
const synthetic: typeof generateAIDraft = async ({ prompt }) => {
  assert.equal(prompt.includes("PrivateSyntheticTeacherName"), false);
  assert.equal(prompt.includes("PrivateSyntheticStudentName"), false);
  const context = JSON.parse(prompt) as { draftTypes: Array<{ key: string }> };
  return { text: JSON.stringify({ summary: "Prepared your academic setup, operating briefs and policies for review.", notes: context.draftTypes.map(draft => ({ key: draft.key, detail: "Review the supplied school facts before applying this draft.", checklist: ["Check the saved facts and confirm the proposed details."] })) }), tokensUsed: 30, model: "synthetic:setup-test", promptVersion: "test" };
};

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic setup school", slug: schoolId, regId: schoolId, contactEmail: "setup@example.invalid", city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campusId, otherCampusId]) await raw.campus.create({ data: { id, schoolId, name: "Synthetic", regId: id, city: "Synthetic" } });
  for (const user of [admin, other]) await raw.user.create({ data: { id: user.userId, schoolId, campusId: user.campusId, role: user.role, email: user.email, fullName: user.fullName!, onboardingComplete: true } });
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("completed questions save a useful atomic live package once, with no operational execution", async () => {
  const record = await source(), before = await creditCount();
  let calls = 0;
  const dependencies = { configured: () => true, generate: async (args: Parameters<typeof generateAIDraft>[0]) => { calls++; return synthetic(args); } };
  const result = await within(() => generateSetupWorkflows(admin, inputFor(record), dependencies));
  assert.equal(result.mode, "live");
  assert.equal(result.records.length, 9);
  for (const output of result.records) { assert.equal(output.status, "DRAFT"); assert.doesNotThrow(() => parseWorkspaceData(output.kind, output.data)); }
  const academic = result.records.find(output => (output.data as { proposal?: { operation?: string } }).proposal?.operation === "academics.setup_year")!;
  assert.ok(academic);
  assert.match(JSON.stringify(result.records.find(output => output.title === "Fee policy draft")!.data), /PKR 5000/);
  assert.match(JSON.stringify(result.records.find(output => output.title === "Assessment policy draft")!.data), /20 marks/);
  assert.equal(await raw.class.count({ where: { schoolId } }), 0);
  assert.equal(await raw.academicCycle.count({ where: { schoolId } }), 0);
  assert.equal(await raw.schoolAiExecution.count({ where: { schoolId } }), 0);
  assert.equal(await creditCount(), before + 1);
  const replay = await within(() => generateSetupWorkflows(admin, inputFor(record), dependencies));
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.records.map(item => item.id), result.records.map(item => item.id));
  assert.equal(calls, 1);
  const approved = await updateWorkspaceRecord(admin, record.id, { version: record.version, action: "approve" });
  const restored = await getSetupGeneration(admin, inputFor(approved));
  assert.deepEqual(restored?.records.map(item => item.id), result.records.map(item => item.id));
  assert.equal(restored?.sourceVersion, record.version);
  assert.equal(restored?.currentSourceVersion, approved.version);
  assert.equal(await creditCount(), before + 1);
});

test("provider failure and missing credentials produce labeled persisted drafts without charging", async () => {
  for (const configured of [true, false]) {
    const record = await source(), before = await creditCount();
    const result = await within(() => generateSetupWorkflows(admin, inputFor(record), { configured: () => configured, generate: async () => { throw new Error("PRIVATE_PROVIDER_ERROR secret"); } }));
    assert.equal(result.mode, "prototype");
    assert.equal(result.records.length, 9);
    assert.equal(JSON.stringify(result).includes("PRIVATE_PROVIDER_ERROR"), false);
    assert.ok(result.reason);
    assert.match(JSON.stringify(result.records[0].data), /without live AI/);
    assert.equal(await creditCount(), before);
    assert.equal((await getSetupGeneration(admin, inputFor(record)))?.mode, "prototype");
  }
});

test("changed answers get a new package; stale and cross-campus requests cannot generate", async () => {
  const record = await source();
  const original = await within(() => generateSetupWorkflows(admin, inputFor(record), { configured: () => false }));
  const changed = await updateWorkspaceRecord(admin, record.id, { version: record.version, data: { ...data(), answers: { ...data().answers, feePolicy: "Monthly PKR 6000, due on the 12th." } } });
  await assert.rejects(() => generateSetupWorkflows(admin, inputFor(record), { configured: () => false }), { status: 409 });
  assert.equal(await getSetupGeneration(admin, inputFor(changed)), null);
  const next = await within(() => generateSetupWorkflows(admin, inputFor(changed), { configured: () => false }));
  assert.ok(next.records.every(item => !original.records.some(prior => prior.id === item.id)));
  assert.match(JSON.stringify(next.records.find(item => item.title === "Fee policy draft")!.data), /6000/);
  await assert.rejects(() => generateSetupWorkflows(other, inputFor(changed), { configured: () => false }), { status: 404 });
});

test("changed answers or revoked permission during provider work roll back every generated draft and charge", async () => {
  for (const revoke of [false, true]) {
    const record = await source(), before = await creditCount();
    const count = await raw.schoolAiRecord.count({ where: { schoolId, kind: { not: "ONBOARDING" } } });
    try {
      await assert.rejects(() => within(() => generateSetupWorkflows(admin, inputFor(record), { configured: () => true, generate: async args => {
        const reply = await synthetic(args);
        if (revoke) await raw.rolePermission.create({ data: { schoolId, role: admin.role, module: "fees", canView: true, canAdd: false, canEdit: true, canDelete: false } });
        else await updateWorkspaceRecord(admin, record.id, { version: record.version, data: { ...data(), answers: { ...data().answers, grades: "Grade 9" } } });
        return reply;
      } })), { status: revoke ? 403 : 409 });
    } finally { if (revoke) await raw.rolePermission.deleteMany({ where: { schoolId, role: admin.role, module: "fees" } }); }
    assert.equal(await raw.schoolAiRecord.count({ where: { schoolId, kind: { not: "ONBOARDING" } } }), count);
    assert.equal(await creditCount(), before);
  }
});

test("concurrent retries expose processing and generate exactly one package", async () => {
  const record = await source(), before = await creditCount();
  let dispatched!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { dispatched = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = within(() => generateSetupWorkflows(admin, inputFor(record), { configured: () => true, generate: async args => { dispatched(); await gate; return synthetic(args); } }));
  await started;
  try {
    assert.deepEqual(await getSetupGenerationState(admin, inputFor(record)), { generation: null, processing: true });
    await assert.rejects(() => generateSetupWorkflows(admin, inputFor(record), { configured: () => false }), { status: 409, code: "SETUP_GENERATION_PROCESSING" });
  } finally { release(); }
  const result = await pending;
  assert.equal(result.records.length, 9);
  assert.equal((await getSetupGenerationState(admin, inputFor(record))).processing, false);
  assert.equal(await creditCount(), before + 1);
});

test("an expired attempt can recover locally and a late provider cannot overwrite or charge it", async () => {
  const record = await source(), before = await creditCount();
  let dispatched!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { dispatched = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = within(() => generateSetupWorkflows(admin, inputFor(record), { configured: () => true, generate: async args => { dispatched(); await gate; return synthetic(args); } }));
  await started;
  const request = await raw.schoolAiRequest.findFirstOrThrow({ where: { schoolId, actorId: admin.userId, status: "PENDING", contextVersions: { path: [record.id], equals: record.version } } });
  await raw.schoolAiRequest.update({ where: { id: request.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
  assert.deepEqual(await getSetupGenerationState(admin, inputFor(record)), { generation: null, processing: false });
  const recovered = await within(() => generateSetupWorkflows(admin, inputFor(record), { configured: () => false }));
  const refusedLate = assert.rejects(pending, { status: 409, code: "SETUP_GENERATION_EXPIRED" });
  release();
  await refusedLate;
  assert.equal(recovered.mode, "prototype");
  assert.deepEqual((await getSetupGeneration(admin, inputFor(record)))?.records.map(item => item.id), recovered.records.map(item => item.id));
  assert.equal(await creditCount(), before);
});
