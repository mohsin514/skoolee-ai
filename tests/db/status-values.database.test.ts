import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { STATUS_VALUES } from "../../src/lib/db/status-values";

// SKAI-1808 (DB-01 Phase 2a): an unknown status value is still written (nothing breaks) but is recorded and
// counted in status_value_violations; known values leave no trace.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
const schoolId = `sv1808-${randomUUID()}`, campusId = randomUUID();
const unknown = `MYSTERY_${randomUUID().slice(0, 8).toUpperCase()}`;

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Status School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Status Main", regId: campusId, city: "Lahore" } });
});
after(async () => {
  await db.statusValueViolation.deleteMany({ where: { value: unknown } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("a known status leaves no violation", async () => {
  const before = await db.statusValueViolation.count();
  await db.class.create({ data: { schoolId, campusId, name: "Known", academicYear: 2026, status: "ACTIVE" } });
  assert.equal(await db.statusValueViolation.count(), before);
});

test("an unknown status is written, recorded once and counted on repeat", async () => {
  const cls = await db.class.create({ data: { schoolId, campusId, name: "Unknown", academicYear: 2026 } });
  await db.class.update({ where: { id: cls.id }, data: { status: unknown } });
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: cls.id } })).status, unknown, "the write is not blocked");
  await db.class.update({ where: { id: cls.id }, data: { status: unknown } });
  const row = await db.statusValueViolation.findUniqueOrThrow({ where: { tableName_columnName_value: { tableName: "classes", columnName: "status", value: unknown } } });
  assert.equal(row.occurrences, 2);
});

test("every listed table has its watch trigger", async () => {
  const rows = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT c.relname::text AS table_name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND t.tgname = c.relname || '_status_watch'`;
  assert.deepEqual(rows.map((r) => r.table_name).sort(), Object.keys(STATUS_VALUES).sort());
});
