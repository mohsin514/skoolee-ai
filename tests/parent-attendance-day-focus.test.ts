import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1661: each recent-day marker is keyboard focusable with a visible focus ring.
const source = readFileSync("src/app/parent/attendance/page.tsx", "utf8");

test("recent-day markers are focusable and show focus", () => {
  assert.match(source, /role="img"\s+tabIndex=\{0\}\s+aria-label=\{label\}/);
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-primary/);
});
