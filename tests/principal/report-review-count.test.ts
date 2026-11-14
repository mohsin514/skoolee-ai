import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/lib/academic/report-review-count.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

type Raw = { sql: string; values: unknown[] };

function fixture(current: number, legacy = 0) {
  const queries: { legacy?: any; raw: Raw[]; findMany: number } = { raw: [], findMany: 0 };
  const db = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.raw.push({ sql: strings.join("?").replace(/\s+/g, " "), values });
      return [{ n: current }];
    },
    reportVersion: { findMany: async () => { queries.findMany += 1; throw new Error("versions must not be loaded row by row"); } },
    reportCard: { count: async (args: unknown) => { queries.legacy = args; return legacy; } },
  };
  const mod = { exports: {} as { pendingReportReviewCount: (school: string, campus: string) => Promise<number> } };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    assert.equal(id, "@/lib/db/prisma");
    return { prisma: db };
  });
  return { count: () => mod.exports.pendingReportReviewCount("school-a", "campus-a"), queries };
}

test("only each card's current unapproved version counts, plus legacy cards", async () => {
  const f = fixture(1, 2);
  assert.equal(await f.count(), 3);
  const [raw] = f.queries.raw;
  assert.match(raw.sql, /JOIN report_versions rv ON rv\.id = rc\.current_version_id AND rv\.report_card_id = rc\.id/);
  assert.match(raw.sql, /rv\.approved_at IS NULL/);
});

test("SKAI-1961: the current-version count is one bounded COUNT whatever the row count", async () => {
  const small = fixture(1);
  const big = fixture(12_000);
  assert.equal(await small.count(), 1);
  assert.equal(await big.count(), 12_000);
  for (const f of [small, big]) {
    assert.equal(f.queries.findMany, 0);
    assert.equal(f.queries.raw.length, 1);
    assert.match(f.queries.raw[0].sql, /^ SELECT count\(\*\)::int AS n FROM report_cards rc/);
  }
  assert.deepEqual(big.queries.raw[0].values, small.queries.raw[0].values);
  assert.equal(big.queries.raw[0].sql, small.queries.raw[0].sql);
});

test("released legacy cards are excluded, including the old 100-card fixture", async () => {
  const f = fixture(0);
  assert.equal(await f.count(), 0);
  assert.deepEqual(f.queries.legacy.where.status, { notIn: ["PUBLISHED", "SENT"] });
  assert.equal(f.queries.legacy.where.currentVersionId, null);
  assert.deepEqual(f.queries.legacy.where.OR[1], { remarksEn: null, remarksUr: null, remarksAr: null });
});

test("both review sources stay inside the requested school and campus and require a reviewable exam", async () => {
  const f = fixture(0);
  await f.count();
  const [raw] = f.queries.raw;
  assert.match(raw.sql, /rc\.school_id = \? AND rc\.campus_id = \?/);
  assert.match(raw.sql, /rv\.school_id = \?/);
  assert.match(raw.sql, /e\.school_id = \? AND e\.campus_id = \?/);
  assert.match(raw.sql, /e\.is_locked = true OR e\.status = ANY\(\?\)/);
  assert.deepEqual(raw.values, ["school-a", "campus-a", "school-a", "school-a", "campus-a", ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"]]);
  assert.equal(f.queries.legacy.where.schoolId, "school-a");
  assert.equal(f.queries.legacy.where.campusId, "campus-a");
  assert.equal(f.queries.legacy.where.exam.campusId, "campus-a");
  assert.ok(f.queries.legacy.where.exam.OR.some((clause: any) => clause.isLocked === true));
  assert.deepEqual(f.queries.legacy.where.exam.OR[1], { status: { in: ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"] } });
});
