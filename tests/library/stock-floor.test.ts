import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1560: the catalogue total cannot drop below copies on loan or tracked barcoded copies.
const src = readFileSync("src/lib/library/catalogue-command.ts", "utf8");
const body = src.slice(src.indexOf("export async function updateBook"));

test("updateBook rejects a total below the physical floor before writing", () => {
  assert.match(body, /const onLoan = Math\.max\(0, existing\.copiesTotal - existing\.copiesAvailable\)/);
  assert.match(body, /bookCopy\.count\(\{ where: \{ bookId: existing\.id, schoolId: user\.schoolId, status: \{ in: \["AVAILABLE", "ON_LOAN", "RESERVED_HOLD"\] \} \} \}\)/);
  assert.match(body, /if \(newTotal < floor\) throw new ApiError\([\s\S]*?, 409\)/);
  assert.ok(body.indexOf("newTotal < floor") < body.indexOf("prisma.book.update"));
});
