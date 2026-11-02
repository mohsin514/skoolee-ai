import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryState, RECEIPT_WAIT_MS } from "../../src/lib/notifications/delivery-state";

const now = new Date("2026-11-02T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

test("SKAI-864: queued, sent, delivered, failed and unknown are told apart", () => {
  assert.equal(deliveryState({ status: "PENDING", channel: "WHATSAPP" }, now), "QUEUED");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(60_000) }, now), "SENT");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(60_000), receiptStates: ["sent", "delivered"] }, now), "DELIVERED");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(60_000), receiptStates: ["read"] }, now), "DELIVERED");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(60_000), receiptStates: ["sent", "failed"] }, now), "FAILED");
  assert.equal(deliveryState({ status: "FAILED", channel: "EMAIL" }, now), "FAILED");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(RECEIPT_WAIT_MS + 1) }, now), "UNKNOWN");
});

test("SKAI-864: channels without receipts stay sent; blocked and no-contact pass through", () => {
  assert.equal(deliveryState({ status: "SENT", channel: "EMAIL", sentAt: ago(RECEIPT_WAIT_MS * 3) }, now), "SENT");
  assert.equal(deliveryState({ status: "BLOCKED", channel: "WHATSAPP" }, now), "BLOCKED");
  assert.equal(deliveryState({ status: "NO_RECIPIENT", channel: "WHATSAPP" }, now), "NO_RECIPIENT");
});
