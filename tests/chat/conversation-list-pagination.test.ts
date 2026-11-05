import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1696: the inbox was capped at 50 with no cursor, silently hiding older conversations.
const service = readFileSync("src/lib/chat/service.ts", "utf8");
const route = readFileSync("src/app/api/chat/conversations/route.ts", "utf8");
const provider = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
const list = readFileSync("src/components/chat/conversation-list.tsx", "utf8");

test("the service pages memberships with a keyset cursor and reports nextCursor", () => {
  const fn = service.slice(service.indexOf("export async function listConversationsPage"), service.indexOf("export async function getConversation("));
  assert.ok(fn.length > 0, "listConversationsPage exists");
  assert.match(fn, /take: limit \+ 1,/);
  assert.match(fn, /\{ id: "asc" \}\]/);
  assert.match(fn, /\.\.\.\(options\.cursor \? \{ cursor: \{ id: options\.cursor \}, skip: 1 \} : \{\}\)/);
  assert.match(fn, /const nextCursor = hasMore \? \(page\[page\.length - 1\]\?\.id \?\? null\) : null;/);
  // Every page still goes through the membership + current-access check.
  assert.match(fn, /userId: user\.userId,\n\s*leftAt: null,/);
  assert.match(fn, /assertCurrentConversationAccess\(user, row\)/);
});

test("the GET route accepts ?cursor= and returns nextCursor", () => {
  assert.match(route, /cursor: searchParams\.get\("cursor"\) \?\? undefined,/);
  assert.match(route, /Response\.json\(\{ success: true, conversations, nextCursor \}\)/);
});

test("the provider appends older pages, de-dups and drops stale pages", () => {
  const fn = provider.slice(provider.indexOf("const loadMoreConversations = useCallback"), provider.indexOf("const retryList"));
  assert.ok(fn.length > 0, "loadMoreConversations exists");
  assert.match(fn, /params\.set\("cursor", listCursor\)/);
  assert.match(fn, /if \(listQueryRef\.current !== query \|\| listRequestRef\.current !== requestId\) return;/);
  assert.match(fn, /const seen = new Set\(prev\.map\(\(c\) => c\.id\)\);/);
  assert.match(fn, /if \(!res\.ok\) throw new Error/);
});

test("the list shows a Show older button with an inline alert on failure", () => {
  assert.match(list, /hasMoreConversations \? \(/);
  assert.match(list, /size="sm" variant="outline"[^>]*loading=\{moreLoading\}/);
  assert.match(list, /<p role="alert" className="text-sm text-status-danger-text">\{ui\("Older conversations could not be loaded\."\)\}<\/p>/);
});
