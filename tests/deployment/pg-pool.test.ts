import { test } from "node:test";
import assert from "node:assert/strict";
import { pgPoolConfig, pgAdapterEnabled } from "../../src/lib/db/pg-pool";

const pooler = "postgresql://user:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require";

test("the pg pool is on by default on Vercel and can be forced on or off", () => {
  assert.equal(pgAdapterEnabled({}), false);
  assert.equal(pgAdapterEnabled({ VERCEL: "1" }), true);
  assert.equal(pgAdapterEnabled({ VERCEL: "1", PRISMA_PG_ADAPTER: "off" }), false, "off is the rollback");
  assert.equal(pgAdapterEnabled({ PRISMA_PG_ADAPTER: "on" }), true);
});

test("Prisma-only URL parameters never reach pg", () => {
  const { pool } = pgPoolConfig(pooler, {});
  const url = new URL(pool.connectionString!);
  for (const name of ["pgbouncer", "connection_limit", "sslmode", "pool_timeout"]) assert.equal(url.searchParams.has(name), false, name);
  assert.equal(url.hostname, "aws-0-us-east-1.pooler.supabase.com");
  assert.equal(url.port, "6543");
});

test("idle connections are released after a few seconds", () => {
  assert.equal(pgPoolConfig(pooler, {}).pool.idleTimeoutMillis, 15_000);
  assert.equal(pgPoolConfig(pooler, { PG_IDLE_TIMEOUT_MS: "2000" }).pool.idleTimeoutMillis, 2_000);
  assert.equal(pgPoolConfig(pooler, {}).pool.connectionTimeoutMillis, 10_000);
});

test("on serverless a URL limit is capped so idle instances cannot fill the pooler; an explicit env limit wins", () => {
  const twenty = pooler.replace("connection_limit=1", "connection_limit=20");
  assert.equal(pgPoolConfig(twenty, { VERCEL: "1" }).pool.max, 5, "connection_limit=20 in the URL no longer means 20 per instance");
  assert.equal(pgPoolConfig(pooler, { VERCEL: "1" }).pool.max, 1);
  assert.equal(pgPoolConfig(twenty, { VERCEL: "1", PRISMA_CONNECTION_LIMIT: "4" }).pool.max, 4, "explicit env wins");
  assert.equal(pgPoolConfig(twenty, {}).pool.max, 20, "outside serverless the URL limit stands");
  const bare = "postgresql://u:p@db.example.test:6543/postgres";
  assert.equal(pgPoolConfig(bare, { PRISMA_CONNECTION_LIMIT: "3" }).pool.max, 3);
  assert.equal(pgPoolConfig(bare, { VERCEL: "1" }).pool.max, 3);
  assert.equal(pgPoolConfig(bare, {}).pool.max, 5);
});

test("TLS stays on for remote hosts (as the Prisma engine did) and off locally or when disabled", () => {
  assert.deepEqual(pgPoolConfig(pooler, {}).pool.ssl, { rejectUnauthorized: false });
  assert.equal(pgPoolConfig("postgresql://u@127.0.0.1:55603/skoolee_qa_f", {}).pool.ssl, false);
  assert.equal(pgPoolConfig("postgresql://u@db.example.test/x?sslmode=disable", {}).pool.ssl, false);
});

test("a non-public schema is handed to the adapter", () => {
  assert.equal(pgPoolConfig(`${pooler}&schema=tenant`, {}).schema, "tenant");
  assert.equal(pgPoolConfig(`${pooler}&schema=public`, {}).schema, undefined);
});
