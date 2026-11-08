import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1647: a failed setup source (non-OK or success:false) is a load failure, never empty campus setup.
for (const file of ["src/components/timetable/TimetablePanel.tsx", "src/components/timetable/TimetableStudio.tsx"]) {
  const source = readFileSync(file, "utf8");
  test(`${file} rejects non-OK and unsuccessful setup responses before applying data`, () => {
    const ok = source.indexOf("every(res => res.ok)) throw");
    const success = source.indexOf("every(json => json?.success)) throw");
    const apply = source.indexOf("if (ttJson.success) setTimetables(ttJson.data);");
    assert.ok(ok > 0 && success > ok && apply > success);
    assert.match(source, /setLoadFailed\(true\)/);
  });
}
