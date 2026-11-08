import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1641: the workspace finder keeps Search records when the query matches its label.
const source = readFileSync("src/components/role-dashboard/RoleSidebar.tsx", "utf8");

test("Search records link follows the query match, not a blank query", () => {
  assert.match(source, /const recordMatch = recordSearch && \(!query\.trim\(\) \|\| t\("Search records"\)/);
  assert.match(source, /\{recordMatch && <Link href="\/search"/);
  assert.doesNotMatch(source, /recordSearch && !query && <Link/);
});

test("empty state only shows when neither workspaces nor Search records match", () => {
  assert.match(source, /\{!directory\.length && !recordMatch && <div/);
});
