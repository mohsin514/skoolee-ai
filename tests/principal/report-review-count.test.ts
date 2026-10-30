import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/lib/academic/report-review-count.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

function fixture(versions: Array<{ id: string; reportCard: { currentVersionId: string } }>, legacy = 0) {
  const queries: Record<string, any> = {};
  const db = {
    reportVersion: { findMany: async (args: unknown) => { queries.versions = args; return versions; } },
    reportCard: { count: async (args: unknown) => { queries.legacy = args; return legacy; } },
  };
  const mod = { exports: {} as { pendingReportReviewCount: (school: string, campus: string) => Promise<number> } };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    assert.equal(id, "@/lib/db/prisma");
    return { prisma: db };
  });
  return { count: () => module.exports.pendingReportReviewCount("school-a", "campus-a"), queries };
}

test("historical unapproved versions do not inflate the current review count", async () => {
  const f = fixture([
    { id: "old", reportCard: { currentVersionId: "new" } },
    { id: "current", reportCard: { currentVersionId: "current" } },
  ], 2);
  assert.equal(await f.count(), 3);
});

test("released legacy cards and approved versions are excluded, including the old 100-card fixture", async () => {
  const f = fixture([]);
  assert.equal(await f.count(), 0);
  assert.deepEqual(f.queries.legacy.where.status, { notIn: ["PUBLISHED", "SENT"] });
  assert.equal(f.queries.legacy.where.currentVersionId, null);
  assert.equal(f.queries.versions.where.approvedAt, null);
  assert.deepEqual(f.queries.legacy.where.OR[1], { remarksEn: null, remarksUr: null, remarksAr: null });
});

test("both review sources stay inside the requested school and campus and require a reviewable exam", async () => {
  const f = fixture([]);
  await f.count();
  assert.equal(f.queries.versions.where.schoolId, "school-a");
  assert.equal(f.queries.versions.where.reportCard.campusId, "campus-a");
  assert.equal(f.queries.legacy.where.schoolId, "school-a");
  assert.equal(f.queries.legacy.where.campusId, "campus-a");
  assert.deepEqual(f.queries.versions.where.reportCard.exam, f.queries.legacy.where.exam);
  assert.equal(f.queries.legacy.where.exam.campusId, "campus-a");
  assert.ok(f.queries.legacy.where.exam.OR.some((clause: any) => clause.isLocked === true));
});
