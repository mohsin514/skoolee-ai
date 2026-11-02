import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1675: front-desk registers report when their 300-row list is incomplete, and exports warn about it.
const sources = {
  complaints: readFileSync("src/app/api/front-desk/complaints/route.ts", "utf8"),
  postal: readFileSync("src/lib/front-desk/postal.ts", "utf8"),
  phone: readFileSync("src/lib/front-desk/phone-calls.ts", "utf8"),
};

for (const [name, source] of Object.entries(sources)) {
  test(`${name} reads one past the cap and reports truncation`, () => {
    assert.match(source, /take: 301/);
    assert.doesNotMatch(source, /take: 300\b/);
    assert.match(source, /const truncated = rows\.length > 300;\s+rows\.splice\(300\);/);
    assert.match(source, /truncated,/);
  });
}

for (const file of ["complaints-desk", "postal-register", "phone-call-log"]) {
  test(`${file} warns when exporting a truncated list`, () => {
    const ui = readFileSync(`src/components/operations/${file}.tsx`, "utf8");
    assert.match(ui, /setTruncated\(Boolean\(json\.truncated\)\);/);
    assert.match(ui, /if \(truncated\) toast\.warning\(ui\("Only the newest 300 records were exported\. Narrow the filters to export older records\."\)\);/);
  });
}
