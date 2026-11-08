import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { appendInboxPage, inboxPageUrl, INBOX_PAGE_SIZE } from "../../src/lib/notifications/inbox-pages";

// SKAI-1694: the Notification Center follows nextCursor past the newest 30 in every view.
test("every view asks for the same filters on the first and older pages", () => {
  for (const view of ["all", "mentions", "actions"]) {
    const first = new URL(inboxPageUrl(view), "http://x"), older = new URL(inboxPageUrl(view, "n-30"), "http://x");
    assert.equal(first.searchParams.get("view"), view);
    assert.equal(first.searchParams.get("limit"), String(INBOX_PAGE_SIZE));
    assert.equal(first.searchParams.get("cursor"), null);
    assert.equal(older.searchParams.get("cursor"), "n-30");
    assert.equal(older.searchParams.get("status"), view === "actions" ? "open" : null);
    assert.equal(older.searchParams.get("view"), view);
  }
});

test("31+ rows: an older page appends, and a retried cursor never duplicates rows", () => {
  const rows = Array.from({ length: 35 }, (_, i) => ({ id: `n-${i}` }));
  const shown = rows.slice(0, 30);
  const next = appendInboxPage(shown, rows.slice(30));
  assert.equal(next.length, 35);
  assert.equal(appendInboxPage(next, rows.slice(30)).length, 35);
  assert.deepEqual(shown.length, 30); // the first page is not mutated
});

test("the center consumes nextCursor, offers Show older, and drops stale pages", () => {
  const src = readFileSync(new URL("../../src/components/notifications/notification-center.tsx", import.meta.url), "utf8");
  assert.match(src, /setNextCursor\(typeof json\.nextCursor === "string"/);
  assert.match(src, /inboxPageUrl\(tab, nextCursor\)/);
  assert.match(src, /if \(requestId !== requestRef\.current\) return;\s*\n\s*if \(!Array\.isArray\(json\.notifications\)\) throw/);
  assert.match(src, /data-notifications-load-older/);
});
