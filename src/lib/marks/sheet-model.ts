// SKAI-1869: the teacher mark sheet's per-sheet derivations, kept linear in the number of cells so a 50 x 12 sheet
// does not do (students x subjects)^2 work when it loads or rebuild several sheet-sized structures per keystroke.
type SheetStudent = { id: string; fullName?: string };
type SheetSubject = { id: string; name?: string; totalMarks?: number | null };
type SheetMark = { studentId: string; subjectId: string };

export const markCellKey = (studentId: string, subjectId: string) => `${studentId}:${subjectId}`;

/** One value per sheet cell that has a saved mark. The first mark for a cell wins, as the old linear `find` did. */
export function indexSheetMarks<M extends SheetMark>(students: readonly SheetStudent[], subjects: readonly SheetSubject[], marks: readonly M[], toValue: (mark: M) => string) {
  const byCell = new Map<string, M>();
  for (const mark of marks) {
    const key = markCellKey(mark.studentId, mark.subjectId);
    if (!byCell.has(key)) byCell.set(key, mark);
  }
  const values: Record<string, string> = {};
  for (const student of students) {
    for (const subject of subjects) {
      const key = markCellKey(student.id, subject.id);
      const mark = byCell.get(key);
      if (mark) values[key] = toValue(mark);
    }
  }
  return values;
}

export const sheetFields = (students: readonly SheetStudent[], subjects: readonly SheetSubject[]) =>
  students.flatMap((student) => subjects.map((subject) => markCellKey(student.id, subject.id)));

export const sheetLabels = (students: readonly SheetStudent[], subjects: readonly SheetSubject[]) =>
  Object.fromEntries(students.flatMap((student) => subjects.map((subject) => [markCellKey(student.id, subject.id), `${student.fullName} — ${subject.name}`])));

/** Cells the save guard rejects: a value that is not a number between 0 and the subject's total (100 by default). */
export function invalidSheetCells<S extends SheetStudent, J extends SheetSubject>(students: readonly S[], subjects: readonly J[], values: Record<string, string>) {
  const invalid: { student: S; subject: J }[] = [];
  for (const student of students) {
    for (const subject of subjects) {
      const value = values[markCellKey(student.id, subject.id)];
      if (value === "" || value === undefined) continue;
      const num = Number(value);
      if (!(Number.isFinite(num) && num >= 0 && num <= (subject.totalMarks || 100))) invalid.push({ student, subject });
    }
  }
  return invalid;
}

/** Entered (non-empty) cells per subject id, in one pass over the sheet. */
export function enteredBySubject(students: readonly SheetStudent[], subjects: readonly SheetSubject[], values: Record<string, string>) {
  const counts = new Map<string, number>();
  for (const subject of subjects) {
    let entered = 0;
    for (const student of students) if ((values[markCellKey(student.id, subject.id)] ?? "") !== "") entered += 1;
    counts.set(subject.id, entered);
  }
  return counts;
}

/** Hands out request tokens; only the most recent one is current, so a slower, older response can be dropped. */
export function createRequestSequence() {
  let latest = 0;
  return { begin: () => ++latest, isCurrent: (token: number) => token === latest };
}
