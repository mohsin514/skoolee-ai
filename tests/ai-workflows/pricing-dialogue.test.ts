import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readPriceAnswer } from "../../src/lib/ai-workflows/planner/pricing-dialogue";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
after(async () => { await prisma.$disconnect(); redis.disconnect(); });
test("pricing uses visible package names, not misleading legacy tier ids", () => {
  assert.deepEqual(readPriceAnswer("Pro 4500").prices, { BASIC: 4500 });
  assert.deepEqual(readPriceAnswer("Basic 0 Enterprise 8,500").prices, { FREE: 0, PRO: 8500 });
  assert.deepEqual(readPriceAnswer("4500", "BASIC").prices, { BASIC: 4500 });
  assert.equal(readPriceAnswer("Enterprise").selectedPlan, "PRO");
  assert.equal(readPriceAnswer("set the package price to 4500").unassignedPrice, 4500);
});
test("pricing refuses negative, ambiguous, oversized and non-monthly amounts", () => {
  for (const text of ["Pro -4", "Pro 100000001", "Pro 4500 or 5000", "Pro 4500 yearly", "Pro 45 USD"]) assert.equal(readPriceAnswer(text).invalid, true, text);
  assert.deepEqual(readPriceAnswer("what is the current price?", "BASIC").prices, {});
});
