import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1003 live axe (nested-interactive, /admin?view=students): the card was a
// role="button" holding a checkbox and links. The open action is now its own button.
test("student card is not an interactive wrapper around other controls", () => {
  const src = readFileSync("src/components/shared-admin/students-panel.tsx", "utf8");
  const card = src.slice(src.indexOf("function StudentCard("), src.indexOf("function ContactActions("));
  assert.ok(card.length > 100, "found StudentCard");
  assert.doesNotMatch(card, /role="button"/);
  assert.doesNotMatch(card, /tabIndex=\{0\}/);
  assert.match(card, /<SystemButton\s+type="button"[\s\S]{0,400}?\{student\.fullName\}<\/span>\s*<\/SystemButton>/);
});
