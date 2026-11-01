import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/timetable/TimetablePanel.tsx", "utf8");
const load = source.slice(source.indexOf("const loadData = useCallback"), source.indexOf("useEffect(() => { loadData(); }"));

test("SKAI-1423: any non-OK initial response enters the error state before state is replaced", () => {
  assert.match(load, /\[ttRes, classRes, teacherRes, periodRes, roomRes, calRes\]\.every\(res => res\.ok\)\) throw/);
  assert.ok(load.indexOf("every(res => res.ok)") < load.indexOf("setTimetables("));
  assert.match(load, /catch \{\s*setLoadFailed\(true\);/);
});
