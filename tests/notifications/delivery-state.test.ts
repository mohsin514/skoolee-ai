import { test } from "node:test";
import assert from "node:assert/strict";
import { coarseDeliveryState, deliveryState, digestDeliveryState, RECEIPT_WAIT_MS } from "../../src/lib/notifications/delivery-state";

const now = new Date("2026-11-02T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

test("SKAI-864: queued, sent, delivered, failed and unknown are told apart", () => {
  assert.equal(deliveryState({ status: "PENDING", channel: "WHATSAPP" }, now), "QUEUED");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(60_000) }, now), "SENT");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(60_000), receiptStates: ["sent", "delivered"] }, now), "DELIVERED");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(60_000), receiptStates: ["read"] }, now), "OPENED");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(60_000), receiptStates: ["sent", "failed"] }, now), "FAILED");
  assert.equal(deliveryState({ status: "FAILED", channel: "EMAIL" }, now), "FAILED");
  assert.equal(deliveryState({ status: "SENT", channel: "WHATSAPP", sentAt: ago(RECEIPT_WAIT_MS + 1) }, now), "UNKNOWN");
});

test("SKAI-864: channels without receipts stay sent; blocked and no-contact pass through", () => {
  assert.equal(deliveryState({ status: "SENT", channel: "EMAIL", sentAt: ago(RECEIPT_WAIT_MS * 3) }, now), "SENT");
  assert.equal(deliveryState({ status: "BLOCKED", channel: "WHATSAPP" }, now), "BLOCKED");
  assert.equal(deliveryState({ status: "NO_RECIPIENT", channel: "WHATSAPP" }, now), "NO_RECIPIENT");
});

test("SKAI-800: opened is its own state, never folded into delivered", () => {
  const wa = { status: "SENT", channel: "WHATSAPP", sentAt: ago(60_000) };
  assert.equal(deliveryState({ ...wa, receiptStates: ["sent", "delivered", "read"] }, now), "OPENED");
  assert.equal(deliveryState({ ...wa, receiptStates: ["delivered"] }, now), "DELIVERED");
  assert.equal(deliveryState({ ...wa, receiptStates: ["read", "failed"] }, now), "FAILED");
  assert.equal(coarseDeliveryState("OPENED"), "DELIVERED");
  assert.equal(coarseDeliveryState("UNKNOWN"), "UNKNOWN");
});

test("SKAI-800: digest seenAt maps to opened; sent-but-unseen is delivered; blocked stays blocked", () => {
  assert.equal(digestDeliveryState({ status: "SENT", seenAt: now }), "OPENED");
  assert.equal(digestDeliveryState({ status: "SENT", seenAt: null }), "DELIVERED");
  assert.equal(digestDeliveryState({ status: "BLOCKED", seenAt: null }), "BLOCKED");
});

test("SKAI-800: every state is distinct and action completed is never inferred from delivery", () => {
  const wa = { status: "SENT", channel: "WHATSAPP" };
  const states = [
    deliveryState({ status: "PENDING", channel: "WHATSAPP" }, now),
    deliveryState({ ...wa, sentAt: ago(1) }, now),
    deliveryState({ ...wa, sentAt: ago(1), receiptStates: ["delivered"] }, now),
    deliveryState({ ...wa, sentAt: ago(1), receiptStates: ["read"] }, now),
    deliveryState({ ...wa, sentAt: ago(1), receiptStates: ["failed"] }, now),
    deliveryState({ ...wa, sentAt: ago(RECEIPT_WAIT_MS + 1) }, now),
    deliveryState({ status: "NO_RECIPIENT", channel: "WHATSAPP" }, now),
    deliveryState({ status: "BLOCKED", channel: "WHATSAPP" }, now),
  ];
  assert.equal(new Set(states).size, states.length);
  for (const receipts of [["read"], ["delivered", "read"], ["sent", "delivered"]]) {
    assert.notEqual(deliveryState({ ...wa, sentAt: ago(1), receiptStates: receipts }, now) as string, "ACTION_COMPLETED");
  }
});
