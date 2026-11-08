import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1586: a failed "Load earlier messages" page is shown and announced, with the button turning into Try again.
const provider = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
const thread = readFileSync("src/components/chat/message-thread.tsx", "utf8");

test("loadOlder rejects on failure instead of swallowing it", () => {
  const fn = provider.slice(provider.indexOf("const loadOlder = useCallback"), provider.indexOf("}, [activeId, olderCursor]);"));
  assert.match(fn, /if \(!res\.ok\) throw new Error\("Earlier messages could not be loaded\."\);/);
  assert.doesNotMatch(fn, /catch \{\}/);
});

test("the thread shows an alert, a loading state and a retry", () => {
  assert.match(thread, /try \{ await loadOlder\(\); setOlderFailed\(false\); \} catch \{ setOlderFailed\(true\); \} finally \{ setOlderLoading\(false\); \}/);
  assert.match(thread, /\{olderFailed \? <p role="alert"[^>]*data-chat-older-failed>\{ui\("Earlier messages could not be loaded\."\)\}<\/p> : null\}/);
  assert.match(thread, /loading=\{olderLoading\}\s+disabled=\{olderLoading\}\s+onClick=\{loadEarlier\}/);
});
