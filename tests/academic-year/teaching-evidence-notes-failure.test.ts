import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { arabicWorkflowUi, urduWorkflowUi } from "@/lib/locale/workflow-ui-messages";

const src = readFileSync("src/components/academic-year/TeacherPerformancePanel.tsx", "utf8");

test("SKAI-1733: a failed support-note load is an error with Retry, never an empty history", () => {
  const fetcher = src.slice(src.indexOf("const fetchNotes = async"), src.indexOf("const openNotes = async"));
  assert.doesNotMatch(src, /setNotes\(response\?\.ok && isApiOk\(json\) \? json\.data : \[\]\)/, "failure no longer maps to []");
  assert.match(fetcher, /else setNotesFailed\(true\);/);
  assert.doesNotMatch(fetcher, /setNotes\(\[\]\)/);
  assert.match(src, /\{notesFailed \? <ErrorState title=\{ui\("Support notes could not be loaded\."\)\}[^\n]*onRetry=\{\(\) => void fetchNotes\(row\.teacherId\)\}/);
});

test("SKAI-1733: last-known notes for the same teacher stay; adding waits for authoritative history", () => {
  assert.match(src, /setNotes\(lastNotes\.current\?\.teacherId === teacherId \? lastNotes\.current\.notes : null\);/);
  assert.match(src, /disabled=\{saving \|\| notesFailed \|\| notes === null \|\| draft\.trim\(\)\.length < NOTE_MIN\}/);
  // "No notes yet." is only reachable from a successful, empty response: notes === [] is set only on success.
  assert.match(src, /if \(response\?\.ok && isApiOk\(json\) && Array\.isArray\(json\.data\)\) \{ lastNotes\.current = \{ teacherId, notes: json\.data \}; setNotes\(json\.data\); \}/);
  for (const key of ["Support notes could not be loaded.", "Showing the notes last loaded. Adding a note waits until the history loads.", "Adding a note waits until the history loads."]) assert.ok(arabicWorkflowUi[key] && urduWorkflowUi[key], key);
});
