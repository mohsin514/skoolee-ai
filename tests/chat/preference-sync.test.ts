import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1542: mute/pin/archive update the list and the open thread together and roll back on failure.
const provider = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
const thread = readFileSync("src/components/chat/message-thread.tsx", "utf8");
const body = provider.slice(provider.indexOf("const setPreference = useCallback"), provider.indexOf("const leaveConversation"));

test("both the list and the open thread detail get the change", () => {
  assert.match(body, /setConversations\(\(prev\) => prev\.map/);
  assert.match(body, /setDetail\(\(prev\) => \(prev && prev\.id === id \? \{ \.\.\.prev, \.\.\.values \} : prev\)\)/);
});

test("non-OK and network rejection both roll back and report", () => {
  assert.match(body, /try \{[\s\S]*ok = res\.ok;[\s\S]*\} catch \{\s*setError\(/);
  assert.match(body, /if \(!ok\) apply\(before\);/);
  assert.match(body, /return ok;/);
});

test("archive closes the thread only after the server confirms", () => {
  assert.match(thread, /if \(await setPreference\(detail\.id, \{ isArchived: !detail\.isArchived \}\)\) closeConversation\(\);/);
});
