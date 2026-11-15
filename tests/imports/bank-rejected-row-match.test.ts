import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-2121: choosing an invoice (or "Leave unmatched") on a REJECTED bank-statement row must not turn it ACCEPTED.
const route = readFileSync("src/app/api/import-batches/[batchId]/route.ts", "utf8");
const ui = readFileSync("src/components/fees/FeePaymentsTab.tsx", "utf8");

test("the PATCH refuses to match or unmatch a REJECTED bank row before any state change", () => {
  const guard = route.indexOf('row.state === "REJECTED" && (typeof change.matchedInvoiceId === "string" || change.matchedInvoiceId === null)');
  const firstAccept = route.indexOf('row.state = "ACCEPTED"', route.indexOf('batch.kind === "BANK_STATEMENT"'));
  assert.ok(guard > 0 && guard < firstAccept);
  assert.match(route.slice(guard, guard + 400), /throw new ApiError\([^;]+, 409\)/);
});

test("the invoice select is disabled for REJECTED rows", () => {
  assert.match(ui, /Invoice for row \{0\}[^>]*disabled=\{row\.state === "REJECTED"\}/);
});
