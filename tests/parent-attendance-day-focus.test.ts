import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1661: each recent-day marker is keyboard focusable with a visible focus ring.
// SKAI-1256 moved the ring to the shared global focus token (check:ui rejects forked rings),
// so the marker must not suppress the outline and the global rule must cover [tabindex].
const source = readFileSync("src/app/parent/attendance/page.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");

test("recent-day markers are focusable and show focus", () => {
  assert.match(source, /role="img"\s+tabIndex=\{0\}\s+aria-label=\{label\}/);
  const marker = source.slice(source.indexOf('role="img"'), source.indexOf("/>", source.indexOf('role="img"')));
  assert.doesNotMatch(marker, /outline-none|outline-0|focus-visible:outline-none/);
  assert.match(globals, /:where\([^)]*\[tabindex\][^)]*\):focus-visible\s*\{\s*outline: var\(--focus-width\) solid var\(--focus-color\)/);
});
