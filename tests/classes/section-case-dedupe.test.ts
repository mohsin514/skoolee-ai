import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2085: POST /api/classes treats sections "A" and "a" as one, like the class identity index.
test("class create de-duplicates sections case-insensitively", () => {
  const route = readFileSync("src/app/api/classes/route.ts", "utf8");
  assert.doesNotMatch(route, /new Set\(normalizedSections\)/);
  assert.match(route, /other\.toLocaleLowerCase\(\) === section\.toLocaleLowerCase\(\)/);
});
