import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTimetableStatusCurrent } from "../../src/lib/timetable/manual";

// SKAI-1742: the real guard used inside the locked unpublish transaction.
const first = new Date("2026-11-01T08:00:00.000Z");
const board = (over: Partial<{ status: string; draftRevision: number; publishedAt: Date | null }> = {}) => ({ status: "PUBLISHED", draftRevision: 4, publishedAt: first, ...over });
const stale = (fn: () => void) => assert.throws(fn, (error: { status?: number; message: string }) => error.status === 409 && /another session/.test(error.message));

test("the revision and publication the tab saw pass", () => {
  assertTimetableStatusCurrent(board(), { draftRevision: 4, publishedAt: first.toISOString() });
});

test("a newer revision, a newer publication, a draft board or a missing revision are stale", () => {
  stale(() => assertTimetableStatusCurrent(board({ draftRevision: 5 }), { draftRevision: 4, publishedAt: first.toISOString() }));
  stale(() => assertTimetableStatusCurrent(board({ publishedAt: new Date("2026-11-05T09:00:00.000Z") }), { draftRevision: 4, publishedAt: first.toISOString() }));
  stale(() => assertTimetableStatusCurrent(board({ status: "DRAFT", publishedAt: null }), { draftRevision: 4, publishedAt: first.toISOString() }));
  stale(() => assertTimetableStatusCurrent(board(), {}));
});
