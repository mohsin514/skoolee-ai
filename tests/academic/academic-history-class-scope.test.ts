import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// SKAI-1435: the class header in academic-year history must be scoped to the resolved campus.
const route = readFileSync("src/app/api/academic-year/history/route.ts", "utf8");

test("SKAI-1435: classInfo is loaded only for a class on the resolved campus", () => {
  assert.match(route, /prisma\.class\.findFirst\(\{\s*where: \{ id: classId, campusId \}/);
  assert.doesNotMatch(route, /prisma\.class\.findUnique\(\{\s*where: \{ id: classId \}/);
});
