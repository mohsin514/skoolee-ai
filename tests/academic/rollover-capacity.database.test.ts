import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { setClassCapacity } from "../../src/lib/academic/rollover";
import { runAsUser } from "../../src/lib/db/tenant-context";

// SKAI-1448: the rollover capacity action uses the class master's rule. Seats are whole and never below the
// active, non-archived learners in the class, checked inside the write. Isolated local database only.
const local = "postgresql://postgres@127.0.0.1:55433/postgres";
if (process.env.DATABASE_URL !== local) throw new Error("Use only the isolated local academic database.");

const db = new PrismaClient({ datasourceUrl: local });
const tag = `cap-${randomUUID()}`;
const schoolA = `${tag}-a`, schoolB = `${tag}-b`;
const fx = { campusA1: "", campusA2: "", campusB1: "", classId: "", registrarA1: "", registrarA2: "", registrarB: "" };

const registrar = (id: string, schoolId: string, campusId: string) => ({ userId: id, role: "CAMPUS_ADMIN", schoolId, campusId, email: `${id}@example.invalid` });

async function seed() {
  fx.campusA1 = randomUUID(); fx.campusA2 = randomUUID(); fx.campusB1 = randomUUID(); fx.classId = randomUUID();
  fx.registrarA1 = randomUUID(); fx.registrarA2 = randomUUID(); fx.registrarB = randomUUID();
  await db.school.createMany({ data: [
    { id: schoolA, name: "QA-01 A", slug: schoolA, regId: schoolA, contactEmail: `${schoolA}@example.invalid`, city: "Test", status: "ACTIVE" },
    { id: schoolB, name: "QA-01 B", slug: schoolB, regId: schoolB, contactEmail: `${schoolB}@example.invalid`, city: "Test", status: "ACTIVE" },
  ] });
  await db.campus.createMany({ data: [
    { id: fx.campusA1, schoolId: schoolA, name: "A campus 1", regId: fx.campusA1, city: "Test" },
    { id: fx.campusA2, schoolId: schoolA, name: "A campus 2", regId: fx.campusA2, city: "Test" },
    { id: fx.campusB1, schoolId: schoolB, name: "B campus 1", regId: fx.campusB1, city: "Test" },
  ] });
  await db.user.createMany({ data: [
    { id: fx.registrarA1, schoolId: schoolA, campusId: fx.campusA1, email: `${fx.registrarA1}@example.invalid`, fullName: "Synthetic registrar A1", role: "CAMPUS_ADMIN" as never },
    { id: fx.registrarA2, schoolId: schoolA, campusId: fx.campusA2, email: `${fx.registrarA2}@example.invalid`, fullName: "Synthetic registrar A2", role: "CAMPUS_ADMIN" as never },
    { id: fx.registrarB, schoolId: schoolB, campusId: fx.campusB1, email: `${fx.registrarB}@example.invalid`, fullName: "Synthetic registrar B", role: "CAMPUS_ADMIN" as never },
  ] });
  await db.class.create({ data: { id: fx.classId, schoolId: schoolA, campusId: fx.campusA1, name: "Grade 8", academicYear: 2026, capacity: 20 } });
  await addLearners(10, "active");
  // Only active, non-archived learners count: these must not raise the occupancy.
  await addLearners(2, "active", new Date());
  await addLearners(1, "withdrawn");
}

async function addLearners(count: number, status: string, archivedAt?: Date) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: randomUUID(), schoolId: schoolA, campusId: fx.campusA1, classId: fx.classId, fullName: `Synthetic learner ${i}`, rollNo: `${randomUUID().slice(0, 8)}`, gender: "MALE" as never, status, archivedAt: archivedAt ?? null }));
  await db.student.createMany({ data: rows });
  return rows;
}

const capacityOf = async () => (await db.class.findUniqueOrThrow({ where: { id: fx.classId } })).capacity;
const setAs = (user: ReturnType<typeof registrar>, seats: number | null) =>
  runAsUser({ schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: user.role }, () => setClassCapacity(user as never, user.campusId, fx.classId, seats));
const rejectedWith = async (promise: Promise<unknown>, status: number) => {
  await assert.rejects(promise, (error: { status?: number }) => error.status === status);
};

before(async () => { await seed(); });
after(async () => { await db.$disconnect(); });

test("equal to occupancy is allowed: 10 active learners, capacity 10", async () => {
  await setAs(registrar(fx.registrarA1, schoolA, fx.campusA1), 10);
  assert.equal(await capacityOf(), 10);
});

test("below occupancy is rejected and capacity stays at its last valid value", async () => {
  await rejectedWith(setAs(registrar(fx.registrarA1, schoolA, fx.campusA1), 5), 409);
  assert.equal(await capacityOf(), 10);
});

test("repeated submit of a below-occupancy value is rejected every time", async () => {
  for (let i = 0; i < 3; i++) await rejectedWith(setAs(registrar(fx.registrarA1, schoolA, fx.campusA1), 5), 409);
  assert.equal(await capacityOf(), 10);
});

test("a value above occupancy is accepted and repeated submits are idempotent", async () => {
  await setAs(registrar(fx.registrarA1, schoolA, fx.campusA1), 12);
  await setAs(registrar(fx.registrarA1, schoolA, fx.campusA1), 12);
  assert.equal(await capacityOf(), 12);
});

test("another campus of the same school cannot change this class", async () => {
  await assert.rejects(setAs(registrar(fx.registrarA2, schoolA, fx.campusA2), 30), (error: { status?: number }) => error.status === 404);
  assert.equal(await capacityOf(), 12);
});

test("another school cannot change this class", async () => {
  await assert.rejects(setAs(registrar(fx.registrarB, schoolB, fx.campusB1), 30), (error: { status?: number }) => error.status === 404);
  assert.equal(await capacityOf(), 12);
});

test("a concurrent enrollment cannot leave the class over capacity", async () => {
  await db.class.update({ where: { id: fx.classId }, data: { capacity: 10 } });
  const user = registrar(fx.registrarA1, schoolA, fx.campusA1);
  const [edit] = await Promise.allSettled([
    setAs(user, 10),
    (async () => { await addLearners(1, "active"); })(),
  ]);
  const active = await db.student.count({ where: { classId: fx.classId, schoolId: schoolA, archivedAt: null, status: "active" } });
  const cap = (await capacityOf()) ?? 0;
  assert.ok(cap >= active || edit.status === "rejected", `capacity ${cap} below ${active} active learners`);
});

test("two concurrent capacity edits cannot persist a value below occupancy", async () => {
  const user = registrar(fx.registrarA1, schoolA, fx.campusA1);
  await Promise.allSettled([setAs(user, 5), setAs(user, 11)]);
  const active = await db.student.count({ where: { classId: fx.classId, schoolId: schoolA, archivedAt: null, status: "active" } });
  assert.ok(((await capacityOf()) ?? 0) >= active);
});
