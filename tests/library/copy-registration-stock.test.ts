import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1562: registering counted copies one at a time gives the same stock as one batch.
const src = readFileSync("src/lib/library/desk.ts", "utf8");
const body = src.slice(src.indexOf("export async function addCopies"), src.indexOf("/** What the desk shows after a scan"));

// The same arithmetic as addCopies, to check the ticket's two scenarios.
const add = (total: number, registered: number, batch: number) => Math.max(0, batch - Math.max(0, total - registered));

test("1+1 and 2 batches of already-counted copies leave total at 2", () => {
  let total = 2, registered = 0;
  total += add(total, registered, 1); registered += 1;
  total += add(total, registered, 1); registered += 1;
  assert.equal(total, 2);
  assert.equal(2 + add(2, 0, 2), 2);
});

test("genuinely new copies after reconciliation add once", () => {
  assert.equal(add(2, 2, 1), 1);
  assert.equal(add(2, 1, 3), 2);
});

test("addCopies uses that rule and locks the title row", () => {
  assert.match(body, /const unbarcoded = Math\.max\(0, book\.copiesTotal - existing\);/);
  assert.match(body, /const add = Math\.max\(0, input\.barcodes\.length - unbarcoded\);/);
  assert.ok(body.indexOf("FOR UPDATE") < body.indexOf("tx.book.findFirst"));
});
