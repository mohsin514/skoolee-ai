import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SKAI-2006: archived classes (and their sections) must not reach the admin or principal "classes" widget.
const source = readFileSync(join(__dirname, "..", "..", "src", "app", "actions", "dashboard.ts"), "utf8");
const widgets = [...source.matchAll(/L\.widget\("classes", \(\) => prisma\.class\.findMany\(\{\s*where: \{([^}]*)\}/g)];

test("admin and principal dashboards both load the classes widget without archived rows", () => {
  assert.equal(widgets.length, 2);
  for (const [, where] of widgets) assert.match(where, /archivedAt: null/);
});
