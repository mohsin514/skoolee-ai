import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// SKAI-1955 (DB-01): columns that name a pupil, a class or a placement reference that row pinned to the row's own
// school. A row cannot name a missing pupil or class, or another school's; pupil history blocks a hard delete;
// deleting the whole school still removes everything.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
type Fixture = { schoolId: string; campus1: string; campus2: string; classId: string; studentId: string };
let a: Fixture, b: Fixture;
const fk = (e: { code?: string }) => e.code === "P2003";

async function seedSchool(label: string): Promise<Fixture> {
  const schoolId = `sck1955-${label}-${randomUUID()}`, campus1 = randomUUID(), campus2 = randomUUID();
  await db.school.create({ data: { id: schoolId, name: `Synthetic ${label} School`, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campus1, campus2]) await db.campus.create({ data: { id, schoolId, name: `${label} ${id.slice(0, 4)}`, regId: id, city: "Lahore" } });
  const classId = (await db.class.create({ data: { schoolId, campusId: campus1, name: "Ten", academicYear: 2026 } })).id;
  const studentId = (await db.student.create({ data: { schoolId, campusId: campus1, classId, fullName: "Synthetic Pupil", rollNo: "1", gender: "MALE", enrollmentDate: new Date("2026-04-01T00:00:00Z") } })).id;
  return { schoolId, campus1, campus2, classId, studentId };
}
const plan = (f: Fixture, campusId: string, ref: { studentId?: string; classId?: string }) =>
  db.interventionPlan.create({ data: { schoolId: f.schoolId, campusId, createdBy: "synthetic", title: "Synthetic plan", summary: "Synthetic", ...ref } });

before(async () => { a = await seedSchool("A"); b = await seedSchool("B"); });
after(async () => {
  for (const s of [a, b]) if (s) await db.school.delete({ where: { id: s.schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("a row naming its own school's pupil and class is accepted, on either campus", async () => {
  assert.equal((await plan(a, a.campus1, { studentId: a.studentId, classId: a.classId })).studentId, a.studentId);
  assert.equal((await plan(a, a.campus2, { studentId: a.studentId })).studentId, a.studentId, "the key pins the school, not the campus");
});

test("a row naming another school's pupil or class, or a missing one, is refused", async () => {
  await assert.rejects(plan(a, a.campus1, { studentId: b.studentId }), fk);
  await assert.rejects(plan(a, a.campus1, { classId: b.classId }), fk);
  await assert.rejects(plan(a, a.campus1, { studentId: randomUUID() }), fk);
  await assert.rejects(plan(a, a.campus1, { classId: randomUUID() }), fk);
});

test("a pupil with history cannot be hard-deleted on their own", async () => {
  await assert.rejects(db.student.delete({ where: { id: a.studentId } }), fk);
});

test("deleting a school still removes its pupils, classes and the rows that name them", async () => {
  await plan(b, b.campus1, { studentId: b.studentId, classId: b.classId });
  await db.school.delete({ where: { id: b.schoolId } });
  assert.equal(await db.interventionPlan.count({ where: { schoolId: b.schoolId } }), 0);
  assert.equal(await db.student.count({ where: { schoolId: b.schoolId } }), 0);
});

test("every school-pinned pupil, class and placement relation is a validated restrict key", async () => {
  const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf8");
  const expected: string[] = [];
  for (const [, body] of schema.matchAll(/^model\s+\w+\s*\{([\s\S]*?)^\}/gm)) {
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1];
    for (const [, field] of body.matchAll(/(?:Student|Class|StudentEnrollment)\??\s+@relation\("\w+", fields: \[schoolId, (\w+)\], references: \[schoolId, id\], onDelete: NoAction\) \/\/ SKAI-1955/g)) {
      expected.push(`${table}.${body.match(new RegExp(`^\\s*${field}\\s.*@map\\("([^"]+)"\\)`, "m"))![1]}`);
    }
  }
  assert.ok(expected.length >= 83, `expected at least 83 pinned relations, found ${expected.length}`);
  const keys = await db.$queryRaw<{ key: string; deltype: string }[]>`
    select c.conrelid::regclass::text || '.' || x.attname as key, c.confdeltype::text as deltype from pg_constraint c
    join pg_attribute x on x.attrelid = c.conrelid and x.attnum = c.conkey[2]
    where c.contype = 'f' and c.confrelid in ('students'::regclass, 'classes'::regclass, 'student_enrollments'::regclass)
      and c.convalidated and array_length(c.conkey, 1) = 2`;
  const actual = new Map(keys.map((k) => [k.key.replace(/"/g, ""), k.deltype]));
  assert.deepEqual(expected.filter((k) => actual.get(k) !== "a"), []);
});
