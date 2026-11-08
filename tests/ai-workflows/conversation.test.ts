import { test } from "node:test";
import assert from "node:assert/strict";
import { hasMultipleActions, isAppGuidanceRequest, isGuidanceQuestion, plannerInput } from "../../src/lib/ai-workflows/planner/conversation";

test("conversation context converts scoped IDs to handles and omits server and credential fields", () => {
  const id = "12345678-1234-1234-1234-123456789012";
  assert.deepEqual(plannerInput({ classId: id, schoolId: "private-school", password: "secret", expected: { price: 1 }, inputHash: "hash", name: "7B", rows: [{ id: "internal", amount: 25 }], unknown: id }, new Map([["class:1", id]])), {
    classId: "class:1", name: "7B", rows: [{ amount: 25 }], unknown: "class:1",
  });
});

test("compound actions bypass single-form fast paths without mistaking normal form text for an action", () => {
  for (const text of ["Create a school and update the package price", "Change Pro price; show my account", "Create a school then create a campus", "Also set my city to Lahore"]) assert.equal(hasMultipleActions(text), true, text);
  for (const text of ["Create a school", "Owner name is Ali and email is ali@example.invalid", "City is Lahore", "Set Basic and Pro prices"]) assert.equal(hasMultipleActions(text), false, text);
});

test("asking how to update a price is guidance, not authorization to change it", () => {
  assert.equal(isGuidanceQuestion("How do I update package prices in Skoolee?"), true);
  assert.equal(isGuidanceQuestion("Set the Pro price to 4500"), false);
  assert.equal(isAppGuidanceRequest("How do I update package prices in Skoolee?"), true);
  assert.equal(isAppGuidanceRequest("What is my current balance?"), false);
});
