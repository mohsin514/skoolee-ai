import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { retryDatabaseTransaction } from "../../src/lib/school-ai/transaction";

const failure = (code: string, sqlState?: string) => new Prisma.PrismaClientKnownRequestError("Synthetic rollback", { code, clientVersion: "test", meta: sqlState ? { code: sqlState } : undefined });

test("pure database transactions retry exact serialization/deadlock rollbacks from normal and raw queries", async () => {
  for (const error of [failure("P2034"), failure("P2010", "40001"), failure("P2010", "40P01")]) {
    let calls = 0;
    assert.equal(await retryDatabaseTransaction(async () => { if (++calls === 1) throw error; return "committed"; }), "committed");
    assert.equal(calls, 2);
  }
});
test("short bursts of repeated rollbacks can settle before the bounded retry budget expires", async () => {
  let calls = 0;
  const receipt = await retryDatabaseTransaction(async () => {
    if (++calls <= 4) throw failure("P2034");
    return { committed: true };
  });
  assert.deepEqual(receipt, { committed: true });
  assert.equal(calls, 5);
});
test("transaction retries are bounded and unrelated raw errors retain their identity", async () => {
  for (const [error, expectedCalls] of [[failure("P2010", "40001"), 7], [failure("P2010", "23505"), 1], [failure("P2010", "syntax-error"), 1], [new Error("Application validation failed"), 1]] as const) {
    let calls = 0;
    await assert.rejects(() => retryDatabaseTransaction(async () => { calls++; throw error; }), cause => cause === error);
    assert.equal(calls, expectedCalls);
  }
});
