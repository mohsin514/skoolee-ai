import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("SKAI-1615 arrival announcement translates fixed titles", () => {
  const src = readFileSync("src/components/role-dashboard/RoleHeader.tsx", "utf8");
  assert.match(src, /NOTIFICATION_FIXED_TITLE_KINDS\.has\(newest\.type\)\s*\?\s*t\(newest\.title\)/);
  assert.match(src, /t\("New notification: \{0\}", \[title\]\)/);
});
