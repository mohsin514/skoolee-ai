import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1540: a failed recipient directory is an error with Retry, never "0 people you can reach".
const provider = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
const dialog = readFileSync("src/components/chat/new-conversation-dialog.tsx", "utf8");

test("searchDirectory rejects on non-OK and malformed responses", () => {
  const body = provider.slice(provider.indexOf("const searchDirectory"), provider.indexOf("}, []);", provider.indexOf("const searchDirectory")));
  assert.match(body, /if \(!res\.ok\) throw/);
  assert.match(body, /!Array\.isArray\(json\?\.contacts\)\) throw/);
  assert.doesNotMatch(body, /return \[\]/);
});

test("the dialog shows ErrorState with Retry and hides the zero count on failure", () => {
  assert.match(dialog, /catch \{\s*if \(!cancelled\) setDirectoryFailed\(true\);/);
  assert.match(dialog, /directoryFailed \? \(\s*<ErrorState[\s\S]*onRetry=\{\(\) => setAttempt\(\(n\) => n \+ 1\)\}/);
  assert.match(dialog, /\[open, query, searchDirectory, attempt\]/);
  assert.match(dialog, /\{directoryFailed \? null : total === 1/);
});
