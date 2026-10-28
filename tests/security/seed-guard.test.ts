import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSeedEnv, seedSecret } from "../../prisma/seed-guard";

/**
 * SKAI-947 / NFR-SEC-09 — the seed guard must fail closed on anything that
 * could be internet-facing, and allow only recognised local/dev targets.
 */

const LOCAL = "postgresql://u:p@127.0.0.1:5432/skoolee_local";

test("allows a local dev database", () => {
  const d = evaluateSeedEnv({ NODE_ENV: "development", DATABASE_URL: LOCAL });
  assert.equal(d.allowed, true);
  assert.equal(d.dbHost, "127.0.0.1");
});

test("allows localhost host", () => {
  const d = evaluateSeedEnv({
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  });
  assert.equal(d.allowed, true);
});

test("blocks production environment even against a local DB", () => {
  const d = evaluateSeedEnv({ APP_ENV: "production", DATABASE_URL: LOCAL });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /internet-facing/);
});

test("blocks staging, qa, preview", () => {
  for (const env of ["staging", "qa", "preview"]) {
    const d = evaluateSeedEnv({ VERCEL_ENV: env, DATABASE_URL: LOCAL });
    assert.equal(d.allowed, false, `${env} should be blocked`);
  }
});

test("blocks a Supabase-hosted DB by default", () => {
  const d = evaluateSeedEnv({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
  });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /supabase|internet-facing/i);
});

test("allows a hosted DB only with explicit ALLOW_HOSTED_SEED=1", () => {
  const base = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://u:p@db.abc.supabase.co:5432/postgres",
  };
  assert.equal(evaluateSeedEnv(base).allowed, false);
  assert.equal(
    evaluateSeedEnv({ ...base, ALLOW_HOSTED_SEED: "1" }).allowed,
    true,
  );
});

test("blocks an internet-facing app host", () => {
  const d = evaluateSeedEnv({
    NODE_ENV: "development",
    DATABASE_URL: LOCAL,
    NEXT_PUBLIC_APP_URL: "https://dev.skooleeai.com",
  });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /internet-facing/);
});

test("blocks an unrecognised remote DB host", () => {
  const d = evaluateSeedEnv({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://u:p@10.20.30.40:5432/db",
  });
  assert.equal(d.allowed, false);
});

test("seedSecret prefers the env value and never leaks the fallback when set", () => {
  assert.equal(seedSecret({ MY_PW: "fromEnv" }, "MY_PW", "fallback"), "fromEnv");
  assert.equal(seedSecret({}, "MY_PW", "fallback"), "fallback");
});
