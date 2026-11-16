import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../../src/lib/api/scope";
import { optionalPaymentText } from "../../src/lib/fees/payment-text";
// SKAI-2097: POST /api/fees/collect validates referenceNumber and note instead of failing with a raw 500.
const status = (value: unknown) => {
  try {
    optionalPaymentText(value, "note", 5);
    return 200;
  } catch (error) {
    return error instanceof ApiError ? error.status : 500;
  }
};
test("missing or text values pass through", () => {
  assert.equal(optionalPaymentText(undefined, "note", 5), null);
  assert.equal(optionalPaymentText(null, "note", 5), null);
  assert.equal(optionalPaymentText("abc", "note", 5), "abc");
});
test("non-text or over-long values are a 400", () => {
  for (const bad of [4242, { x: 1 }, ["a"], true, "123456"]) assert.equal(status(bad), 400);
});
