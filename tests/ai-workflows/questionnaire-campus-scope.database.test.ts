import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { getSheet, saveAnswers, setupStatus } from "../../src/lib/ai-workflows/questionnaire/service";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
// SKAI-1730: role setup answers belong to the actor's current campus; synthetic QA-style fixtures only.
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

async function campus(schoolId: string) {
  const id = randomUUID();
  await db.campus.create({ data: { id, schoolId, regId: id, name: "Synthetic campus", city: "Test" } });
  await db.academicCycle.create({ data: { schoolId, campusId: id, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  return id;
}
async function school() {
  const schoolId = `scope-${randomUUID()}`; schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic QA-01 school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  return { schoolId, campusA: await campus(schoolId), campusB: await campus(schoolId) };
}
async function teacher(schoolId: string, campusId: string, role: AuthUser["role"] = "TEACHER"): Promise<AuthUser> {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic staff", role, isActive: true } });
  return { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, accessVersion: 0 };
}
async function answer(user: AuthUser) {
  const sheet = await getSheet(user, "teacher", "en");
  await saveAnswers(user, "teacher", { version: sheet.version, answers: { preferredLanguage: "ur" }, confirmedKeys: ["preferredLanguage"] });
}
const language = (sheet: Awaited<ReturnType<typeof getSheet>>) => sheet.questions.find(question => question.key === "preferredLanguage")!;

test("same-campus answers are reused on the next load", async () => {
  const { schoolId, campusA } = await school();
  const user = await teacher(schoolId, campusA);
  await answer(user);
  const again = await getSheet(user, "teacher", "en");
  assert.equal(language(again).value, "ur");
  assert.equal(language(again).confirmed, true);
  assert.equal(again.status, "DRAFT");
});

test("after a transfer the new campus starts fresh and the old campus's answers stay as history", async () => {
  const { schoolId, campusA, campusB } = await school();
  const user = await teacher(schoolId, campusA);
  await answer(user);
  await db.user.update({ where: { id: user.userId }, data: { campusId: campusB } });
  const moved = { ...user, campusId: campusB };
  await assert.rejects(getSheet(user, "teacher", "en"), (error: unknown) => (error as { code?: string }).code === "ACCESS_CHANGED", "a stale Campus A session is refused");
  const fresh = await getSheet(moved, "teacher", "en");
  assert.equal(fresh.version, 1);
  assert.equal(language(fresh).confirmed, false, "no Campus A answer is shown in Campus B");
  assert.notEqual(language(fresh).value, "ur");
  assert.equal((await setupStatus(moved))?.status, "DRAFT");
  const rows = await db.aiSetupResponse.findMany({ where: { userId: user.userId }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(rows.map(row => row.campusId), [campusA, campusB], "Campus A history is kept, not deleted");
  assert.deepEqual(rows[0].confirmedKeys, ["preferredLanguage"]);
  // Back in Campus A, its own answers return.
  await db.user.update({ where: { id: user.userId }, data: { campusId: campusA } });
  assert.equal(language(await getSheet(user, "teacher", "en")).value, "ur");
});

test("two schools are isolated: another school's response is never loaded", async () => {
  const one = await school(), two = await school();
  const user = await teacher(one.schoolId, one.campusA);
  await answer(user);
  const other = await teacher(two.schoolId, two.campusA);
  assert.equal(language(await getSheet(other, "teacher", "en")).confirmed, false);
  assert.equal(await db.aiSetupResponse.count({ where: { schoolId: two.schoolId, confirmedKeys: { has: "preferredLanguage" } } }), 0);
});

test("a denied role is refused and creates no response", async () => {
  const { schoolId, campusA } = await school();
  const denied = await teacher(schoolId, campusA, "PARENT");
  await assert.rejects(getSheet(denied, "teacher", "en"), (error: unknown) => (error as { code?: string }).code === "NOT_FOUND");
  await assert.rejects(saveAnswers(denied, "teacher", { version: 1, answers: {}, confirmedKeys: [] }), (error: unknown) => (error as { code?: string }).code === "NOT_FOUND");
  assert.equal(await db.aiSetupResponse.count({ where: { schoolId } }), 0);
});
