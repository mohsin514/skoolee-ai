import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("SKAI-2068: status change closes the invoice detail dialog", () => {
  const src = readFileSync("src/components/fees/FeeInvoicesTab.tsx", "utf8");
  const start = src.indexOf("const handleStatusChange");
  const end = src.indexOf("const handleExportCSV");
  const body = src.slice(start, end);
  assert.match(body, /setShowDetail\(false\)/);
});
