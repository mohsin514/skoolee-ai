import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { buildSetup, getSheet, saveAnswers } from "../../src/lib/ai-workflows/questionnaire/service";
import { runCommand } from "../../src/lib/ai-workflows/jobs/commands";
import { getJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { toRunView, type RunView } from "../../src/lib/ai-workflows/view";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

async function campusAdmin(withAccountant = false) {
  const schoolId = `op-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic operator school", contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Main", city: "Lahore" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic admin", role: "CAMPUS_ADMIN", isActive: true, canManageMemberships: true } });
  if (withAccountant) await db.user.create({ data: { id: randomUUID(), schoolId, campusId, email: `${randomUUID()}@example.invalid`, fullName: "Synthetic accountant", role: "ACCOUNTANT", isActive: true } });
  // A wizard-made cycle has dates; the Build must pass them back unchanged.
  const cycle = await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026-27", status: "ACTIVE", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") } });
  // A class made before AI setup, with its own teaching mode: kept, never overwritten.
  await db.class.create({ data: { schoolId, campusId, name: "Grade 2", section: "B", academicYear: 2026, status: "ACTIVE", teachingMode: "SUBJECT" } });
  const user: AuthUser = { schoolId, campusId, userId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid`, accessVersion: 0 };
  return { user, schoolId, campusId, cycle };
}

/** Confirms every waiting step, one request each, until nothing waits. */
async function confirmAll(user: AuthUser, run: RunView) {
  for (let round = 0; round < 40; round++) {
    const waiting = run.steps.find(step => step.state === "awaiting_confirm" && step.preview);
    if (!waiting) return run;
    await runCommand(user, run.id, { type: "confirm", jobVersion: run.version, clientCommandId: `c-${randomUUID()}`, steps: [{ stepId: waiting.id, previewVersion: waiting.preview!.version, previewHash: waiting.preview!.hash, inputHash: waiting.preview!.inputHash }] }, null);
    run = toRunView(await getJob(user, run.id));
  }
  return run;
}

test("a campus admin's Build creates classes, then subjects bound to them by name, periods, rooms and pending invitations", async () => {
  const { user, schoolId, campusId } = await campusAdmin();
  const sheet = await getSheet(user, "campus-admin", "en");
  assert.ok(!sheet.questions.some(question => question.key === "familyMessaging"), "school-level chat settings are the owner's");
  const answers = {
    gradeLadder: { G1: 2, G2: 1 }, teachingMode: { PRIMARY: "SINGLE" }, subjectsByGrade: { PRIMARY: ["English", "Mathematics"] },
    dayShape: { start: "08:00", periods: 3, minutes: 40, breakAfter: 2, breakMinutes: 20 },
    rooms: { classrooms: 3, labs: 1, halls: 0, rows: 5, benches: 4, seats: 2 },
    staffRoster: [{ fullName: "Ayesha Khan", email: "ayesha@example.invalid", phone: "", role: "TEACHER" }],
  };
  const { version } = await saveAnswers(user, "campus-admin", { version: sheet.version, answers, confirmedKeys: Object.keys(answers) });
  let run = await buildSetup(user, "campus-admin", { version, language: "en" });
  assert.equal(run.status, "WAITING_CONFIRM", "every school record waits for review");
  assert.equal(await db.class.count({ where: { schoolId } }), 1, "nothing is created before the person saves (one class existed)");
  const subjects = run.steps.find(step => step.capabilityKey === "setup.subjects_by_class")!;
  assert.equal(subjects.state, "planned", "subjects wait for their classes");
  run = await confirmAll(user, run);
  assert.equal(run.status, "COMPLETED", JSON.stringify(run.steps.map(step => [step.capabilityKey, step.state, step.errorCode])));
  assert.equal(await db.class.count({ where: { schoolId, campusId } }), 3, "Grade 2 B already existed and is kept");
  assert.equal(await db.subject.count({ where: { class: { schoolId } } }), 6);
  assert.equal(await db.periodDefinition.count({ where: { schoolId, timeType: "CLASS" } }), 3);
  assert.equal(await db.classRoom.count({ where: { schoolId } }), 4);
  const staffStep = run.steps.find(step => step.capabilityKey === "setup.staff_invitations")!;
  assert.equal(await db.staffInvitation.count({ where: { schoolId, status: "pending" } }), 1, `prepared, not sent or accepted (${staffStep.state} ${staffStep.errorCode})`);
  assert.equal((await db.aiSetupResponse.findFirstOrThrow({ where: { userId: user.userId } })).status, "READY");
});

test("with an accountant in post the fee question is not asked and no fee rule is created", async () => {
  const { user } = await campusAdmin(true);
  const { version: start } = await getSheet(user, "campus-admin", "en");
  const answers = { gradeLadder: { G1: 1 }, subjectsByGrade: { PRIMARY: ["English"] } };
  const { version } = await saveAnswers(user, "campus-admin", { version: start, answers, confirmedKeys: Object.keys(answers) });
  const sheet = await getSheet(user, "campus-admin", "en");
  assert.ok(!sheet.questions.some(question => question.key === "feePlan"));
  assert.ok(!sheet.willCreate.some(item => item.capabilityKey.startsWith("fees.")));
  assert.ok(sheet.remains.some(task => task.title === "Fee structure"));
  await assert.rejects(saveAnswers(user, "campus-admin", { version, answers: { feePlan: { monthly_PRIMARY: 1000 } }, confirmedKeys: [...Object.keys(answers), "feePlan"] }).then(async () => {
    const built = await buildSetup(user, "campus-admin", { version: version + 1, language: "en" });
    if (built.steps.some(step => step.capabilityKey.startsWith("fees."))) throw new Error("fees compiled");
    throw new Error("ok");
  }), /ok/);
});

test("a standalone owner holding the finance desk builds fee rules, leave policy and family messaging hours", async () => {
  const schoolId = `op-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic standalone school", contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Main", city: "Lahore" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic owner", role: "ADMIN", isActive: true, isInstitutionOwner: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026-27", status: "ACTIVE" } });
  const user: AuthUser = { schoolId, campusId, userId, role: "ADMIN", email: `${userId}@example.invalid`, accessVersion: 0, institutionKind: "STANDALONE" };
  const sheet = await getSheet(user, "admin", "en");
  const answers = {
    gradeLadder: { G1: 1 }, subjectsByGrade: { PRIMARY: ["English"] },
    feePlan: { monthly_PRIMARY: 4500, admission: 10000, lateFinePerDay: 50, siblingPercent: 10 },
    leavePolicy: { Casual: 10, Sick: 8 },
    familyMessaging: { quietFrom: "20:00", quietTo: "07:00", parentToParent: "NO" },
  };
  const { version } = await saveAnswers(user, "admin", { version: sheet.version, answers, confirmedKeys: Object.keys(answers) });
  const run = await confirmAll(user, await buildSetup(user, "admin", { version, language: "en" }));
  assert.equal(run.status, "COMPLETED", JSON.stringify(run.steps.filter(step => step.state !== "saved" && step.state !== "draft").map(step => [step.capabilityKey, step.state, step.errorCode])));
  assert.equal(await db.feeGroup.count({ where: { schoolId } }), 1);
  assert.equal(await db.feeType.count({ where: { schoolId } }), 2);
  assert.ok(await db.leaveType.count({ where: { schoolId } }) >= 2);
  const settings = await db.chatSetting.findFirst({ where: { schoolId } });
  assert.equal(settings?.quietHoursEnabled, true);
  assert.equal(await db.invoice.count({ where: { schoolId } }), 0, "fee rules only; nobody is charged");
});
