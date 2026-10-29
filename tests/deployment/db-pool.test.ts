import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDatabaseTarget, pooledDatabaseUrl } from "../../src/lib/db/pool-url";
import { createWidgetLoader, dashboardConcurrency, describeError, loadWidget } from "../../src/lib/dashboard/widget";

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

test("SKAI-1032: the widget loader runs reads within the pool budget and degrades failures", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const loader = createWidgetLoader("test", 2);
    let active = 0;
    let peak = 0;
    const read = (value: number, fail = false) => async () => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (fail) throw Object.assign(new Error("Timed out fetching a new connection"), { code: "P2024" });
      return value;
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => loader.widget(`w${n}`, read(n, n === 3), 0)));
    assert.deepEqual(results, [1, 2, 0, 4, 5]);
    assert.equal(peak, 2);
    assert.deepEqual(loader.degraded, ["w3"]);
    await assert.rejects(() => loader.required("core", read(1, true)), /Timed out/);
  } finally {
    console.error = original;
  }
  assert.equal(dashboardConcurrency({ DATABASE_URL: "postgresql://u:p@h:6543/db?connection_limit=3" }), 3);
  assert.equal(dashboardConcurrency({ PRISMA_CONNECTION_LIMIT: "2" }), 2);
  assert.equal(dashboardConcurrency({ VERCEL: "1" }), 1);
  assert.equal(dashboardConcurrency({}), 5);
});

// SKAI-1029: with one pooled connection per instance, a top-level query inside an interactive transaction waits
// for a connection the transaction itself holds (P2024). Publishing a trip read the campus clock that way.
test("publishing a trip reads the campus clock through the transaction client", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../../src/lib/transport/service.ts", import.meta.url), "utf8");
  assert.match(source, /async function today\(schoolId: string, campusId: string, db: TxClient \| typeof prisma = prisma\)/);
  assert.match(source, /getLocalePackage\(schoolId, campusId, new Date\(\), null, db\)/);
  const publish = source.slice(source.indexOf("export async function publishTrip"), source.indexOf("async function tripFor"));
  assert.match(publish, /await today\(user\.schoolId, route\.campusId, tx\)/);
  assert.doesNotMatch(publish.slice(publish.indexOf("schoolAiTransaction")), /\bprisma\./, "no top-level client inside the publish transaction");
});
