import assert from "node:assert/strict";
import test from "node:test";
import { translateUi } from "../../src/lib/locale/ui-messages";

// SKAI-1280: the exam rail's Seating step must use the same Arabic term as the seating plan it opens
// ("المقاعد"), so the office can find the Seating action in Arabic.
test("the Seating step uses the seating-plan term in Arabic", () => {
  const step = translateUi("Seating", "ar");
  assert.equal(step, "المقاعد");
  assert.ok(translateUi("Seating plan", "ar").includes(step));
});
