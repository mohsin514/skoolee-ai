import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1432: a rejected thread fetch (offline, connection reset) shows a retryable error instead of a blank thread.
const provider = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
const thread = readFileSync("src/components/chat/message-thread.tsx", "utf8");

test("the thread loader catches rejected detail and message fetches", () => {
  const fn = provider.slice(provider.indexOf("setIsLoadingThread(true);"), provider.indexOf("}, [activeId, threadAttempt]);"));
  assert.match(fn, /} catch \{\s*\/\/ SKAI-1432[^\n]*\n\s*if \(!cancelled\) setThreadFailed\(true\);\s*} finally/);
});

test("a failed thread load leaves list and unread state untouched", () => {
  const catchBlock = provider.slice(provider.indexOf("if (!cancelled) setThreadFailed(true);"), provider.indexOf("if (!cancelled) setThreadFailed(true);") + 200);
  assert.doesNotMatch(catchBlock, /setConversations|setUnread|setLoadingList/);
});

test("retryThread reloads the same conversation via the attempt counter", () => {
  assert.match(provider, /const retryThread = useCallback\(\(\) => setThreadAttempt\(\(attempt\) => attempt \+ 1\), \[\]\);/);
  assert.match(provider, /\}, \[activeId, threadAttempt\]\);/);
});

test("the thread view shows a localized ErrorState with retry instead of a blank view", () => {
  assert.match(thread, /return threadFailed \? \(\s*<ErrorState/);
  assert.match(thread, /title=\{ui\("Messages could not be loaded"\)\}/);
  assert.match(thread, /onRetry=\{retryThread\}/);
  assert.match(thread, /retryLabel=\{ui\("Try again"\)\}/);
});
