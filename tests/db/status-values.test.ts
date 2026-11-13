import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STATUS_VALUES, isKnownStatus } from "../../src/lib/db/status-values";

// SKAI-1808 / SKAI-1852: the database and src/lib/db/status-values.ts must list the same values. A column is
// defined first by its watch trigger (SKAI-1808) and later by its CHECK constraint (SKAI-1852); the latest
// migration that defines a table wins.
const migrations = join(__dirname, "..", "..", "prisma", "migrations");

function databaseLists() {
  const lists = new Map<string, string[]>();
  for (const dir of readdirSync(migrations).filter((d) => /^\d{14}_/.test(d)).sort()) {
    const sql = readFileSync(join(migrations, dir, "migration.sql"), "utf8");
    for (const [, table, args] of sql.matchAll(/CREATE TRIGGER "(\w+)_status_watch"[\s\S]*?note_unknown_status_value\(([^)]*)\)/g)) {
      const values = [...args.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      assert.equal(values.shift(), "status");
      lists.set(table, values);
    }
    for (const [, table, args] of sql.matchAll(/ADD CONSTRAINT "(\w+)_status_check" CHECK \("status" IN \(([^)]*)\)\)/g)) {
      // Other feature migrations constrain their own status columns too; only the shared lists are compared.
      if (!(table in STATUS_VALUES)) continue;
      lists.set(table, [...args.matchAll(/'([^']*)'/g)].map((m) => m[1]));
    }
  }
  return lists;
}

test("every status list matches its database rule", () => {
  const lists = databaseLists();
  for (const [table, values] of Object.entries(STATUS_VALUES)) assert.deepEqual(lists.get(table), [...values], `${table}: update the migration`);
  assert.deepEqual([...lists.keys()].sort(), Object.keys(STATUS_VALUES).sort());
});

test("isKnownStatus checks one column's list", () => {
  assert.equal(isKnownStatus("students", "active"), true);
  assert.equal(isKnownStatus("students", "ACTIVE"), false);
  assert.equal(isKnownStatus("exams", "PUBLISHED"), true);
  assert.equal(isKnownStatus("guardian_relationships", "REVIEW_REQUIRED"), true);
});
