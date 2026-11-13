import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { STATUS_VALUES } from "../../src/lib/db/status-values";

// SKAI-1852 (DB-01 Phase 2b): the watched status columns now refuse values outside their list (a CHECK constraint
// per column, replacing the SKAI-1808 watch trigger); known values are written as before.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
const schoolId = `sv1852-${randomUUID()}`, campusId = randomUUID();
const unknown = `MYSTERY_${randomUUID().slice(0, 8).toUpperCase()}`;

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Status School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Status Main", regId: campusId, city: "Lahore" } });
});
after(async () => {
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("a known status is written as before", async () => {
  const cls = await db.class.create({ data: { schoolId, campusId, name: "Known", academicYear: 2026, status: "ACTIVE" } });
  await db.class.update({ where: { id: cls.id }, data: { status: "COMPLETED" } });
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: cls.id } })).status, "COMPLETED");
});

test("an unknown status is refused and the row keeps its value", async () => {
  const cls = await db.class.create({ data: { schoolId, campusId, name: "Guarded", academicYear: 2026 } });
  const error = await db.class.update({ where: { id: cls.id }, data: { status: unknown } }).then(() => null, (e: unknown) => e);
  assert.ok(error, "the write should be refused");
  assert.match(String((error as Error).message), /classes_status_check/);
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: cls.id } })).status, "ACTIVE");
});

test("every listed table has its status CHECK constraint and no watch trigger", async () => {
  const checks = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT c.relname::text AS table_name FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
    WHERE k.contype = 'c' AND k.conname = c.relname || '_status_check' AND k.convalidated AND c.relname = ANY(${Object.keys(STATUS_VALUES)})`;
  assert.deepEqual(checks.map((r) => r.table_name).sort(), Object.keys(STATUS_VALUES).sort());
  const watches = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND t.tgname = c.relname || '_status_watch' AND c.relname = ANY(${Object.keys(STATUS_VALUES)})`;
  assert.equal(Number(watches[0].n), 0);
});
