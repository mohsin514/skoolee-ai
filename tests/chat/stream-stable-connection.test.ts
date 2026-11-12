import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1838: typing in chat search or changing the filter must not reopen the live stream.
const src = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
const streamStart = src.indexOf('new EventSource("/api/chat/stream")');
const effectStart = src.lastIndexOf("useEffect(() => {", streamStart);
const effectEnd = src.indexOf("}, [", streamStart);
const streamEffect = src.slice(effectStart, src.indexOf("]);", effectEnd) + 3);

test("the stream effect depends only on the connection epoch", () => {
  assert.ok(streamStart > 0, "the provider opens /api/chat/stream");
  assert.match(streamEffect, /\}, \[connectionEpoch\]\);$/);
  for (const dep of ["applyIncoming", "loadConversations", "filter", "search"]) {
    assert.doesNotMatch(streamEffect.slice(streamEffect.lastIndexOf("}, [")), new RegExp(`\\b${dep}\\b`));
  }
});

test("stream events go through a ref that always holds the latest handler", () => {
  assert.match(streamEffect, /applyIncomingRef\.current\(JSON\.parse\(/);
  assert.doesNotMatch(streamEffect, /[^.]\bapplyIncoming\(/);
  assert.match(src, /const applyIncomingRef = useRef\(applyIncoming\);\n\s*useEffect\(\(\) => \{\n\s*applyIncomingRef\.current = applyIncoming;\n\s*\}, \[applyIncoming\]\);/);
});

test("a conversation event still reloads the list with the current filter and search", () => {
  const apply = src.slice(src.indexOf("const applyIncoming = useCallback"), src.indexOf("const resync = useCallback"));
  assert.match(apply, /event\.type === "conversation"[\s\S]*loadConversations\(\);/);
  assert.match(apply, /\}, \[loadConversations, loadUnread, clearSendState\]\);/);
  const load = src.slice(src.indexOf("const loadConversations = useCallback"), src.indexOf("const loadMoreConversations"));
  assert.match(load, /\}, \[filter, search\]\);/);
});
