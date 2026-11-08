import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1654: a failed pay-online availability lookup shows a retryable state instead of hiding Pay now.
const source = readFileSync("src/components/fees/online-payment.tsx", "utf8");

test("non-OK, unsuccessful, malformed and rejected lookups mark the lookup failed", () => {
  assert.match(source, /if \(!r\.ok \|\| !json\?\.success \|\| !json\.availability\) throw/);
  assert.match(source, /\.catch\(\(\) => \{ if \(active\) setLookupFailed\(true\); \}\)/);
});

test("the failed state offers Try again, which re-runs the lookup", () => {
  assert.match(source, /if \(!state && lookupFailed\) return <div data-online-pay-lookup-failed>/);
  assert.match(source, /setAttempt\(n => n \+ 1\)/);
  assert.match(source, /\}, \[invoiceId, attempt\]\);/);
});
