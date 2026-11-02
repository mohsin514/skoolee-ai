import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1531: the archived CSV "Left on" column comes from archivedAt, which the roster API selects.
const panel = readFileSync("src/components/shared-admin/index.tsx", "utf8");
const select = readFileSync("src/lib/students/roster-summary.ts", "utf8");

test("archived export writes archivedAt in Left on", () => {
  const body = panel.slice(panel.indexOf("const exportArchived"), panel.indexOf("const changeStatus"));
  assert.match(body, /"Left on"\]/);
  assert.match(body, /String\(s\.archivedAt \|\| ""\)\.slice\(0, 10\)/);
  assert.doesNotMatch(body, /updatedAt|createdAt/);
});

test("the roster summary still selects archivedAt", () => {
  assert.match(select, /archivedAt: true/);
});
