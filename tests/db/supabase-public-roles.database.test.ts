import { after, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

// SKAI-1886: Supabase's REST API serves the `anon` and `authenticated` roles to anyone holding the public key.
// After migrations, those roles must hold no privilege on any app table, sequence or function, including
// objects created later. CI creates the roles with Supabase's default grants first (tests/db/supabase-roles.sql).
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
after(() => db.$disconnect());

const exposed = (only: string | null = null) => db.$queryRaw<Array<{ role: string; object: string }>>`
  SELECT r.rolname::text AS role, c.relname::text AS object
  FROM pg_class c CROSS JOIN pg_roles r
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'S')
    AND r.rolname IN ('anon', 'authenticated') AND (${only}::text IS NULL OR c.relname = ${only})
    AND (has_table_privilege(r.oid, c.oid, 'SELECT') OR has_table_privilege(r.oid, c.oid, 'INSERT')
      OR has_table_privilege(r.oid, c.oid, 'UPDATE') OR has_table_privilege(r.oid, c.oid, 'DELETE'))
  ORDER BY 1, 2 LIMIT 20`;

test("the Supabase public roles exist in this test database", async () => {
  const roles = await db.$queryRaw<Array<{ rolname: string }>>`SELECT rolname::text FROM pg_roles WHERE rolname IN ('anon', 'authenticated') ORDER BY 1`;
  assert.deepEqual(roles.map((r) => r.rolname), ["anon", "authenticated"], "run tests/db/supabase-roles.sql before migrations");
});

test("anon and authenticated hold no privilege on any app table", async () => {
  assert.deepEqual(await exposed(), []);
});

test("a table created after the migrations is not granted to them either", async () => {
  await db.$executeRawUnsafe(`CREATE TABLE skai1886_probe (id int)`);
  try {
    assert.deepEqual(await exposed("skai1886_probe"), []);
  } finally {
    await db.$executeRawUnsafe(`DROP TABLE skai1886_probe`);
  }
});
