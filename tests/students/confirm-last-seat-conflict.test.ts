import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { isSerializationConflict, retrySerializable } from "../../src/lib/students/serializable-retry";

// SKAI-1782: the loser of a concurrent last-seat confirmation gets the capacity 409, not a 500.
const known = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError("conflict", { code, clientVersion: "test", meta });

test("serialization and commit-time conflicts are recognised; ordinary errors are not", () => {
  assert.equal(isSerializationConflict(known("P2034")), true);
  assert.equal(isSerializationConflict(known("P2010", { code: "40001" })), true);
  assert.equal(isSerializationConflict(new Error("Transaction API error: could not serialize access due to read/write dependencies among transactions")), true);
  assert.equal(isSerializationConflict(known("P2002")), false);
  assert.equal(isSerializationConflict(new Error("The target class is full (1 of 1 seats).")), false);
});

test("a lost race is re-run so the second attempt can answer with the domain capacity conflict", async () => {
  let calls = 0;
  const full = new Error("The target class is full (1 of 1 seats). Raise its capacity or choose another class.");
  await assert.rejects(retrySerializable(async () => { calls++; if (calls === 1) throw known("P2034"); throw full; }), full);
  assert.equal(calls, 2);
});

test("non-conflict errors are not retried, and retries are bounded", async () => {
  let calls = 0;
  await assert.rejects(retrySerializable(async () => { calls++; throw new Error("nope"); }));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(retrySerializable(async () => { calls++; throw known("P2034"); }, 3));
  assert.equal(calls, 3);
});

test("the confirm transaction is wrapped in the retry and a residual conflict is a 409", () => {
  const route = readFileSync("src/app/api/students/enrollments/route.ts", "utf8");
  assert.match(route, /const result = await retrySerializable\(\(\) => prisma\.\$transaction\(async tx => \{\n\s*const proposal = await tx\.enrollmentProposal/);
  assert.match(route, /if \(isSerializationConflict\(error\)\) return errorResponse\(new ApiError\("[^"]+", 409\)/);
});
