import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// SKAI-1953 (DB-01): campus_id columns reference their campus pinned to the row's own school, so a row cannot
// name a missing campus or another school's campus, and deleting a school still removes everything it owns.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
const schoolA = `cfk1953-a-${randomUUID()}`, schoolB = `cfk1953-b-${randomUUID()}`;
const campusA = randomUUID(), campusB = randomUUID();
const cleanup = (schoolId: string, campusId: string) =>
  db.$executeRaw`insert into storage_cleanups (id, school_id, campus_id, object_key) values (${randomUUID()}, ${schoolId}, ${campusId}, ${`obj-${randomUUID()}`})`;

before(async () => {
  for (const [id, campusId] of [[schoolA, campusA], [schoolB, campusB]]) {
    await db.school.create({ data: { id, name: "Synthetic Campus Key School", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
    await db.campus.create({ data: { id: campusId, schoolId: id, name: "Main", regId: campusId, city: "Lahore" } });
  }
});
after(async () => {
  for (const id of [schoolA, schoolB]) await db.school.delete({ where: { id } }).catch(() => undefined);
  await db.$disconnect();
});

test("a row naming its own school's campus is accepted", async () => {
  assert.equal(await cleanup(schoolA, campusA), 1);
});

test("a row naming another school's campus is refused", async () => {
  await assert.rejects(cleanup(schoolA, campusB), /storage_cleanups_school_id_campus_id_fkey/);
});

test("a row naming a campus that does not exist is refused", async () => {
  await assert.rejects(cleanup(schoolA, randomUUID()), /storage_cleanups_school_id_campus_id_fkey/);
});

test("a whole-school row with no campus is still allowed", async () => {
  const row = await db.promptTemplate.create({ data: { schoolId: schoolA, role: "TEACHER", feature: "synthetic", version: "1", systemPrompt: "s", userPrompt: "u" } });
  assert.equal(row.campusId, null);
});

test("deleting a school still removes its campus-keyed rows", async () => {
  await cleanup(schoolB, campusB);
  await db.school.delete({ where: { id: schoolB } });
  assert.equal(await db.storageCleanup.count({ where: { schoolId: schoolB } }), 0);
  assert.equal(await db.campus.count({ where: { id: campusB } }), 0);
});

test("every school-pinned campus relation in the schema is a validated key in the database", async () => {
  const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf8");
  const tables: string[] = [];
  for (const [, body] of schema.matchAll(/^model\s+\w+\s*\{([\s\S]*?)^\}/gm)) {
    if (/Campus\??\s+@relation\(fields: \[schoolId, campusId\], references: \[schoolId, id\]/.test(body)) tables.push(body.match(/@@map\("([^"]+)"\)/)![1]);
  }
  assert.ok(tables.length >= 119, `expected at least 119 pinned campus relations, found ${tables.length}`);
  const keys = await db.$queryRaw<{ table: string }[]>`
    select c.conrelid::regclass::text as table from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'campuses'::regclass and c.convalidated
      and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'school_id'), (select attnum from pg_attribute where attrelid = c.conrelid and attname = 'campus_id')]::int2[]`;
  const keyed = new Set(keys.map((k) => k.table.replace(/^"|"$/g, "")));
  assert.deepEqual(tables.filter((t) => !keyed.has(t)), []);
});
