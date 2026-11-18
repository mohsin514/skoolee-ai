import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { csvCell } from "@/lib/csv";
// SKAI-2258: client-side CSV downloads must use the shared formula-injection guard, not a local quote-only cell().
test("date sheet and family-communication exports escape formula cells", () => {
  for (const file of ["src/components/timetable/ExamDateSheet.tsx", "src/components/communications/engagement-panel.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /const cell = csvCell;/, file);
  }
  assert.equal(csvCell('=HYPERLINK("http://x.test/?s","S")'), `"'=HYPERLINK(""http://x.test/?s"",""S"")"`);
  assert.equal(csvCell("Maths"), "Maths");
});
