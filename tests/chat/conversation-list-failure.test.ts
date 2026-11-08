import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1530: a failed conversation-list load is an error with Retry, never a fake empty inbox.
const provider = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
const list = readFileSync("src/components/chat/conversation-list.tsx", "utf8");

test("non-OK and malformed responses mark the list as failed", () => {
  const body = provider.slice(provider.indexOf("const loadConversations"), provider.indexOf("const retryList"));
  assert.match(body, /if \(!res\.ok\) throw/);
  assert.match(body, /!Array\.isArray\(json\.conversations\)\) throw/);
  assert.match(body, /catch \{[\s\S]*setListFailed\(true\)/);
  assert.match(body, /setListFailed\(false\)/);
});

test("the provider exposes retryList and listFailed", () => {
  assert.match(provider, /const retryList = useCallback\(\(\) => \{ setIsLoadingList\(true\); void loadConversations\(\); \}/);
  assert.equal((provider.match(/      listFailed,\n      retryList,/g) ?? []).length, 2);
});

test("the list shows ErrorState with Retry and hides the empty state on failure", () => {
  assert.match(list, /listFailed \? \([\s\S]*<ErrorState[\s\S]*onRetry=\{retryList\}/);
  assert.match(list, /listFailed && conversations\.length === 0 \? null : conversations\.length === 0 \?/);
});
