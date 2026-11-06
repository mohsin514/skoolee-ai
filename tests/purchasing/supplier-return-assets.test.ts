import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1674: a supplier return retires the matching active asset tags with a return history entry.
const source = readFileSync("src/lib/purchasing/service.ts", "utf8");
const fn = source.slice(source.indexOf("export async function returnToSupplier"), source.indexOf("export async function recordInvoice"));

test("asset-tracked returns retire the newest active tags for that order line", () => {
  assert.match(fn, /if \(line\.asset\) \{/);
  assert.match(fn, /schoolAsset\.findMany\(\{ where: \{ schoolId: user\.schoolId, requestId: id, status: "ACTIVE", tag: \{ startsWith: `\$\{r\.poNumber\}-L\$\{input\.line \+ 1\}-` \} \}, orderBy: \{ tag: "desc" \}, take: input\.quantity \}\)/);
  assert.match(fn, /data: \{ status: "RETURNED", nextServiceOn: null, history: push\(asset\.history, \{ action: "RETURNED_TO_SUPPLIER", by: user\.userId, reason: input\.reason \}\) \}/);
});

test("the asset update happens before the order quantity is reduced, inside the same transaction", () => {
  assert.ok(fn.indexOf('status: "RETURNED"') < fn.indexOf("received[input.line] -= input.quantity;"));
  assert.match(fn, /throw new ApiError\("Some returned units are no longer active in the asset register\. Update those assets first\.", 409\)/);
});
