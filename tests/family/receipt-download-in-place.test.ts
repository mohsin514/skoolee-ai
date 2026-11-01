import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/fees/family-fee-statement.tsx", "utf8");

test("SKAI-1473: family receipts download in place instead of navigating to the API", () => {
  assert.doesNotMatch(source, /<a [^>]*href=\{`\/api\/fees\/payment-pdf/);
  assert.match(source, /<ReceiptDownload id=\{receipt\.id\} receiptNo=\{receipt\.receiptNo\} \/>/);
});

test("SKAI-1473: a failed receipt download shows a message and the button stays usable", () => {
  const fn = source.slice(source.indexOf("function ReceiptDownload"));
  assert.match(fn, /await downloadPdfFile\(`\/api\/fees\/payment-pdf\?id=\$\{encodeURIComponent\(id\)\}`/);
  assert.match(fn, /catch \{ toast\.error\(ui\("Failed to download PDF"\)\); \}/);
  assert.match(fn, /finally \{ setBusy\(false\); \}/);
});
