import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequestSequence, enteredBySubject, indexSheetMarks, invalidSheetCells, markCellKey, sheetFields, sheetLabels } from "../../src/lib/marks/sheet-model";
import { createDebouncedTask } from "../../src/lib/drafts/debounce";

// SKAI-1869: the teacher mark sheet builds its cell map in one pass, drops responses for a test it has left,
// and draft persistence waits for a pause in typing instead of rewriting sessionStorage on every keystroke.
type Mark = { studentId: string; subjectId: string; marksObtained: number; isAbsent?: boolean };
const students = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `st-${i}`, fullName: `Pupil ${i}` }));
const subjects = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `sub-${i}`, name: `Subject ${i}`, totalMarks: i === 0 ? null : 50 }));
const value = (mark: Mark) => (mark.isAbsent ? "ABSENT" : String(mark.marksObtained));

// The map the page used to build: a linear find per cell.
function naiveIndex(sts: { id: string }[], subs: { id: string }[], marks: Mark[]) {
  const map: Record<string, string> = {};
  for (const st of sts) for (const sub of subs) {
    const mark = marks.find((m) => m.studentId === st.id && m.subjectId === sub.id);
    if (mark) map[`${st.id}:${sub.id}`] = value(mark);
  }
  return map;
}

test("the cell map matches the old per-cell find, first duplicate wins and off-sheet marks are ignored", () => {
  const sts = students(4), subs = subjects(3);
  const marks: Mark[] = [
    { studentId: "st-0", subjectId: "sub-0", marksObtained: 7 },
    { studentId: "st-0", subjectId: "sub-0", marksObtained: 9 },
    { studentId: "st-1", subjectId: "sub-2", marksObtained: 0, isAbsent: true },
    { studentId: "st-gone", subjectId: "sub-1", marksObtained: 3 },
    { studentId: "st-3", subjectId: "sub-other", marksObtained: 4 },
  ];
  const indexed = indexSheetMarks(sts, subs, marks, value);
  assert.deepEqual(indexed, naiveIndex(sts, subs, marks));
  assert.deepEqual(indexed, { "st-0:sub-0": "7", "st-1:sub-2": "ABSENT" });
});

test("building the cell map reads each saved mark once, however large the sheet", () => {
  for (const [rows, cols] of [[10, 4], [200, 30]] as const) {
    let reads = 0;
    const marks = students(rows).flatMap((st) => subjects(cols).map((sub, j) => {
      const mark = { subjectId: sub.id, marksObtained: j } as Mark;
      Object.defineProperty(mark, "studentId", { get: () => { reads += 1; return st.id; }, enumerable: true });
      return mark;
    }));
    const indexed = indexSheetMarks(students(rows), subjects(cols), marks, value);
    assert.equal(Object.keys(indexed).length, rows * cols);
    assert.equal(reads, rows * cols, `${rows}x${cols}: one read per mark, not one per cell per mark`);
  }
});

test("fields, labels, entered counts and invalid cells match the inline versions they replace", () => {
  const sts = students(3), subs = subjects(2);
  const values: Record<string, string> = { "st-0:sub-0": "101", "st-0:sub-1": "50", "st-1:sub-1": "51", "st-2:sub-0": "", "st-2:sub-1": "-1", "st-1:sub-0": "abc" };
  assert.deepEqual(sheetFields(sts, subs), ["st-0:sub-0", "st-0:sub-1", "st-1:sub-0", "st-1:sub-1", "st-2:sub-0", "st-2:sub-1"]);
  assert.equal(sheetLabels(sts, subs)["st-1:sub-0"], "Pupil 1 — Subject 0");
  assert.deepEqual([...enteredBySubject(sts, subs, values)], [["sub-0", 2], ["sub-1", 3]]);
  // Subject 0 has no total, so 100 is the ceiling; 101 and "abc" fail there, 51 and -1 fail subject 1 (out of 50).
  assert.deepEqual(invalidSheetCells(sts, subs, values).map(({ student, subject }) => markCellKey(student.id, subject.id)),
    ["st-0:sub-0", "st-1:sub-0", "st-1:sub-1", "st-2:sub-1"]);
  assert.deepEqual(invalidSheetCells([], subs, values), []);
});

test("a slower response for a test the teacher has left is no longer current", async () => {
  const sequence = createRequestSequence();
  const shown: string[] = [];
  const load = async (exam: string, delay: number) => {
    const token = sequence.begin();
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (sequence.isCurrent(token)) shown.push(exam);
  };
  await Promise.all([load("exam-a", 20), load("exam-b", 1)]);
  assert.deepEqual(shown, ["exam-b"]);
});

test("draft persistence runs once after a pause, flushes on demand and can be cancelled", () => {
  const timers = new Map<number, () => void>();
  let next = 0;
  const task = createDebouncedTask(400, { set: (fn) => { timers.set(++next, fn); return next; }, clear: (handle) => { timers.delete(handle as number); } });
  const writes: string[] = [];
  for (const keystroke of ["4", "45", "45.5"]) task.schedule(() => writes.push(keystroke));
  assert.equal(timers.size, 1, "each keystroke replaces the pending write");
  [...timers.values()][0]();
  assert.deepEqual(writes, ["45.5"]);
  task.flush();
  assert.deepEqual(writes, ["45.5"], "nothing pending, nothing written");
  task.schedule(() => writes.push("page hidden"));
  task.flush();
  assert.equal(timers.size, 0);
  assert.deepEqual(writes, ["45.5", "page hidden"]);
  task.schedule(() => writes.push("saved"));
  task.cancel();
  task.flush();
  assert.equal(task.pending, false);
  assert.deepEqual(writes, ["45.5", "page hidden"]);
});
