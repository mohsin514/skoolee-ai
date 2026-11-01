import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { summaryForChild } from "../../src/lib/fees/family-summary";

// SKAI-1464: the parent fee header shows a balance only for the child it was loaded for. Switching child hides the
// previous balance on the same render, so one child's name is never shown with another child's balance.
describe("parent fee header: balance belongs to one child", () => {
  const siblingA = { studentId: "child-a", outstanding: 4200, currency: "PKR", fullName: "Sibling A" };
  const siblingB = { studentId: "child-b", outstanding: 0, currency: "PKR", fullName: "Sibling B" };

  test("the balance is shown for the child it was loaded for", () => {
    assert.deepEqual(summaryForChild(siblingA, "child-a"), siblingA);
  });

  test("switching to a sibling with a different balance hides the previous child's balance at once", () => {
    assert.equal(summaryForChild(siblingA, "child-b"), null, "sibling A's 4200 must not show for sibling B");
  });

  test("a sibling's own summary is shown only after that sibling's statement reports", () => {
    assert.equal(summaryForChild(null, "child-b"), null);
    assert.deepEqual(summaryForChild(siblingB, "child-b"), siblingB);
    assert.equal(summaryForChild(siblingB, "child-a"), null, "sibling B's zero must not show for sibling A");
  });

  test("the default child (no explicit selection) matches only a summary reported for the default", () => {
    const defaultChild = { ...siblingA, studentId: "" };
    assert.deepEqual(summaryForChild(defaultChild, undefined), defaultChild);
    assert.deepEqual(summaryForChild(defaultChild, null), defaultChild);
    assert.equal(summaryForChild(siblingA, null), null);
  });
});
