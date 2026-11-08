import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync("src/lib/accommodations/service.ts", "utf8");
const body = src.slice(src.indexOf("export async function coordinatorView"), src.indexOf("export const planInput"));

test("SKAI-1741: the access-plan review queue includes every expired or near-expiry plan on the campus", () => {
  const line = body.split("\n").find(row => row.includes("const review = await tx.accommodationPlan.findMany(")) ?? "";
  assert.ok(line, "review query present");
  assert.doesNotMatch(line, /take:/, "no 100-row cap");
  assert.match(line, /where: \{ schoolId: user\.schoolId, status: "ACTIVE", \.\.\.campus, validUntil: \{ lt: new Date\(now\.getTime\(\) \+ 14 \* 86_400_000\) \} \}/, "school + campus scope unchanged");
  assert.match(line, /orderBy: \[\{ validUntil: "asc" \}, \{ id: "asc" \}\]/, "expired first, deterministic tie-break");
  assert.match(body, /if \(!isApprover\(user\)\) throw new ApiError\("Only designated staff can manage access plans\.", 403\);/, "role denial unchanged");
  assert.match(body, /const campus = user\.role === "SUPER_ADMIN" \? \{\} : \{ campusId: user\.campusId \?\? "" \};/);
});

test("SKAI-1741: the Review tile and filter are built from the full review list", () => {
  const view = readFileSync("src/components/accommodations/AccessPlans.tsx", "utf8");
  assert.match(view, /const reviewIds = new Set\(view\.review\.map\(row => row\.studentId\)\);/);
});
