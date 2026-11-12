import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readPriceAnswer } from "../../src/lib/ai-workflows/planner/pricing-dialogue";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
after(async () => { await prisma.$disconnect(); redis.disconnect(); });
test("pricing uses visible package names, not misleading legacy tier ids", () => {
  assert.deepEqual(readPriceAnswer("Plus 18").prices, { BASIC: 18 });
  assert.deepEqual(readPriceAnswer("Core 0 Flagship 45").prices, { FREE: 0, PRO: 45 });
  assert.deepEqual(readPriceAnswer("free 0 network 65").prices, { FREE: 0, ENTERPRISE: 65 });
  assert.deepEqual(readPriceAnswer("18", "BASIC").prices, { BASIC: 18 });
  assert.equal(readPriceAnswer("Flagship").selectedPlan, "PRO");
  assert.equal(readPriceAnswer("set the package price to 18").unassignedPrice, 18);
  // Old tier names and internal ids never select a plan.
  for (const text of ["Pro 4500", "Basic 4500", "Enterprise 4500"]) {
    const answer = readPriceAnswer(text);
    assert.deepEqual(answer.prices, {}, text);
    assert.equal(answer.selectedPlan, undefined, text);
  }
});
test("pricing refuses negative, ambiguous, oversized and non-monthly amounts", () => {
  for (const text of ["Plus -4", "Plus 100000001", "Plus 18 or 20", "Plus 18 yearly", "Plus 45 USD"]) assert.equal(readPriceAnswer(text).invalid, true, text);
  assert.deepEqual(readPriceAnswer("what is the current price?", "BASIC").prices, {});
});
