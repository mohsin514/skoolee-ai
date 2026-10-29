import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mergePublishedPapers, type CalendarExam } from "../../src/lib/academic/family-calendar";

// SKAI-1027: families see exam dates only from the published date sheet.

test("unpublished date sheet contributes no dates for families", () => {
  const map = mergePublishedPapers(new Map<string, CalendarExam>(), [], 2026);
  assert.equal(map.size, 0);
});

test("published papers are grouped per exam, deduplicated and limited to the year", () => {
  const map = mergePublishedPapers(new Map(), [
    { examId: "e1", examTitle: "Mid-term", classLabel: "Grade 6 - A", date: "2026-11-02" },
    { examId: "e1", examTitle: "Mid-term", classLabel: "Grade 6 - A", date: new Date("2026-11-02T00:00:00.000Z") },
    { examId: "e1", examTitle: "Mid-term", classLabel: "Grade 6 - A", date: "2026-11-03" },
    { examId: "e2", examTitle: "Final", classLabel: "Grade 6 - A", date: "2027-03-01" },
  ], 2026);
  assert.deepEqual([...map.keys()], ["e1"]);
  assert.deepEqual(map.get("e1")!.dates, ["2026-11-02", "2026-11-03"]);
});

test("the unified calendar route excludes live session rows for families", () => {
  const route = readFileSync(new URL("../../src/app/api/academic/calendar/unified/route.ts", import.meta.url), "utf8");
  assert.match(route, /family \? \{ sessionId: null \} : \{\}/);
  assert.match(route, /publishedPapersForClasses\(user\.schoolId, familyClassIds\)/);
});
