import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import type { generateAIDraft } from "../../src/lib/ai/openai";
import { startJob, advanceJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

async function fixture(role: AuthUser["role"]) {
  const schoolId = `plan-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic planner school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic Planner Person", role, isActive: true } });
  const cycle = await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026-27", status: "ACTIVE", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") } });
  const klass = await db.class.create({ data: { schoolId, campusId, name: "7", section: "B", academicYear: 2026, status: "ACTIVE" } });
  await db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName: "Zainab Qureshi", rollNo: "R-1", gender: "FEMALE", guardianName: "Imran Qureshi", guardianPhone: "+923001234567" } });
  const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, fullName: "Synthetic Planner Person", accessVersion: 0 };
  return { user, schoolId, campusId, cycle, klass };
}

/** A stub provider that records prompts and replays scripted replies. */
function provider(...replies: unknown[]) {
  const prompts: string[] = [];
  const generate: typeof generateAIDraft = async ({ prompt }) => {
    prompts.push(prompt);
    const reply = replies.shift();
    return { text: typeof reply === "string" ? reply : JSON.stringify(reply), model: "synthetic:test", tokensUsed: 40, promptVersion: "test" };
  };
  return { generate, prompts };
}
const begin = (user: AuthUser, message: string) => startJob(user, { message, language: "en", idempotencyKey: `k-${randomUUID()}` });

test("a teacher's plain request becomes a plan that runs end to end, charged one credit", async () => {
  const { user } = await fixture("TEACHER");
  const job = await begin(user, "Please set my language to Urdu");
  const model = provider({ kind: "plan", steps: [{ key: "s1", capability: "profile.update", input: { preferredLanguage: "ur" }, evidence: [{ pointer: "/preferredLanguage", quote: "set my language to Urdu" }] }] });
  const done = await advanceJob(user, job.id, "request", model.generate);
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.outcome, "EXECUTED");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.userId } })).preferredLanguage, "ur");
  const usage = await db.aIUsageLog.findMany({ where: { schoolId: user.schoolId, feature: "AI_WORKFLOWS_V2" } });
  assert.equal(usage.length, 1);
  assert.equal((await db.school.findUniqueOrThrow({ where: { id: user.schoolId } })).aiCreditsUsed, 1);
});

test("a capability outside the role is refused, recorded as a gap, and nothing changes", async () => {
  const { user } = await fixture("TEACHER");
  const job = await begin(user, "Generate October invoices for 7B");
  const model = provider({ kind: "plan", steps: [{ key: "s1", capability: "fees.generate_invoices", input: {}, evidence: [] }] });
  const done = await advanceJob(user, job.id, "request", model.generate);
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.outcome, "NOT_SUPPORTED");
  assert.equal(await db.aiWorkflowStep.count({ where: { jobId: job.id } }), 0);
  assert.equal(await db.aiCapabilityGap.count({ where: { schoolId: user.schoolId, actorRole: "TEACHER" } }), 1);
  assert.ok(!model.prompts[0].includes("fees.generate_invoices"), "the teacher was never shown the finance capability");
});

test("handles bind to this campus's records; the prompt carries no ids and no learner or guardian names", async () => {
  const { user, cycle, klass } = await fixture("CAMPUS_ADMIN");
  const job = await begin(user, "Create class 8 with sections A and B for 2026-27; Zainab's father Imran asked");
  const model = provider({ kind: "plan", steps: [{ key: "s1", capability: "academics.setup_year", input: { operation: "academics.setup_year", existingCycleId: "cycle:1", academicYear: 2026, label: "2026-27", startDate: null, endDate: null, classes: [{ id: "c8a", name: "8", section: "A", teachingMode: "SUBJECT" }, { id: "c8b", name: "8", section: "B", teachingMode: "SUBJECT" }] }, evidence: [{ pointer: "/classes", quote: "Create class 8 with sections A and B" }] }] });
  const result = await advanceJob(user, job.id, "request", model.generate);
  assert.equal(result.status, "WAITING_CONFIRM", "class creation waits for the user to confirm");
  const step = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal((step.boundInput as { existingCycleId: string }).existingCycleId, cycle.id);
  for (const secret of [cycle.id, klass.id, "Zainab", "Imran", "Qureshi", user.email]) assert.ok(!model.prompts[0].includes(secret), `${secret} reached the provider`);
  assert.ok(model.prompts[0].includes("class:1") && model.prompts[0].includes("7 B"), "class labels and handles are visible");
  assert.equal(await db.class.count({ where: { schoolId: user.schoolId } }), 1, "nothing created before confirmation");
});

test("an id the model invented, or a value the user never said, becomes a question instead of an action", async () => {
  const { user } = await fixture("CAMPUS_ADMIN");
  const job = await begin(user, "Add a campus phone log entry for a call from Mr Ahmed about admissions");
  const model = provider({ kind: "plan", steps: [{ key: "s1", capability: "front_desk.call_log", input: { name: "Mr Ahmed", phone: "03001112223", direction: "IN", date: "2026-10-24T10:00", purpose: "Fee complaint", sensitive: false }, evidence: [{ pointer: "/name", quote: "a call from Mr Ahmed" }, { pointer: "/purpose", quote: "about admissions" }, { pointer: "/phone", quote: "Mr Ahmed" }] }] });
  const result = await advanceJob(user, job.id, "request", model.generate);
  assert.equal(result.status, "NEEDS_INPUT");
  const step = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
  assert.ok(step.missingFields.includes("/phone"), "the phone number was never given");
  assert.ok(step.missingFields.includes("/purpose"), "'Fee complaint' is not what the user said");
  assert.ok(!step.missingFields.includes("/name"));
  assert.equal(await db.phoneCallLog.count({ where: { schoolId: user.schoolId } }), 0);
  assert.ok((await db.aiWorkflowQuestion.count({ where: { jobId: job.id, status: "OPEN" } })) >= 2);
});

test("a malformed reply gets one repair; the repair costs no second credit", async () => {
  const { user } = await fixture("TEACHER");
  const job = await begin(user, "Set my city to Lahore");
  const model = provider("not json at all", { kind: "plan", steps: [{ key: "s1", capability: "profile.update", input: { city: "Lahore" }, evidence: [] }] });
  const done = await advanceJob(user, job.id, "request", model.generate);
  assert.equal(done.outcome, "EXECUTED");
  assert.equal(model.prompts.length, 2);
  assert.equal((await db.school.findUniqueOrThrow({ where: { id: user.schoolId } })).aiCreditsUsed, 1);
  assert.equal(await db.aIUsageLog.count({ where: { schoolId: user.schoolId, feature: "AI_WORKFLOWS_V2" } }), 2, "both attempts are logged");
});

test("a question about records is answered as a read, never as an executed change", async () => {
  const { user } = await fixture("CAMPUS_ADMIN");
  const job = await begin(user, "How many classes do we have?");
  const model = provider({ kind: "answer", answer: "You have 1 active class: 7 B.", steps: [] });
  const done = await advanceJob(user, job.id, "request", model.generate);
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.outcome, "ANSWERED");
});

test("a request that asks for something the model cannot plan asks one question and waits", async () => {
  const { user } = await fixture("TEACHER");
  const job = await begin(user, "Fix it");
  const model = provider({ kind: "ask", question: "What would you like to change?", steps: [] });
  const done = await advanceJob(user, job.id, "request", model.generate);
  assert.equal(done.status, "NEEDS_INPUT");
  assert.equal(await db.aiWorkflowQuestion.count({ where: { jobId: job.id, promptKey: "MODEL" } }), 1);
});
