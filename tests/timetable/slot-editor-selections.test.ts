import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/timetable/TimetableStudio.tsx", "utf8");
const modal = source.slice(source.indexOf("function SlotEditorModal"), source.indexOf("// ─── Print grid"));

test("SKAI-1390: the saved teacher and room stay selectable when availability fails or they are not free", () => {
  assert.match(modal, /const teacherOptions = useMemo<TeacherOption\[\]>/);
  assert.match(modal, /const roomOptions = useMemo<RoomOption\[\]>/);
  assert.match(modal, /if \(!teacherId \|\| freeTeachers\.some\(\(t\) => t\.id === teacherId\)\) return freeTeachers;/);
  assert.match(modal, /if \(!roomId \|\| freeRooms\.some\(\(r\) => r\.id === roomId\)\) return freeRooms;/);
  assert.match(modal, /\{teacherOptions\.map\(\(t\) => \(/);
  assert.match(modal, /\{roomOptions\.map\(\(r\) => \(/);
  assert.doesNotMatch(modal, /\{freeTeachers\.map\(/);
  assert.doesNotMatch(modal, /\{freeRooms\.map\(/);
});

test("SKAI-1390: failed availability keeps the error banner and hides the empty-state warnings", () => {
  assert.match(modal, /\{!loadingAvail && availFailed && \(/);
  assert.match(modal, /\{!loadingAvail && !availFailed && freeTeachers\.length === 0 && \(/);
  assert.match(modal, /\{!loadingAvail && !availFailed && freeRooms\.length === 0 && \(/);
  assert.match(modal, /if \(!r\.ok \|\| !j\.success\) throw new Error\("availability"\);/);
});
