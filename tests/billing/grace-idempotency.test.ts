import assert from "node:assert/strict";
import test from "node:test";
import { assertSameRequest } from "@/lib/billing/lifecycle";

const until = new Date("2026-11-10T23:59:59.000Z");
const stored = { kind: "GRACE_EXTENSION", requestedPlan: null, effectiveAt: until, details: { requestedUntil: until.toISOString(), reason: "Bank transfer is delayed", status: "REVIEW_REQUIRED" } };
const grace = (date: Date, reason: string) => ({ kind: "GRACE_EXTENSION", effectiveAt: date, details: { requestedUntil: date.toISOString(), reason, status: "REVIEW_REQUIRED" } });

test("SKAI-1458: an identical grace request replays", () => {
  assert.doesNotThrow(() => assertSameRequest(stored, grace(until, "Bank transfer is delayed")));
});

test("SKAI-1458: the same key with a different deadline is a conflict", () => {
  assert.throws(() => assertSameRequest(stored, grace(new Date("2026-11-20T23:59:59.000Z"), "Bank transfer is delayed")), /different subscription action/);
});

test("SKAI-1458: the same key with a different reason is a conflict", () => {
  assert.throws(() => assertSameRequest(stored, grace(until, "Waiting on the board to approve")), /different subscription action/);
});

test("SKAI-1458: other request kinds keep their existing comparison", () => {
  const cancel = { kind: "CANCELLATION", requestedPlan: null, effectiveAt: until, details: { reason: "a" } };
  assert.doesNotThrow(() => assertSameRequest(cancel, { kind: "CANCELLATION", effectiveAt: null, details: { reason: "b" } }));
});
