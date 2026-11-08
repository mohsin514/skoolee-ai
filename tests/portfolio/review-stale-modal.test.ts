import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1580: after a reload the open review dialog takes the latest entry version and blocks decisions until read.
const src = readFileSync("src/components/portfolio/portfolio.tsx", "utf8");
const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");

test("the dialog reconciles with the reloaded entry", () => {
  assert.match(src, /const latest = data\.entries\.find\(e => e\.id === reviewing\.id\);/);
  assert.match(src, /if \(latest\.version !== reviewing\.version\) \{ setReviewing\(latest\); setReviewStale\(true\); \}/);
  assert.match(src, /if \(!latest\) \{ setReviewing\(null\); return; \}/);
});

test("both decisions are disabled until the reviewer confirms the latest version", () => {
  assert.match(src, /disabled=\{busy \|\| reviewStale \|\| !comment\.trim\(\)\}/);
  assert.match(src, /disabled=\{busy \|\| reviewStale \|\| !reviewing\.reflection\}/);
  assert.match(src, /onClick=\{\(\) => setReviewStale\(false\)\} data-pf-review-ack/);
  assert.match(src, /knownVersion: reviewing\.version/);
});

test("new strings are translated", () => {
  for (const en of ["I have read the latest version"]) {
    assert.match(messages, new RegExp(`\\["${en}", "[^"]+", "[^"]+"\\]`));
  }
  assert.match(messages, /\["This entry changed while you were reviewing\.[^"]*", "[^"]+", "[^"]+"\]/);
});
