import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLatestRequest } from "../../src/lib/latest-request";

// SKAI-1766: a slow response for an earlier campus/currency must not overwrite the selected report.
const ui = readFileSync("src/components/fees/FeeReportsTab.tsx", "utf8");

test("a late A response is dropped once B has started, in either completion order", () => {
  const request = createLatestRequest<string>();
  const a = request.begin("campus-a|PKR"), b = request.begin("campus-b|PKR");
  assert.equal(request.isCurrent(b, "campus-b|PKR"), true);
  assert.equal(request.isCurrent(a, "campus-a|PKR"), false);
});

test("all three report loaders are guarded on data, error and loading writes", () => {
  const loaders = ui.split("const request = useRef(createLatestRequest<string>());").slice(1);
  assert.equal(loaders.length, 3, "Defaulters, Collection and Payment methods");
  for (const loader of loaders) {
    const body = loader.slice(0, loader.indexOf("}, [campusId, currency]);"));
    assert.match(body, /const key = `\$\{campusId \?\? ""\}\|\$\{currency\}`, token = request\.current\.begin\(key\);/);
    assert.ok(body.indexOf("if (!request.current.isCurrent(token, key)) return;") < body.indexOf("if (json.success)"));
    assert.match(body, /if \(request\.current\.isCurrent\(token, key\)\) setFailed\(true\);/);
    assert.match(body, /if \(request\.current\.isCurrent\(token, key\)\) setLoading\(false\);/);
  }
});

test("export and reminder commands stay disabled until the latest request settles", () => {
  assert.equal((ui.match(/\}, !loading && !failed\);/g) ?? []).length >= 2, true);
});
