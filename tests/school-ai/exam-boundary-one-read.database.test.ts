import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { examProctorFixture, removeProctorFixture, type ProctorFixture } from "./exam-proctor-fixture";
import { candidateExamBoundary, candidateExamBoundaryForSession } from "../../src/lib/school-ai/exam-boundary-service";
import { candidateBoundaryRead } from "../../src/lib/auth/request-auth";
import { hashSessionToken } from "../../src/lib/auth/session-cookie";

// SKAI-1971: the proxy's one-statement read must give exactly the answer of the old per-table path
// (candidateExamBoundary) for every scope: two schools, two campuses, another class, deadline and assignment state.
const url = process.env.DATABASE_URL;
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback database only.");
const db = new PrismaClient(), schools: string[] = []; let storage = "";
before(async () => { storage = await mkdtemp(join(tmpdir(), "exam-one-read-test-")); process.env.SCHOOL_AI_STORAGE_DIR = storage; });
after(async () => { for (const school of schools) await removeProctorFixture(db, school); await rm(storage, { recursive: true, force: true }); await db.$disconnect(); await prisma.$disconnect(); });
/**
 * Moves the pupil row only, to test the read's scope predicates. The enrollment-history triggers (SKAI-1888) are
 * off for this one transaction on the disposable database; the app never moves a pupil this way.
 */
const place = (id: string, campusId: string, classId: string) => db.$transaction([
  db.$executeRaw`SELECT set_config('session_replication_role', 'replica', true)`,
  db.$executeRaw`UPDATE students SET campus_id = ${campusId}, class_id = ${classId} WHERE id = ${id}`,
]);
async function fixture() { const result = await examProctorFixture(db, { enabled: false }); schools.push(result.schoolId); return result; }

/** Old path vs new read, for one learner identity claimed against one school. */
async function both(f: ProctorFixture, userId: string, schoolId: string) {
  const old = await candidateExamBoundary({ userId, schoolId, campusId: f.campusId });
  const read = await candidateBoundaryRead("no-session", userId, schoolId);
  assert.deepEqual(read.attempt, old, `${userId}@${schoolId}`);
  return read.attempt;
}

test("the one read matches the per-table boundary across schools, campuses, classes, deadlines and assignment state", async () => {
  const f = await fixture(), g = await fixture();
  const learner = f.students[0].id;
  assert.equal((await both(f, f.learner.userId, f.schoolId))?.attemptId, f.attempt!.id);
  assert.equal(await both(f, f.other.userId, f.schoolId), null); // same class, no attempt
  assert.equal(await both(f, f.learner.userId, g.schoolId), null); // another school's claim
  assert.equal((await both(g, g.learner.userId, g.schoolId))?.attemptId, g.attempt!.id); // the other school's own learner

  const campus2 = randomUUID(), class2 = randomUUID(), class3 = randomUUID();
  await db.campus.create({ data: { id: campus2, schoolId: f.schoolId, name: "Second campus", regId: campus2, city: "Test" } });
  await db.class.create({ data: { id: class2, schoolId: f.schoolId, campusId: campus2, name: "Second campus grade", academicYear: 2026 } });
  await db.class.create({ data: { id: class3, schoolId: f.schoolId, campusId: f.campusId, name: "Other grade", academicYear: 2026 } });
  const mutations: Array<[string, () => Promise<unknown>, () => Promise<unknown>]> = [
    ["another campus", () => place(learner, campus2, class2), () => place(learner, f.campusId, f.classId)],
    ["another class", () => place(learner, f.campusId, class3), () => place(learner, f.campusId, f.classId)],
    ["archived pupil", () => db.student.update({ where: { id: learner }, data: { archivedAt: new Date() } }), () => db.student.update({ where: { id: learner }, data: { archivedAt: null } })],
    ["expired deadline", () => db.schoolAiExamAttempt.update({ where: { id: f.attempt!.id }, data: { startedAt: new Date(Date.now() - 7200000), deadlineAt: new Date(Date.now() - 1000) } }), () => db.schoolAiExamAttempt.update({ where: { id: f.attempt!.id }, data: { startedAt: f.attempt!.startedAt, deadlineAt: f.attempt!.deadlineAt } })],
    ["submitted attempt", () => db.schoolAiExamAttempt.update({ where: { id: f.attempt!.id }, data: { status: "SUBMITTED" } }), () => db.schoolAiExamAttempt.update({ where: { id: f.attempt!.id }, data: { status: "IN_PROGRESS" } })],
    ["closed assignment", () => db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { status: "CLOSED" } }), () => db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { status: "ACTIVE" } })],
    ["learner withdrawn from the assignment", () => db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { studentIds: [f.students[1].id] } }), () => db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { studentIds: f.students.map((s) => s.id) } })],
  ];
  for (const [label, change, restore] of mutations) {
    await change();
    try { assert.equal(await both(f, f.learner.userId, f.schoolId), null, label); } finally { await restore(); }
    assert.equal((await both(f, f.learner.userId, f.schoolId))?.attemptId, f.attempt!.id, `${label} restored`);
  }
});

test("revoked sessions and stale authority are unauthenticated before any attempt is used", async () => {
  const f = await fixture(), token = `synthetic-${randomUUID()}`;
  const claims = { userId: f.learner.userId, schoolId: f.schoolId, role: "STUDENT" as const, accessVersion: 0, mfaVerified: true };
  assert.deepEqual(await candidateExamBoundaryForSession(token, claims), { authenticated: false }); // no server session
  const session = await db.loginSession.create({ data: { schoolId: f.schoolId, userId: f.learner.userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  const result = await candidateExamBoundaryForSession(token, claims);
  assert.equal(result.authenticated && result.active?.attemptId, f.attempt!.id);
  assert.deepEqual(await candidateExamBoundaryForSession(token, { ...claims, accessVersion: 1 }), { authenticated: false });
  assert.deepEqual(await candidateExamBoundaryForSession(token, { ...claims, schoolId: schools[0] === f.schoolId ? schools[1] : schools[0] }), { authenticated: false });
  await db.user.update({ where: { id: f.learner.userId }, data: { role: "TEACHER" } });
  try { assert.deepEqual(await candidateExamBoundaryForSession(token, claims), { authenticated: false }); } finally { await db.user.update({ where: { id: f.learner.userId }, data: { role: "STUDENT" } }); }
  await db.loginSession.update({ where: { id: session.id }, data: { isActive: false } });
  assert.deepEqual(await candidateExamBoundaryForSession(token, claims), { authenticated: false });
});
