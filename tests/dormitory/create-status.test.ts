import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// SKAI-1064: creates answer 201 like allocations. The live check is in allocations.browser.test.ts.
for (const route of ["rooms", "room-types"]) {
  test(`POST /api/dormitory/${route} answers 201 Created`, () => {
    const source = readFileSync(new URL(`../../src/app/api/dormitory/${route}/route.ts`, import.meta.url), "utf8");
    const post = source.slice(source.indexOf("export async function POST"), source.indexOf("export async function PATCH"));
    assert.match(post, /Response\.json\(\{ success: true, data \}, \{ status: 201 \}\)/);
  });
}
