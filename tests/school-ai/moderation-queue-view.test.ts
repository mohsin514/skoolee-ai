// SKAI-1456: the moderation queue distinguishes loading, failed, refresh-failed, valid-empty, denied and loaded states.
// Synthetic QA-01 rows only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { RequestFailure } from "../../src/lib/http/request-state";
import { moderatorQueue, queueView } from "../../src/lib/school-ai/moderation-queue-state";
import type { SlotView } from "../../src/lib/school-ai/paper-slot-service";

const slot = (id: string, moderatorUserId: string, status: string) => ({ id, moderatorUserId, status, subjectName: "QA Maths", gradeName: "QA Grade 6", authorName: "QA Teacher", dueOn: "2026-11-20" }) as unknown as SlotView;
const papers = [slot("qa-slot-1", "qa-mod-a", "READY_FOR_REVIEW"), slot("qa-slot-2", "qa-mod-a", "SEALED")];

test("loading is shown while nothing has loaded and nothing has failed", () => {
  assert.equal(queueView({ slots: null, failure: null }), "loading");
});

test("an initial failure is a failed state, never hidden or an empty queue", () => {
  for (const kind of ["server", "offline", "timeout", "session", "provider"] as const) {
    assert.equal(queueView({ slots: null, failure: new RequestFailure(kind) }), "failed", kind);
  }
});

test("a transient failure followed by a successful retry restores the assigned papers", () => {
  assert.equal(queueView({ slots: null, failure: new RequestFailure("offline") }), "failed");
  // The retry succeeds: the component stores the queue and clears the failure.
  assert.equal(queueView({ slots: papers, failure: null }), "list");
});

test("a refresh failure keeps the last loaded papers on screen", () => {
  assert.equal(queueView({ slots: papers, failure: new RequestFailure("server") }), "list");
});

test("a successful empty queue is hidden, which is distinct from a failed one", () => {
  assert.equal(queueView({ slots: [], failure: null }), "hidden");
  assert.notEqual(queueView({ slots: null, failure: new RequestFailure("server") }), "hidden");
});

test("a denied role sees no queue, even when papers were loaded before", () => {
  assert.equal(queueView({ slots: null, failure: new RequestFailure("denied") }), "denied");
  assert.equal(queueView({ slots: papers, failure: new RequestFailure("denied") }), "denied");
});

test("the moderator queue shows only the viewer's own papers in queue statuses", () => {
  const payload = {
    viewerId: "qa-mod-a",
    slots: [
      slot("qa-slot-1", "qa-mod-a", "READY_FOR_REVIEW"),
      slot("qa-slot-2", "qa-mod-b", "READY_FOR_REVIEW"),
      slot("qa-slot-3", "qa-mod-a", "DRAFT"),
      slot("qa-slot-4", "qa-mod-a", "CHANGED_AFTER_APPROVAL"),
    ],
  };
  assert.deepEqual(moderatorQueue(payload).map(s => s.id), ["qa-slot-1", "qa-slot-4"]);
});

test("another moderator's papers in the same school never appear in this viewer's queue", () => {
  const payload = { viewerId: "qa-mod-b", slots: [slot("qa-slot-1", "qa-mod-a", "READY_FOR_REVIEW")] };
  assert.deepEqual(moderatorQueue(payload), []);
});
