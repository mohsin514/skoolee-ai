import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1583: a failed message edit keeps the draft and edit mode for a retry.
const provider = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
const thread = readFileSync("src/components/chat/message-thread.tsx", "utf8");
const composer = readFileSync("src/components/chat/composer.tsx", "utf8");

test("editMessage reports whether the edit was saved", () => {
  assert.match(provider, /editMessage: \(messageId: string, body: string\) => Promise<boolean>;/);
  assert.match(provider, /\.catch\(\(\) => null\);\n    if \(!res\?\.ok\) \{[\s\S]*?return false;/);
  assert.match(provider, /setMessages\(\(prev\) => prev\.map\(\(m\) => \(m\.id === messageId \? json\.message : m\)\)\);\n    return true;/);
});

test("the thread leaves edit mode only after a save", () => {
  assert.match(thread, /const saved = editing \? await editMessage\(editing\.id, body\) : true;\n\s*if \(saved\) setEditing\(null\);/);
});

test("the composer keeps its text when the edit was not saved", () => {
  assert.match(composer, /if \(!\(await onSubmitEdit\(body\)\)\) return;/);
  const i = composer.indexOf("if (!(await onSubmitEdit(body))) return;");
  assert.ok(i > 0 && i < composer.indexOf('setValue("");', i), "early return happens before the draft is cleared");
});
