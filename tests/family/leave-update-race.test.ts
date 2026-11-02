import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1550: a guardian's cancel and clarification reply cannot both succeed.
const src = readFileSync("src/lib/family/leave.ts", "utf8");
const body = src.slice(src.indexOf("export async function updateOwnLeave"), src.indexOf("export async function guardianLeave"));

test("both actions go through a conditional claim on status and version", () => {
  assert.match(body, /updateMany\(\{ where: \{ id: row\.id, schoolId: user\.schoolId, status: row\.status, version: row\.version \}/);
  assert.match(body, /if \(!count\) throw new ApiError\([^)]*, 409\)/);
  assert.match(body, /action === "cancel"\) return claim\(\{ status: "CANCELLED" \}\)/);
  assert.match(body, /return claim\(\{ status: "PENDING", reason:/);
  assert.doesNotMatch(body, /learnerLeaveRequest\.update\(/);
});

test("a stale knownVersion is refused before writing", () => {
  assert.ok(body.indexOf("body.knownVersion !== undefined") < body.indexOf("const claim"));
});
