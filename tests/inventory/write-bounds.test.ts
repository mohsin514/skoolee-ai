import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2172: INT4 columns are bounded at the API so an oversized number is a 400, not a Prisma 500.
test("stock movement quantity and invoice amount are bounded", () => {
  const route = readFileSync("src/app/api/inventory/transactions/route.ts", "utf8");
  assert.match(route, /quantity > 1_000_000/);
  const purchasing = readFileSync("src/lib/purchasing/service.ts", "utf8");
  assert.match(purchasing, /invoiceNo: text\(2, 60\), amount: z\.number\(\)\.int\(\)\.min\(0\)\.max\(INT32_MAX\)/);
});
