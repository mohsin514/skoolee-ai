import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desk = readFileSync("src/components/library/lending-desk.tsx", "utf8");

test("sending a charge to the fees office refreshes the selected reader as well as the overview", () => {
  assert.match(desk, /decision: "HAND_TO_FEES"[\s\S]{0,200}Charge handed to the fees office\."\)\); void load\(\); void refreshMember\(\); \}/);
});

test("waiving a charge refreshes the selected reader as well as the overview", () => {
  assert.match(desk, /decision: "WAIVE"[\s\S]{0,200}reason and approver are recorded\."\)\); void load\(\); void refreshMember\(\); \}/);
});

test("refreshMember is a no-op without a selected reader and reloads the reader by card number", () => {
  assert.match(desk, /const refreshMember = async \(\) => \{\s*if \(!member\) return;[\s\S]{0,120}\/api\/library\/desk\?code=/);
});
