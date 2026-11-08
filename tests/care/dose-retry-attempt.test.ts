import assert from "node:assert/strict";
import { test } from "node:test";
import { doseAttempt } from "../../src/components/care/care";

// SKAI-591: the "Record dose given now" button sent no key and no time, so a retry after a lost
// response reached the server as a new administration (new server time) and recorded a second dose.
test("a retry of the same administration resends the same key and time", () => {
  const pending = new Map<string, { idempotencyKey: string; givenAt: string }>();
  let t = Date.parse("2026-11-02T08:30:00.000Z");
  const now = () => new Date((t += 60_000));
  const first = doseAttempt(pending, "ins-qa-1", now);
  const retry = doseAttempt(pending, "ins-qa-1", now);
  assert.deepEqual(retry, first);
  assert.ok(first.idempotencyKey);
});

test("after the server confirms, the next administration is a new one", () => {
  const pending = new Map<string, { idempotencyKey: string; givenAt: string }>();
  const first = doseAttempt(pending, "ins-qa-1");
  pending.delete("ins-qa-1");
  const next = doseAttempt(pending, "ins-qa-1", () => new Date(Date.now() + 3_600_000));
  assert.notEqual(next.idempotencyKey, first.idempotencyKey);
  assert.notEqual(next.givenAt, first.givenAt);
});

test("each instruction keeps its own pending administration", () => {
  const pending = new Map<string, { idempotencyKey: string; givenAt: string }>();
  assert.notEqual(doseAttempt(pending, "ins-qa-1").idempotencyKey, doseAttempt(pending, "ins-qa-2").idempotencyKey);
});
