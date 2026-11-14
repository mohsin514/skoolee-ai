import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/lib/tax/service.ts", "utf8");
const reconcile = source.slice(source.indexOf("export async function reconcile"), source.indexOf("export async function correct"));
const correct = source.slice(source.indexOf("export async function correct"), source.indexOf("export async function correct") + 1500);

test("SKAI-1538: reconcile maps a concurrent attempt P2002 to the committed result, never a raw error", () => {
  assert.match(reconcile, /catch \(error\)/);
  assert.match(reconcile, /error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2002"/);
  assert.match(reconcile, /return \{ id, status: current\.submissionStatus, repeated: true \}/);
  assert.match(reconcile, /throw new ApiError\(.*409\)/);
});

test("SKAI-1538: reconcile re-reads the committed status scoped to the caller's school", () => {
  assert.match(reconcile, /prisma\.taxDocument\.findFirst\(\{ where: \{ id, schoolId: user\.schoolId \}/);
});

test("SKAI-1538: reconcile rethrows every error that is not the attempt-number conflict", () => {
  assert.match(reconcile, /if \(!\(error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2002"\)\) throw error;/);
});

test("SKAI-1538: correct claims the rejected revision atomically, scoped to the school", () => {
  assert.match(correct, /prisma\.taxDocument\.updateMany\(\{ where: \{ id: d\.id, schoolId: user\.schoolId, submissionStatus: "REJECTED", revision: d\.revision \}/);
  assert.match(correct, /if \(!count\) throw new ApiError\(.*409\)/);
});
