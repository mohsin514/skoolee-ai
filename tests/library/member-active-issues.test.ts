import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("member Active Issues counts only open loans, like the lending desk", () => {
  const route = readFileSync("src/app/api/library/members/route.ts", "utf8");
  const desk = readFileSync("src/lib/library/desk.ts", "utf8");
  assert.match(route, /_count: \{ select: \{ issues: \{ where: \{ returnedAt: null \} \} \} \}/);
  assert.doesNotMatch(route, /_count: \{ select: \{ issues: true \} \}/);
  assert.match(desk, /bookIssue\.count\(\{ where: \{ memberId: member\.id, returnedAt: null \} \}\)/);
});
