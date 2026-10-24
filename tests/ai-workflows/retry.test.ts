import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";

after(async () => { await prisma.$disconnect(); redis.disconnect(); });

test("a write conflict is retried (nothing was written), other errors are not", async () => {
  const { withConflictRetry } = await import("../../src/lib/ai-workflows/executor/step-runner");
  let calls = 0;
  const value = await withConflictRetry(async () => { calls++; if (calls < 3) throw new Error("Transaction failed due to a write conflict or a deadlock. Please retry your transaction"); return "ok"; });
  assert.equal(value, "ok"); assert.equal(calls, 3);
  let other = 0;
  await assert.rejects(withConflictRetry(async () => { other++; throw new Error("domain refused"); }), /domain refused/);
  assert.equal(other, 1, "a real refusal is never retried");
  let stuck = 0;
  await assert.rejects(withConflictRetry(async () => { stuck++; throw new Error("write conflict or a deadlock"); }, 3));
  assert.equal(stuck, 3, "bounded");
});
