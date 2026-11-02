import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameDiscount } from "@/lib/fees/discount-command";

// SKAI-1611: an identical concurrent discount create replays; a different one is 409; P2002 never escapes.
const base = { name: "Sibling 10%", type: "PERCENT", value: 10, categoryId: null };

test("sameDiscount compares the chosen fields", () => {
  assert.equal(sameDiscount(base, { ...base }), true);
  assert.equal(sameDiscount(base, { ...base, value: 15 }), false);
  assert.equal(sameDiscount(base, { ...base, type: "FLAT" }), false);
  assert.equal(sameDiscount(base, { ...base, categoryId: "cat-1" }), false);
  assert.equal(sameDiscount(base, { ...base, name: "Sibling" }), false);
});

test("createDiscount settles before create and again after a lost unique race", () => {
  const src = readFileSync("src/lib/fees/discount-command.ts", "utf8");
  const body = src.slice(src.indexOf("export async function createDiscount"));
  assert.match(body, /if \(sameDiscount\(existing, \{ name, type, value, categoryId \}\)\) return existing;\n\s*throw new ApiError\("A discount with this code already exists", 409\);/);
  assert.match(body, /if \(error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2002"\) \{\n\s*const winner = await settle\(\);\n\s*if \(winner\) return winner;/);
  assert.ok(body.indexOf("writeAuditEvent") > body.indexOf("tx.feeDiscount.create"), "audit only inside the committing transaction");
});
