import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STATUS_VALUES, isKnownStatus } from "../../src/lib/db/status-values";

// SKAI-1808: the database watch triggers and src/lib/db/status-values.ts must list the same values. The latest
// migration that (re)creates a table's watch trigger wins.
const migrations = join(__dirname, "..", "..", "prisma", "migrations");

function triggerLists() {
  const lists = new Map<string, string[]>();
  for (const dir of readdirSync(migrations).filter((d) => /^\d{14}_/.test(d)).sort()) {
    const sql = readFileSync(join(migrations, dir, "migration.sql"), "utf8");
    for (const [, table, args] of sql.matchAll(/CREATE TRIGGER "(\w+)_status_watch"[\s\S]*?note_unknown_status_value\(([^)]*)\)/g)) {
      const values = [...args.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      assert.equal(values.shift(), "status");
      lists.set(table, values);
    }
  }
  return lists;
}

test("every status list has a database watch with the same values", () => {
  const lists = triggerLists();
  for (const [table, values] of Object.entries(STATUS_VALUES)) assert.deepEqual(lists.get(table), [...values], `${table}: update the watch migration`);
  assert.deepEqual([...lists.keys()].sort(), Object.keys(STATUS_VALUES).sort());
});

test("isKnownStatus checks one column's list", () => {
  assert.equal(isKnownStatus("students", "active"), true);
  assert.equal(isKnownStatus("students", "ACTIVE"), false);
  assert.equal(isKnownStatus("exams", "PUBLISHED"), true);
});
