import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-2040: Add student must refuse an archived or inactive class, as the bulk-import path already does.
test("SKAI-2040: createStudentRecords only resolves live ACTIVE classes for every admission path", () => {
  const src = readFileSync("src/lib/students/create.ts", "utf8");
  const start = src.indexOf("const classes = await prisma.class.findMany({");
  assert.ok(start > 0, "class lookup not found");
  const lookup = src.slice(start, src.indexOf("const classesById", start));
  assert.match(lookup, /status: "ACTIVE",\s*archivedAt: null/);
  assert.doesNotMatch(lookup, /importBatch \? \{ status/);
});
