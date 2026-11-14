import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-1516: concurrent rejected corrections claim the revision atomically (loser gets 409, tenant-scoped),
// and a concurrent reconciliation retry returns the committed result instead of a raw P2002.
const source = readFileSync("src/lib/tax/service.ts", "utf8");
const reconcile = source.slice(source.indexOf("export async function reconcile"), source.indexOf("export async function correct"));
const correct = source.slice(source.indexOf("export async function correct"), source.indexOf("export async function correct") + 1500);

test("SKAI-1516: correction claims status and revision in one conditional, school-scoped update", () => {
  assert.match(correct, /prisma\.taxDocument\.updateMany\(\{ where: \{ id: d\.id, schoolId: user\.schoolId, submissionStatus: "REJECTED", revision: d\.revision \}/);
});

test("SKAI-1516: a correction that loses the claim returns 409, not success", () => {
  assert.match(correct, /if \(!count\) throw new ApiError\("This document was corrected by someone else\.[^"]*", 409\);/);
});

test("SKAI-1516: reconciliation maps a concurrent P2002 to the committed result or a 409", () => {
  assert.match(reconcile, /error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2002"/);
  assert.match(reconcile, /if \(current && current\.submissionStatus !== "QUEUED"\) return \{ id, status: current\.submissionStatus, repeated: true \};/);
  assert.match(reconcile, /throw new ApiError\("Another reconciliation of this document is already running\.[^"]*", 409\);/);
});
