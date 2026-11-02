import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1588: image attachments get keyboard- and touch-reachable open and download links named for the file.
const thread = readFileSync("src/components/chat/message-thread.tsx", "utf8");
const image = thread.slice(thread.indexOf('a.contentType.startsWith("image/") && a.url ? ('), thread.indexOf(") : (", thread.indexOf('a.contentType.startsWith("image/")')));

test("the image is wrapped in a link to the original", () => {
  assert.match(image, /<a href=\{a\.url\} target="_blank" rel="noreferrer" aria-label=\{ui\("Open \{0\}", \[a\.fileName\]\)\}[^>]*data-attachment-open>/);
  assert.match(image, /<img\s+src=\{a\.url\}\s+alt=\{a\.fileName\}/);
});

test("a visible download link names the file and its size", () => {
  assert.match(image, /download=\{a\.fileName\}[^>]*aria-label=\{ui\("Download \{0\}", \[a\.fileName\]\)\}[^>]*data-attachment-download>/);
  assert.match(image, /<bdi[^>]*>\{a\.fileName\}<\/bdi>/);
  assert.match(image, /\{formatSize\(a\.sizeBytes\)\}/);
});
