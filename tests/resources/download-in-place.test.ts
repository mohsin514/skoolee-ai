import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getResourceCopy } from "@/components/resources/resource-copy";

const source = readFileSync("src/components/resources/ResourceLibrary.tsx", "utf8");

test("SKAI-1527: files download in place through a checked request", () => {
  assert.match(source, /try \{ await downloadPdfFile\(fileHref\(id, version\), current\.fileName \|\| "resource"\); \}/);
  assert.match(source, /catch \{ setDownloadError\(t\.downloadFailed\); \}/);
  assert.match(source, /finally \{ setDownloading\(""\); \}/);
  assert.doesNotMatch(source, /<a className="[^"]*" href=\{fileHref\(id, version\)\}><Download/);
});

test("SKAI-1527: the failure stays on the page, translated, and the button can retry", () => {
  assert.match(source, /data-resource-download-error>\{downloadError\}/);
  assert.match(source, /\{banner\}\{downloadAlert\}\{search\}/);
  for (const language of ["en", "ar", "ur"]) assert.ok(getResourceCopy(language).downloadFailed, language);
  assert.notEqual(getResourceCopy("ar").downloadFailed, getResourceCopy("en").downloadFailed);
});
