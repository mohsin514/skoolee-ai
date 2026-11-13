import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// SKAI-1811 (DB-01 Phase 5a): every tenant table has FORCE ROW LEVEL SECURITY and a school policy. The test
// switches to a role WITHOUT BYPASSRLS (as the app will in Phase 5b) and proves isolation, fail-closed reads and
// refused cross-school writes. The app's current role bypasses RLS, so nothing changes for it until then.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
const ROLE = "skai1811_rls_probe";
const a = `rls1811-a-${randomUUID()}`, b = `rls1811-b-${randomUUID()}`;
const campus: Record<string, string> = {};

async function school(id: string) {
  await db.school.create({ data: { id, name: `Synthetic ${id}`, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  campus[id] = randomUUID();
  await db.campus.create({ data: { id: campus[id], schoolId: id, name: "RLS Main", regId: campus[id], city: "Lahore" } });
  await db.class.create({ data: { schoolId: id, campusId: campus[id], name: "Policy", academicYear: 2026 } });
}

/** Runs `work` as the non-bypass role, optionally scoped to one school, inside a transaction that is rolled back. */
async function asTenant<T>(schoolId: string | null, work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ROLE}`);
    if (schoolId) await tx.$executeRaw`SELECT set_config('app.current_school_id', ${schoolId}, true)`;
    result = await work(tx);
    throw new Error("rollback");
  }).catch((e: unknown) => { if ((e as Error).message !== "rollback") throw e; });
  return result as T;
}

before(async () => {
  await db.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN CREATE ROLE ${ROLE} NOLOGIN NOBYPASSRLS; END IF; END $$`);
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
  await db.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
  await school(a);
  await school(b);
});
after(async () => {
  for (const id of [a, b]) await db.school.delete({ where: { id } }).catch(() => undefined);
  await db.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`).catch(() => undefined);
  await db.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM ${ROLE}`).catch(() => undefined);
  await db.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => undefined);
  await db.$disconnect();
});

test("every table with a school_id column forces row-level security and has a policy", async () => {
  const gaps = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT k.relname::text AS table_name FROM pg_class k
    WHERE k.relnamespace = 'public'::regnamespace AND k.relkind = 'r'
      AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = k.relname AND c.column_name = 'school_id')
      AND NOT (k.relrowsecurity AND k.relforcerowsecurity AND EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = k.relname))
    ORDER BY 1`;
  assert.deepEqual(gaps.map((g) => g.table_name), []);
});

test("scoped to school A, the role sees only school A's rows", async () => {
  const seen = await asTenant(a, (tx) => tx.$queryRaw<Array<{ school_id: string }>>`SELECT DISTINCT school_id FROM classes WHERE school_id IN (${a}, ${b})`);
  assert.deepEqual(seen.map((r) => r.school_id), [a]);
});

test("with no school in scope, tenant tables are empty (fail closed)", async () => {
  const seen = await asTenant(null, (tx) => tx.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM classes WHERE school_id IN (${a}, ${b})`);
  assert.equal(Number(seen[0].n), 0);
});

test("scoped to school A, writing a row for school B is refused", async () => {
  const error = await asTenant(a, (tx) => tx.$executeRaw`INSERT INTO classes (id, school_id, campus_id, name, academic_year, updated_at) VALUES (${randomUUID()}, ${b}, ${campus[b]}, 'Smuggled', 2026, now())`).then(() => null, (e: unknown) => e);
  assert.match(String((error as Error | null)?.message), /row-level security/);
});
