import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDatabaseTarget, pooledDatabaseUrl } from "../../src/lib/db/pool-url";
import { describeError, loadWidget } from "../../src/lib/dashboard/widget";

const POOLER = "postgresql://u:p@aws-0-x.pooler.supabase.com:6543/postgres?sslmode=require";

test("pooler URL gets pgbouncer and a one-connection budget on serverless", () => {
  const url = new URL(pooledDatabaseUrl(POOLER, { VERCEL: "1" })!);
  assert.equal(url.searchParams.get("pgbouncer"), "true");
  assert.equal(url.searchParams.get("connection_limit"), "1");
  assert.equal(url.searchParams.get("pool_timeout"), "15");
  assert.equal(url.searchParams.get("sslmode"), "require");
});

test("explicit URL flags and PRISMA_CONNECTION_LIMIT win", () => {
  const explicit = new URL(pooledDatabaseUrl(`${POOLER}&connection_limit=3&pgbouncer=false`, { VERCEL: "1" })!);
  assert.equal(explicit.searchParams.get("connection_limit"), "3");
  assert.equal(explicit.searchParams.get("pgbouncer"), "false");
  const configured = new URL(pooledDatabaseUrl(POOLER, { VERCEL: "1", PRISMA_CONNECTION_LIMIT: "2" })!);
  assert.equal(configured.searchParams.get("connection_limit"), "2");
});

test("direct and local URLs are not marked pgbouncer; non-postgres input passes through", () => {
  const local = new URL(pooledDatabaseUrl("postgresql://u:p@127.0.0.1:5432/db", {})!);
  assert.equal(local.searchParams.get("pgbouncer"), null);
  assert.equal(local.searchParams.get("connection_limit"), "5");
  assert.equal(pooledDatabaseUrl(undefined, {}), undefined);
  assert.equal(pooledDatabaseUrl("file:./dev.db", {}), "file:./dev.db");
  assert.equal(describeDatabaseTarget(POOLER), "aws-0-x.pooler.supabase.com:6543");
});

test("a failing widget degrades to its fallback and is recorded, others still load", async () => {
  const degraded: string[] = [];
  const original = console.error;
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const failure = Object.assign(new Error("Too many connections"), { code: "P2037" });
    const [ok, failed] = await Promise.all([
      loadWidget("ok", async () => [1], [], degraded),
      loadWidget("invoices", async () => { throw failure; }, [], degraded),
    ]);
    assert.deepEqual(ok, [1]);
    assert.deepEqual(failed, []);
    assert.deepEqual(degraded, ["invoices"]);
    assert.equal(logged.length, 1);
    assert.deepEqual(describeError(failure), { error: "Too many connections", code: "P2037" });
  } finally {
    console.error = original;
  }
});
