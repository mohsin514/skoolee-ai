import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync("src/lib/academic/rollover.ts", "utf8");

test("SKAI-1745: plan history returns every event of the plan, newest first", () => {
  const line = src.split("\n").find(row => row.includes("const events = await prisma.rolloverEvent.findMany(")) ?? "";
  assert.ok(line, "events query present");
  assert.doesNotMatch(line, /take:/, "no 30-event cap");
  assert.match(line, /where: \{ planId: plan\.id \}/, "scoped to the plan the viewer already opened");
  assert.match(line, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/, "deterministic order");
});
