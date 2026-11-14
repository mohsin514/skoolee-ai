import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// SKAI-1954 (DB-01): columns that name a user (created_by_id, exam_coordinator_user_id...) reference that user
// pinned to the row's own school. Deleting a user clears an optional actor and keeps the row; a required actor
// blocks the delete; deleting the whole school still removes everything.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
type Fixture = { schoolId: string; campusId: string; userId: string };
let a: Fixture, b: Fixture;

async function seedSchool(label: string): Promise<Fixture> {
  const schoolId = `uak1954-${label}-${randomUUID()}`, campusId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: `Synthetic ${label} School`, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: `${label} Main`, regId: campusId, city: "Lahore" } });
  const userId = (await db.user.create({ data: { schoolId, campusId, email: `${label}-${randomUUID()}@example.invalid`, password: "not-a-real-hash", fullName: "Synthetic Coordinator", role: "PRINCIPAL" } })).id;
  return { schoolId, campusId, userId };
}
const newUser = (f: Fixture) => db.user.create({ data: { schoolId: f.schoolId, campusId: f.campusId, email: `t-${randomUUID()}@example.invalid`, password: "not-a-real-hash", fullName: "Synthetic Teacher", role: "TEACHER" } });
const framework = (f: Fixture, createdById: string) => db.evidenceFramework.create({ data: { schoolId: f.schoolId, name: `F-${randomUUID()}`, version: "1", createdById } });

before(async () => { a = await seedSchool("A"); b = await seedSchool("B"); });
after(async () => {
  for (const s of [a, b]) if (s) await db.school.delete({ where: { id: s.schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("a row naming a user of its own school is accepted", async () => {
  assert.equal((await framework(a, a.userId)).createdById, a.userId);
  assert.equal((await db.campus.update({ where: { id: a.campusId }, data: { examCoordinatorUserId: a.userId } })).examCoordinatorUserId, a.userId);
});

test("a row naming another school's user, or no real user, is refused", async () => {
  await assert.rejects(framework(a, b.userId), (e: { code?: string }) => e.code === "P2003");
  await assert.rejects(framework(a, randomUUID()), (e: { code?: string }) => e.code === "P2003");
  await assert.rejects(db.campus.update({ where: { id: a.campusId }, data: { examCoordinatorUserId: b.userId } }), (e: { code?: string }) => e.code === "P2003");
});

test("deleting a user clears an optional actor and keeps the row and its school", async () => {
  const coordinator = await newUser(a);
  await db.campus.update({ where: { id: a.campusId }, data: { examCoordinatorUserId: coordinator.id } });
  await db.user.delete({ where: { id: coordinator.id } });
  const campus = await db.campus.findUniqueOrThrow({ where: { id: a.campusId } });
  assert.equal(campus.examCoordinatorUserId, null);
  assert.equal(campus.schoolId, a.schoolId);
});

test("a user named by a required actor column cannot be deleted on their own", async () => {
  const author = await newUser(a);
  await framework(a, author.id);
  await assert.rejects(db.user.delete({ where: { id: author.id } }), (e: { code?: string }) => e.code === "P2003");
});

test("deleting a school still removes its users and the rows that name them", async () => {
  await framework(b, b.userId);
  await db.school.delete({ where: { id: b.schoolId } });
  assert.equal(await db.evidenceFramework.count({ where: { schoolId: b.schoolId } }), 0);
  assert.equal(await db.user.count({ where: { schoolId: b.schoolId } }), 0);
});

test("every school-pinned user relation is a validated key, and optional ones clear only the actor", async () => {
  const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf8");
  const expected = new Map<string, string>();
  for (const [, body] of schema.matchAll(/^model\s+\w+\s*\{([\s\S]*?)^\}/gm)) {
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1];
    for (const [, field, onDelete] of body.matchAll(/User\??\s+@relation\("\w+", fields: \[schoolId, (\w+)\], references: \[schoolId, id\], onDelete: (\w+)\)/g)) {
      const column = body.match(new RegExp(`^\\s*${field}\\s.*@map\\("([^"]+)"\\)`, "m"))![1];
      expected.set(`${table}.${column}`, onDelete);
    }
  }
  assert.ok(expected.size >= 105, `expected at least 105 pinned user relations, found ${expected.size}`);
  const keys = await db.$queryRaw<{ key: string; deltype: string; setcols: string | null }[]>`
    select c.conrelid::regclass::text || '.' || a.attname as key, c.confdeltype::text as deltype,
      (select string_agg(x.attname, ',') from pg_attribute x where x.attrelid = c.conrelid and x.attnum = any(c.confdelsetcols)) as setcols
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[2]
    where c.contype = 'f' and c.confrelid = 'users'::regclass and c.convalidated and array_length(c.conkey, 1) = 2`;
  const actual = new Map(keys.map((k) => [k.key.replace(/"/g, ""), k]));
  const problems: string[] = [];
  for (const [key, onDelete] of expected) {
    const found = actual.get(key);
    if (!found) problems.push(`${key}: no validated key`);
    else if (onDelete === "SetNull" && (found.deltype !== "n" || found.setcols !== key.split(".")[1])) problems.push(`${key}: SET NULL must clear only the actor`);
    else if (onDelete === "NoAction" && found.deltype !== "a") problems.push(`${key}: expected NO ACTION`);
  }
  assert.deepEqual(problems, []);
});
