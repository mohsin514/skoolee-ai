import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1676: certificate history reports when its 200-row list is incomplete, and export warns about it.
const service = readFileSync("src/lib/certificates/service.ts", "utf8");
const route = readFileSync("src/app/api/front-desk/certificates/route.ts", "utf8");
const ui = readFileSync("src/components/operations/certificates-desk.tsx", "utf8");

test("listIssues reads one past the cap and reports truncation", () => {
  const fn = service.slice(service.indexOf("export async function listIssues"));
  assert.match(fn, /take: 201,/);
  assert.match(fn, /const truncated = rows\.length > 200;\s+rows\.splice\(200\);/);
  assert.match(fn, /return \{ truncated, rows:/);
  assert.match(route, /return Response\.json\(\{ success: true, data: rows, truncated \}\);/);
});

test("export warns when the history is truncated", () => {
  assert.match(ui, /setTruncated\(Boolean\(json\.truncated\)\);/);
  assert.match(ui, /if \(truncated\) toast\.warning\(ui\("Only the newest 200 documents were exported\. Narrow the filters to export older documents\."\)\);/);
});
