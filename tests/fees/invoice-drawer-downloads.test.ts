import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-2062: the invoice drawer offers the invoice PDF for every non-cancelled invoice,
// and "Download receipt" downloads a payment receipt (payment-pdf), not the fee invoice.
const src = readFileSync("src/components/fees/FeeInvoicesTab.tsx", "utf8");

test("drawer offers the invoice PDF for unpaid invoices too", () => {
  assert.match(src, /inv\.status !== "CANCELLED" && \(\s*<BrandButton[^>]*onClick=\{handleDownloadPdf\}/);
  assert.match(src, /tr\("Download invoice"\)/);
});

test("Download receipt is wired to the payment receipt PDF", () => {
  assert.match(src, /\/api\/fees\/payment-pdf\?id=\$\{encodeURIComponent\(latestPayment\.id\)\}/);
  assert.match(src, /onClick=\{handleDownloadReceipt\}[\s\S]{0,400}tr\("Download receipt"\)/);
  assert.doesNotMatch(src, /onClick=\{handleDownloadPdf\}[\s\S]{0,400}tr\("Download receipt"\)/);
});
