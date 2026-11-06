import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-348: react-pdf 4.x mangles glyphs in mixed Urdu/Latin text (a pupil's name, a subject, "QA-f")
// when the Text itself carries `direction: "rtl"`. Remarks are set right-aligned instead; the bidi
// algorithm already orders the runs. Lane f showed "ریاضی میں مسلسل بہتری۔ (QA-f مصنوعی)" printed as "Óیاضی ...".
test("report-card Urdu/Arabic remark text is right-aligned, not direction rtl", () => {
  const source = readFileSync("src/lib/academic/pdf.tsx", "utf8");
  const block = source.match(/urduText:\s*\{([^}]*)\}/);
  assert.ok(block, "urduText style exists");
  assert.doesNotMatch(block[1], /direction:\s*"rtl"/);
  assert.match(block[1], /textAlign:\s*"right"/);
});
