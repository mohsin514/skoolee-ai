import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1595: rows from one filter/search are never shown as results of a different, failed query.
const src = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
const body = src.slice(src.indexOf("const loadConversations = useCallback"), src.indexOf("const retryList"));

test("a new filter or search shows loading first", () => {
  assert.match(body, /const query = `\$\{filter\}\|\$\{search\.trim\(\)\}`;/);
  assert.match(body, /const sameQuery = listQueryRef\.current === query;\n\s*if \(!sameQuery\) setIsLoadingList\(true\);/);
});

test("a successful load records which query owns the rows", () => {
  assert.match(body, /setConversations\(json\.conversations\);\n\s*listQueryRef\.current = query;/);
});

test("a failed new query clears the old rows; a failed refresh of the same query keeps them", () => {
  assert.match(body, /catch \{[^}]*if \(!sameQuery\) \{ setConversations\(\[\]\); listQueryRef\.current = null; \}\n\s*setListFailed\(true\);/);
});
