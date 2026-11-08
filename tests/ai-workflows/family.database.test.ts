import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { startJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { assertCanSpend } from "../../src/lib/ai-workflows/jobs/credits";
import { inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

async function person(role: AuthUser["role"]) {
  const schoolId = `fam-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic family school", contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Main", city: "Lahore" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic family member", role, isActive: true } });
  return { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, accessVersion: 0 } as AuthUser;
}

test("a child-safety request is refused before anything is stored: no job, no segment, no gap", async () => {
  const parent = await person("PARENT");
  await assert.rejects(startJob(parent, { message: "Someone at school keeps bullying my daughter", language: "en", idempotencyKey: `care-${randomUUID()}` }), (error: { code?: string }) => error.code === "CARE_REFERRAL");
  assert.equal(await db.aiWorkflowJob.count({ where: { schoolId: parent.schoolId } }), 0);
  assert.equal(await db.aiWorkflowSegment.count({ where: { schoolId: parent.schoolId } }), 0);
  assert.equal(await db.aiCapabilityGap.count({ where: { schoolId: parent.schoolId } }), 0);
});

test("a parent's rolling daily AI cap holds across jobs; staff have no per-person cap", async () => {
  const parent = await person("PARENT");
  for (let index = 0; index < 3; index++) await db.aiWorkflowJob.create({ data: { schoolId: parent.schoolId, campusId: parent.campusId, actorId: parent.userId, actorRole: "PARENT", accessVersion: 0, origin: "FREEFORM", language: "en", requestHash: `h${index}`, idempotencyKey: `cap-${randomUUID()}`, budget: {}, expiresAt: new Date(Date.now() + 86_400_000), creditsCharged: 4 } });
  const job = { id: randomUUID(), schoolId: parent.schoolId, campusId: parent.campusId, origin: "FREEFORM", creditsCharged: 0 };
  await assert.rejects(inTenant(parent, () => assertCanSpend(parent, job)), (error: { code?: string; params?: { scope?: string } }) => error.code === "BUDGET_EXHAUSTED" && error.params?.scope === "daily");
});
