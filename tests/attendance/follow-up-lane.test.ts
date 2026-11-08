import assert from "node:assert/strict";
import { test } from "node:test";
import { alertKeyFragment, followUpLane } from "../../src/lib/attendance/follow-up";
import { absenceAlertKey } from "../../src/lib/notifications/automation";

const sent = (status: string) => ({ status, channel: "WHATSAPP", failedReason: status === "FAILED" ? "Invalid number" : null });

test("SKAI-823: an absence with no alert is NOT_SENT", () => {
  assert.equal(followUpLane([]), "NOT_SENT");
});

test("SKAI-823: only failed alerts is a delivery failure, not non-response", () => {
  assert.equal(followUpLane([sent("FAILED"), sent("FAILED")]), "DELIVERY_FAILED");
});

test("SKAI-823: any alert that went out means the family is awaited", () => {
  assert.equal(followUpLane([sent("FAILED"), sent("SENT")]), "AWAITING_RESPONSE");
  assert.equal(followUpLane([sent("PENDING")]), "AWAITING_RESPONSE");
});

test("SKAI-823: the key fragment matches stored alert keys for that student and day only", () => {
  const day = new Date("2026-11-02T00:00:00Z");
  const stored = `${absenceAlertKey("s1", day, 1)}:EMAIL:guardian-1`;
  assert.ok(stored.includes(alertKeyFragment("s1", day)));
  assert.ok(`${absenceAlertKey("s1", day, 4)}:SMS:guardian-1`.includes(alertKeyFragment("s1", day)));
  assert.ok(!stored.includes(alertKeyFragment("s11", day)));
  assert.ok(!stored.includes(alertKeyFragment("s1", new Date("2026-11-03T00:00:00Z"))));
});
