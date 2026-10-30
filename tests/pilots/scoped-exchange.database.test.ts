import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { scopedCampusWhere } from "../../src/lib/api/scope";
import { csvCell } from "../../src/lib/csv";
import { stageStructuredRoster } from "../../src/lib/imports/stage-batch-command";
import { importReviewToken } from "../../src/lib/imports/review-token";
import { createStudentRecords } from "../../src/lib/students/create";

// SKAI-1015 (D2-09): live import/export across two schools and two campuses, with an interrupted commit and retry.
// Synthetic data only, against a disposable loopback cluster from scripts/qa/isolated-env.sh — never a remote database.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || !/^554\d\d$/.test(database.port) || process.env.DIRECT_URL !== process.env.DATABASE_URL) throw new Error("Use only an isolated loopback PG554xx cluster (scripts/qa/isolated-env.sh).");
const raw = new PrismaClient();
const tag = randomUUID().slice(0, 8);
const schoolA = `sx-a-${tag}`, schoolB = `sx-b-${tag}`;
const campus = { a1: randomUUID(), a2: randomUUID(), b1: randomUUID() };
const klass = { a1: randomUUID(), a2: randomUUID(), b1: randomUUID() };
const actor = (schoolId: string, campusId: string, role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const adminA1 = actor(schoolA, campus.a1, "CAMPUS_ADMIN"), adminA2 = actor(schoolA, campus.a2, "CAMPUS_ADMIN"), adminB1 = actor(schoolB, campus.b1, "CAMPUS_ADMIN"), teacherA1 = actor(schoolA, campus.a1, "TEACHER");
const ctx = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, fn);
const FAIL_ROLL = `SX-FAIL-${tag}`;
const base = { guardianName: "Synthetic Guardian", address: "1 Synthetic Road", city: "Synthetic", medicalNotes: "None" };
const rows = [
  { ...base, fullName: "Synthetic Ayesha", rollNo: `SX-1-${tag}`, gender: "FEMALE", guardianName: "=HYPERLINK(\"http://x\")", guardianPhone: "+923000000001" },
  { ...base, fullName: "مصنوعی علی", rollNo: FAIL_ROLL, gender: "MALE", guardianPhone: "+923000000002" },
  { ...base, fullName: "Synthetic Missing Phone", rollNo: `SX-BAD-${tag}`, gender: "MALE" },
];

