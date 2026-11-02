import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1599: a failed new conversation is reported inside the dialog with Try again.
const src = readFileSync("src/components/chat/new-conversation-dialog.tsx", "utf8");
const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");

test("direct and group failures set an in-dialog retry and clear the hidden shared error", () => {
  assert.match(src, /if \(id\) onClose\(\);\n\s*else \{ clearError\(\); setStartFailed\(\{ retry: \(\) => void choose\(contact\) \}\); \}/);
  assert.match(src, /if \(id\) onClose\(\);\n\s*else \{ clearError\(\); setStartFailed\(\{ retry: \(\) => void submitGroup\(\) \}\); \}/);
});

test("the dialog renders an alert with Try again inside its own tree", () => {
  assert.match(src, /\{startFailed \? \(\n\s*<div role="alert"[^>]*data-new-conversation-failed>/);
  assert.match(src, /onClick=\{startFailed\.retry\}>\{ui\("Try again"\)\}/);
});

test("copy is translated", () => {
  assert.match(messages, /\["Couldn't start the conversation\. Your choices are kept, so you can try again\.", "[^"]+", "[^"]+"\]/);
});
