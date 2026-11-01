import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-744: every authenticated PDF download is private and never stored by a shared or browser cache.
const PDF_ROUTES = [
  "src/app/api/reports/download/route.ts",
  "src/app/api/reports/class-grades-pdf/route.ts",
  "src/app/api/fees/invoice-pdf/route.ts",
  "src/app/api/fees/payment-pdf/route.ts",
  "src/app/api/academic/exam-documents/route.ts",
];

test("PDF downloads send Cache-Control no-store", () => {
  for (const file of PDF_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /"application\/pdf"/, file);
    assert.match(source, /"Cache-Control": "(private, )?no-store/, `${file} must not be cacheable`);
  }
});
