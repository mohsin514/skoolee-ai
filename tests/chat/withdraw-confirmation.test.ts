import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1584: withdrawing a message needs an explicit confirmation that names the message.
const thread = readFileSync("src/components/chat/message-thread.tsx", "utf8");
const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");

test("the Withdraw action opens a confirmation instead of deleting", () => {
  assert.match(thread, /onDelete=\{\(\) => setWithdrawing\(message\)\}/);
  assert.doesNotMatch(thread, /onDelete=\{\(\) => deleteMessage\(/);
});

test("only the confirm button sends the delete, and Cancel changes nothing", () => {
  assert.match(thread, /<ConfirmAction\s+open=\{withdrawing !== null\}\s+tone="danger"/);
  assert.match(thread, /onCancel=\{\(\) => setWithdrawing\(null\)\}/);
  assert.match(thread, /if \(target\) await deleteMessage\(target\.id\);/);
  assert.match(thread, /data-withdraw-preview><bdi>\{withdrawing\.body\}<\/bdi>/);
});

test("confirmation copy is translated", () => {
  for (const en of ["Withdraw this message?", "It is hidden for everyone in this conversation and cannot be restored."]) {
    assert.match(messages, new RegExp(`\\["${en.replace(/[.?]/g, "\\$&")}", "[^"]+", "[^"]+"\\]`), en);
  }
});