async function commit(user: AuthUser, batchId: string) {
  const batch = await raw.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  const req = new NextRequest(`http://localhost/api/students?campusId=${batch.campusId}`, { method: "POST", body: JSON.stringify({ _importBatchId: batchId, _reviewToken: importReviewToken(batch) }) });
  const res = await ctx(user, () => createStudentRecords(user, req));
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

before(async () => {
  for (const [id, campuses] of [[schoolA, [campus.a1, campus.a2]], [schoolB, [campus.b1]]] as const) {
    await raw.school.create({ data: { id, name: `Synthetic ${id}`, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
    for (const c of campuses) await raw.campus.create({ data: { id: c, schoolId: id, name: `Campus ${c.slice(0, 4)}`, regId: c, city: "Synthetic" } });
  }
  for (const user of [adminA1, adminA2, adminB1, teacherA1]) await raw.user.create({ data: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true, isActive: true } });
  for (const [key, schoolId] of [["a1", schoolA], ["a2", schoolA], ["b1", schoolB]] as const) await raw.class.create({ data: { id: klass[key], schoolId, campusId: campus[key], name: `Grade 9 ${key}`, academicYear: 2026 } });
  // The interruption: a database failure on the second pupil's insert, after the first insert in the same transaction.
  await raw.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION sx_interrupt_${tag}() RETURNS trigger AS $$ BEGIN IF NEW.roll_no = '${FAIL_ROLL}' THEN RAISE EXCEPTION 'synthetic interruption'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await raw.$executeRawUnsafe(`CREATE TRIGGER sx_interrupt_${tag} BEFORE INSERT ON students FOR EACH ROW EXECUTE FUNCTION sx_interrupt_${tag}()`);
});
after(async () => {
  await raw.$executeRawUnsafe(`DROP TRIGGER IF EXISTS sx_interrupt_${tag} ON students`).catch(() => undefined);
  await raw.$executeRawUnsafe(`DROP FUNCTION IF EXISTS sx_interrupt_${tag}()`).catch(() => undefined);
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect(); await prisma.$disconnect();
});

let batchId = "";

test("staging classifies rows, rejects invalid ones and is idempotent for the same rows", async () => {
  const first = await ctx(adminA1, () => stageStructuredRoster(adminA1, { campusId: campus.a1, defaultClassId: klass.a1, sourceName: "pilot.csv", rows }));
  const again = await ctx(adminA1, () => stageStructuredRoster(adminA1, { campusId: campus.a1, defaultClassId: klass.a1, sourceName: "pilot.csv", rows }));
  assert.equal(first.created, true);
  assert.equal(again.created, false);
  assert.equal(again.batch.id, first.batch.id);
  batchId = first.batch.id;
  const summary = (first.batch.data as { summary: Record<string, number> }).summary;
  assert.equal(summary.accepted, 2);
  assert.equal(summary.rejected, 1);
});

test("another school, another campus and a denied role cannot stage into or commit this batch", async () => {
  await assert.rejects(ctx(adminB1, () => stageStructuredRoster(adminB1, { campusId: campus.a1, defaultClassId: klass.a1, sourceName: "x.csv", rows })));
  const b = await commit(adminB1, batchId).catch((e: Error) => ({ status: 0, body: { error: e.message } }));
  assert.ok([403, 404].includes(b.status), `b: ${b.status} ${JSON.stringify(b.body)}`);
  const a2 = await commit(adminA2, batchId).catch((e: Error) => ({ status: 0, body: { error: e.message } }));
  assert.ok([403, 404].includes(a2.status), `a2: ${a2.status} ${JSON.stringify(a2.body)}`);
  const teacher = await commit(teacherA1, batchId).catch((e: Error) => ({ status: 0, body: { error: e.message } }));
  assert.ok([403, 404].includes(teacher.status), `teacher: ${teacher.status} ${JSON.stringify(teacher.body)}`);
  assert.equal(await raw.student.count({ where: { schoolId: { in: [schoolA, schoolB] } } }), 0);
});

test("an interrupted commit writes nothing and leaves the batch STAGED; retry commits once; a repeat is idempotent", async () => {
  const interrupted = await commit(adminA1, batchId).catch((e: Error) => ({ status: 500, body: { error: e.message } }));
  assert.notEqual(interrupted.status, 200);
  assert.equal(await raw.student.count({ where: { schoolId: schoolA } }), 0, "no partial pupil survives the interruption");
  assert.equal((await raw.importBatch.findUniqueOrThrow({ where: { id: batchId } })).state, "STAGED");
  await raw.$executeRawUnsafe(`DROP TRIGGER sx_interrupt_${tag} ON students`);
  const retried = await commit(adminA1, batchId);
  assert.equal(retried.status, 201, JSON.stringify(retried.body).slice(0, 500));
  const repeat = await commit(adminA1, batchId);
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.idempotent, true);
  assert.equal(await raw.student.count({ where: { schoolId: schoolA } }), 2);
  assert.equal(await raw.student.count({ where: { schoolId: schoolA, campusId: campus.a1 } }), 2);
  // PARTIAL by design: the receipt keeps the rejected row visible.
  assert.equal((await raw.importBatch.findUniqueOrThrow({ where: { id: batchId } })).state, "PARTIAL");
  const audits = await raw.auditLog.findMany({ where: { schoolId: schoolA, tableName: "import_batch", recordId: batchId } });
  assert.equal(audits.filter((a) => (a.newValue as { action?: string })?.action === "COMMITTED").length, 1);
});

test("restaging the committed file skips existing pupils instead of duplicating them", async () => {
  const restaged = await ctx(adminA1, () => stageStructuredRoster(adminA1, { campusId: campus.a1, defaultClassId: klass.a1, sourceName: "pilot-v2.csv", rows: [...rows, { ...base, fullName: "Synthetic New", rollNo: `SX-3-${tag}`, gender: "FEMALE", guardianPhone: "+923000000003" }] }));
  const data = restaged.batch.data as { rows: Array<{ state: string }> };
  assert.equal(data.rows.filter((r) => r.state === "SKIPPED").length, 2);
  assert.equal(data.rows.filter((r) => r.state === "ACCEPTED").length, 1);
});

test("exports read only the caller's school and campus, with formulas neutralised", async () => {
  await raw.student.create({ data: { schoolId: schoolB, campusId: campus.b1, classId: klass.b1, fullName: "Other school pupil", rollNo: `SX-B-${tag}`, gender: "MALE", status: "active" } });
  await raw.student.create({ data: { schoolId: schoolA, campusId: campus.a2, classId: klass.a2, fullName: "Other campus pupil", rollNo: `SX-A2-${tag}`, gender: "MALE", status: "active" } });
  const read = (user: AuthUser) => ctx(user, () => prisma.student.findMany({ where: scopedCampusWhere(user, user.campusId!), select: { fullName: true, guardianName: true, schoolId: true, campusId: true } }));
  const a1 = await read(adminA1), a2 = await read(adminA2), b1 = await read(adminB1);
  assert.deepEqual(a1.map((s) => s.fullName).sort(), ["Synthetic Ayesha", "مصنوعی علی"].sort());
  assert.ok(a1.every((s) => s.schoolId === schoolA && s.campusId === campus.a1));
  assert.deepEqual(a2.map((s) => s.fullName), ["Other campus pupil"]);
  assert.deepEqual(b1.map((s) => s.fullName), ["Other school pupil"]);
  const guardian = a1.find((s) => s.fullName === "Synthetic Ayesha")!.guardianName;
  assert.match(csvCell(guardian), /^"'=/);
});
