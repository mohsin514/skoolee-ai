// SKAI-1283: a committed migration must be executable SQL. The archived 20260730000000_baseline was
// captured Prisma CLI output (a deprecation "warn" line and "[+] Added tables" diff prose), so every clean
// `prisma migrate deploy` died with P3018 / 42601 on its first statement. Never edit an applied migration
// to fix this (its _prisma_migrations checksum would no longer match); add a corrected one instead.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = "prisma/migrations";
const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const prose = [/^warn\b/i, /^prisma:/i, /^\[[+\-*]\]/, /^Environment variables loaded/i, /^Prisma schema loaded/i, /^Datasource "/i, /^(Added|Changed|Removed) (schemas|enums|tables)/i];

test("the broken prose baseline stays out of the migration chain", () => {
  assert.ok(!dirs.includes("20260730000000_baseline"));
  assert.equal(dirs[0], "20261008000000_verified_baseline");
});

for (const dir of dirs) test(`${dir} is executable SQL, not CLI output`, () => {
  const file = join(root, dir, "migration.sql");
  assert.ok(existsSync(file), "missing migration.sql");
  const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
  assert.ok(lines.length > 0, "empty migration");
  const bad = lines.find((l) => prose.some((p) => p.test(l)));
  assert.equal(bad, undefined, `non-SQL line: ${bad}`);
});
