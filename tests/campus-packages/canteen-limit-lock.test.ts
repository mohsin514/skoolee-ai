import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1575: the daily-limit check runs inside the order transaction, after a per-child, per-service-date lock.
test("placeOrder serializes the daily-limit check with the order and charge write", () => {
  const src = readFileSync("src/lib/campus-packages/service.ts", "utf8");
  const body = src.slice(src.indexOf("export async function placeOrder"));
  const tx = body.indexOf("prisma.$transaction(async (tx) =>");
  const lock = body.indexOf("pg_advisory_xact_lock(hashtext(${`canteen-limit:${user.schoolId}:${student.id}:${item.serviceDate.toISOString()}`}))");
  const replay = body.indexOf("if (prior) return { order: prior, replayed: true };");
  const limit = body.indexOf("tx.canteenSpendLimit.findUnique");
  const spent = body.indexOf("tx.canteenOrder.aggregate");
  const reserve = body.indexOf("tx.canteenItem.updateMany");
  assert.ok(tx > 0 && lock > tx, "lock is taken inside the transaction");
  assert.ok(lock < replay && replay < limit, "same-key retry replays before the limit check");
  assert.ok(limit < spent && spent < reserve, "limit read before capacity and charge");
  assert.equal(body.slice(0, tx).includes("canteenSpendLimit.findUnique"), false, "no unlocked pre-check remains");
});
