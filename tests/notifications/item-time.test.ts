import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inboxItemTime } from "../../src/lib/notifications/inbox-pages";

// SKAI-1940: a reminded chat notification shows the time of its latest message, not of the first one.
test("a reminded row reads its lastRemindedAt time", () => {
  assert.equal(inboxItemTime({ createdAt: "2026-11-13T11:46:35Z", lastRemindedAt: "2026-11-13T16:42:16Z" }), "2026-11-13T16:42:16Z");
});

test("a row never reminded keeps its createdAt time", () => {
  assert.equal(inboxItemTime({ createdAt: "2026-11-13T11:46:35Z", lastRemindedAt: null }), "2026-11-13T11:46:35Z");
  assert.equal(inboxItemTime({ createdAt: "2026-11-13T11:46:35Z" }), "2026-11-13T11:46:35Z");
});

test("the center shows and day-buckets each row by its latest activity", () => {
  const src = readFileSync(new URL("../../src/components/notifications/notification-center.tsx", import.meta.url), "utf8");
  assert.match(src, /formatTime\(at\)/);
  assert.match(src, /dayBucket\(inboxItemTime\(items\[index - 1\]\)\)/);
  assert.doesNotMatch(src, /formatTime\(item\.createdAt\)|dayBucket\(item\.createdAt\)/);
});
