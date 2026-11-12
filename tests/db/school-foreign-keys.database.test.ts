import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// SKAI-1807 (DB-01 Phase 1a): on a migrated database, every table with a school_id column has a foreign key to
// schools; an empty or unknown school is refused; purging a school cascades and leaves other schools alone.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
const schoolA = `fk1807-a-${randomUUID()}`, schoolB = `fk1807-b-${randomUUID()}`;
const createSchool = (id: string) => db.school.create({ data: { id, name: `Synthetic ${id}`, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });

before(async () => { await createSchool(schoolA); await createSchool(schoolB); });
after(async () => {
  await db.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } }).catch(() => undefined);
  await db.$disconnect();
});

// A composite key that includes school_id (child pinned to its parent's (id, school_id)) counts too: the parent
// table is checked by the same query, so the chain always ends at schools.
test("every table with a school_id column has a foreign key that includes it", async () => {
  const rows = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT c.table_name::text AS table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint k
        JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
        WHERE k.contype = 'f' AND k.conrelid = format('public.%I', c.table_name)::regclass
          AND a.attname = 'school_id')
    ORDER BY 1`;
  assert.deepEqual(rows.map((r) => r.table_name), []);
});

test("an empty or unknown school is refused", async () => {
  for (const schoolId of ["", `missing-${randomUUID()}`]) {
    const error = await db.pilotLedgerSnapshot.create({ data: { schoolId, metrics: {} } }).then(() => null, (e: unknown) => e);
    assert.equal((error as { code?: string } | null)?.code, "P2003", `school_id "${schoolId}" should violate the foreign key`);
  }
});

test("purging a school cascades through these tables and leaves another school's rows", async () => {
  await db.pilotLedgerSnapshot.create({ data: { schoolId: schoolA, metrics: { pupils: 10 } } });
  await db.pilotLedgerSnapshot.create({ data: { schoolId: schoolB, metrics: { pupils: 20 } } });
  await db.school.delete({ where: { id: schoolA } });
  assert.equal(await db.pilotLedgerSnapshot.count({ where: { schoolId: schoolA } }), 0);
  assert.equal(await db.pilotLedgerSnapshot.count({ where: { schoolId: schoolB } }), 1);
});
