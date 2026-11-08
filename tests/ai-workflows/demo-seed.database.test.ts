import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { getJob, listJobs } from "../../src/lib/ai-workflows/jobs/job-service";
import { toRunView } from "../../src/lib/ai-workflows/view";
import { AL_NOOR_DEMO_SLUG, DEMO_SCHOOL_SLUGS, RECORDED_PLANNER_MODEL, isDemoSchool, isRecordedDemoRun } from "../../src/lib/ai-workflows/demo";
import { AL_NOOR_SCHOOL_ID, RECORDED_BEATS, assertDatabaseAllowed, recordedRuns, removeTenant, seedAiWorkflowsDemo } from "../../scripts/demo/seed-ai-workflows-demo";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient();
after(async () => { await removeTenant(db); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * The LEAP demo tenant (Slice 9): seeding twice leaves it as it was, every recorded run reopens from the
 * actor's own run list with the receipts the engine produced, and the school carries the demo badge flag.
 */
const PASSWORD = "synthetic-demo-test-only-0001";

async function userFor(actorId: string): Promise<AuthUser> {
  const row = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  return { userId: row.id, schoolId: row.schoolId, campusId: row.campusId, role: row.role as AuthUser["role"], email: row.email, accessVersion: row.accessVersion ?? 0, institutionKind: "STANDALONE", ...(row.isInstitutionOwner ? { isInstitutionOwner: true } : {}) };
}

test("the seed refuses a database that is not loopback unless the demo environment is named on purpose", () => {
  assert.throws(() => assertDatabaseAllowed("postgresql://u@db.example.com:5432/app", {}), /Refusing/);
  assert.doesNotThrow(() => assertDatabaseAllowed("postgresql://u@db.example.com:5432/app", { DEMO_RESET_ALLOW_REMOTE: "1" }));
  assert.doesNotThrow(() => assertDatabaseAllowed("postgresql://u@127.0.0.1:55438/ai_workflows_test", {}));
});

test("Al-Noor seeds once, a second run changes nothing, and every recorded run reopens with its receipts", { timeout: 600_000 }, async () => {
  const first = await seedAiWorkflowsDemo(db, PASSWORD, { reset: true });
  assert.equal(first.created, true);
  const second = await seedAiWorkflowsDemo(db, PASSWORD);
  assert.equal(second.created, false, "a complete tenant is left as it is");
  assert.equal(second.fingerprint, first.fingerprint);
  assert.deepEqual(second.counts, first.counts);

  // The cast: no principal; admin, approver admin, two active teachers, accountant, parent, librarian.
  const roles = (await db.user.findMany({ where: { schoolId: AL_NOOR_SCHOOL_ID }, select: { role: true, isActive: true } }));
  assert.deepEqual(roles.map(row => row.role).sort(), ["ACCOUNTANT", "ADMIN", "ADMIN", "LIBRARIAN", "PARENT", "TEACHER", "TEACHER"]);
  assert.ok(roles.every(row => row.isActive));
  const sevenB = await db.class.findFirstOrThrow({ where: { schoolId: AL_NOOR_SCHOOL_ID, name: "Grade 7", section: "B" } });
  const pupils = await db.student.findMany({ where: { classId: sevenB.id }, select: { fullName: true } });
  assert.equal(pupils.length, 33);
  assert.equal(pupils.filter(pupil => pupil.fullName.startsWith("Ali ")).length, 2, "two Alis for the disambiguation beat");

  const runs = await recordedRuns(db);
  assert.equal(runs.length, Object.keys(RECORDED_BEATS).length);
  for (const run of runs) {
    const job = await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: run.jobId } });
    const user = await userFor(job.actorId);
    assert.ok((await listJobs(user)).some(row => row.id === job.id), `${run.beat} is in its actor's run list`);
    const view = toRunView(await getJob(user, job.id));
    assert.equal(view.status, "COMPLETED", `${run.beat}: ${JSON.stringify(view.steps.map(step => [step.capabilityKey, step.state, step.errorCode]))}`);
    if (run.beat !== "adminBuild") assert.ok(isRecordedDemoRun(job), `${run.beat} carries the recorded-run key`);
    const events = await db.aiWorkflowEvent.findMany({ where: { jobId: job.id }, select: { type: true } });
    assert.ok(events.some(event => event.type === "JOB_COMPLETED"), `${run.beat} has its completion event`);
    if (run.beat === "librarianNotYet") {
      assert.equal(view.outcome, "NOT_SUPPORTED");
      assert.equal(view.steps.length, 0, "nothing was planned or sent");
      continue;
    }
    assert.ok(view.steps.length > 0);
    for (const step of view.steps) assert.ok(step.receipt, `${run.beat} ${step.capabilityKey} reopens with a receipt (${step.state})`);
    // A receipt in the step row is the one the engine stored; nothing the seed wrote by hand.
    const rows = await db.aiWorkflowStep.findMany({ where: { jobId: job.id, planVersion: job.planVersion } });
    assert.ok(rows.every(row => row.status === "SUCCEEDED" || row.status === "HANDED_OFF_DONE"), `${run.beat}: ${rows.map(row => row.status).join(",")}`);
  }

  const byBeat = Object.fromEntries(runs.map(run => [run.beat, run]));
  // Teacher register: 31 present and 2 absent, after the Ali question and the person's "mark the rest present".
  const register = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: byBeat.teacherRegister.jobId, status: "SUCCEEDED" } });
  assert.deepEqual({ present: (register.receipt as { counts: Record<string, number> }).counts.present, absent: (register.receipt as { counts: Record<string, number> }).counts.absent }, { present: 31, absent: 2 });
  assert.ok(await db.aiWorkflowQuestion.count({ where: { jobId: byBeat.teacherRegister.jobId, promptKey: "PUPIL_AMBIGUOUS", status: "ANSWERED" } }) === 1);
  // Accountant: the payment was posted once, by the approver, through the hand-off.
  const payment = await db.payment.findFirstOrThrow({ where: { schoolId: AL_NOOR_SCHOOL_ID } });
  const handoff = await db.aiWorkflowHandoff.findFirstOrThrow({ where: { jobId: byBeat.accountantCollect.jobId } });
  assert.equal(payment.workflowHandoffId, handoff.id);
  assert.notEqual(payment.recordedBy, (await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: byBeat.accountantCollect.jobId } })).actorId, "a second person recorded it");
  assert.equal(await db.invoice.count({ where: { schoolId: AL_NOOR_SCHOOL_ID, balanceDue: { gt: 0 } } }), 1, "October stays open for the live beat");
  // Parent: one leave request, pending school review.
  assert.equal(await db.learnerLeaveRequest.count({ where: { schoolId: AL_NOOR_SCHOOL_ID } }), 1);
  // Library: the Atlas, and three labelled copies.
  assert.equal(await db.book.count({ where: { schoolId: AL_NOOR_SCHOOL_ID, title: "Atlas of the World" } }), 1);
  assert.equal(await db.bookCopy.count({ where: { schoolId: AL_NOOR_SCHOOL_ID, barcode: { in: ["LB-0101", "LB-0102", "LB-0103"] } } }), 3);

  // The planner's model call was a recorded stand-in: logged by name, zero tokens, no credit charged.
  const attempts = await db.aIUsageLog.findMany({ where: { schoolId: AL_NOOR_SCHOOL_ID, feature: "AI_WORKFLOWS_V2" }, select: { model: true, tokensUsed: true } });
  assert.ok(attempts.length >= 6);
  assert.ok(attempts.every(row => row.model === RECORDED_PLANNER_MODEL && row.tokensUsed === 0));
  assert.equal((await db.aiWorkflowJob.aggregate({ where: { schoolId: AL_NOOR_SCHOOL_ID }, _sum: { creditsCharged: true } }))._sum.creditsCharged ?? 0, 0);

  // The badge flag.
  const school = await db.school.findUniqueOrThrow({ where: { id: AL_NOOR_SCHOOL_ID }, select: { slug: true, name: true } });
  assert.equal(school.slug, AL_NOOR_DEMO_SLUG);
  assert.ok(DEMO_SCHOOL_SLUGS.includes(school.slug) && isDemoSchool(school.slug));
  assert.ok(!isDemoSchool("some-real-school") && !isDemoSchool(null));
});
