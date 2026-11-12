import { test } from "node:test";
import assert from "node:assert/strict";
import { createLatestOnlyLoader, mergeStudentEdit, mergeSubjectEdit, mergeTeacherEdit } from "../../src/lib/dashboard/console-data-merge";

/** SKAI-1823: a one-row edit in the campus console no longer re-reads the whole campus, and reloads never land out of order. */

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function campus(schoolId: string, campusId: string) {
  const attendance = [{ id: `${campusId}-att`, status: "PRESENT", date: new Date("2026-11-10") }];
  return {
    schoolId,
    campusId,
    students: [
      { id: `${campusId}-s1`, schoolId, campusId, classId: `${campusId}-c1`, fullName: "Pupil One", rollNo: "G1-A-001", status: "active", archivedAt: null, guardianPhone: "0300", category: null, categoryId: null, attendance, reportCards: [{ id: "rc1" }] },
      { id: `${campusId}-s2`, schoolId, campusId, classId: `${campusId}-c1`, fullName: "Pupil Two", rollNo: "G1-A-002", status: "active", archivedAt: null, guardianPhone: "0301", attendance: [], reportCards: [] },
    ],
    teachers: [
      { id: `${campusId}-t1`, fullName: "Teacher One", profileImageUrl: null, email: "t1@qa.test", isActive: true, phone: "1", dateOfBirth: new Date("1990-01-01"), taughtSubjects: [{ id: `${campusId}-sub1`, name: "Maths", totalMarks: 100 }], _count: { taughtSubjects: 1, ledClasses: 0 } },
    ],
    classes: [
      { id: `${campusId}-c1`, subjects: [{ id: `${campusId}-sub1`, name: "Maths", totalMarks: 100, code: "MA", isElective: false, archivedAt: null, teacher: { id: `${campusId}-t1` } }] },
    ],
  };
}

test("two rapid reloads leave the newer data on screen even when the first answers last", async () => {
  const reads = [deferred<string>(), deferred<string>()];
  let call = 0;
  const shown: string[] = [];
  let settled = 0;
  const loader = createLatestOnlyLoader(() => reads[call++].promise, { onData: (d) => shown.push(d), onError: () => assert.fail("no error"), onSettled: () => { settled += 1; } });
  const first = loader.run();
  const second = loader.run();
  assert.equal(loader.inFlight(), true);
  reads[1].resolve("newer");
  assert.equal(await second, "newer");
  reads[0].resolve("older");
  assert.equal(await first, "newer", "a superseded caller is answered with the newest read");
  assert.deepEqual(shown, ["newer"]);
  assert.equal(settled, 1);
  assert.equal(loader.inFlight(), false);
});

test("a superseded read that fails does not raise a load failure", async () => {
  const reads = [deferred<string>(), deferred<string>()];
  let call = 0;
  const errors: unknown[] = [];
  const loader = createLatestOnlyLoader(() => reads[call++].promise, { onData: () => undefined, onError: (e) => { errors.push(e); } });
  const first = loader.run();
  const second = loader.run();
  reads[0].reject(new Error("old read failed"));
  reads[1].resolve("ok");
  assert.equal(await first, "ok");
  assert.equal(await second, "ok");
  assert.deepEqual(errors, []);
});

test("a student contact edit merges in place and keeps derived attendance and report cards", () => {
  const data = campus("school-a", "campus-a1");
  const saved = { id: "campus-a1-s1", fullName: "Pupil One", rollNo: "G1-A-001", classId: "campus-a1-c1", status: "active", archivedAt: null, guardianPhone: "0399", categoryId: "cat1", category: { id: "cat1", name: "Day" }, medicalNotes: "private" };
  const merged = mergeStudentEdit(data, "campus-a1-s1", saved)!;
  assert.ok(merged);
  const row = merged.students[0] as Record<string, unknown>;
  assert.equal(row.guardianPhone, "0399");
  assert.deepEqual(row.category, { id: "cat1", name: "Day" });
  assert.equal(row.attendance, data.students[0].attendance);
  assert.deepEqual(row.reportCards, [{ id: "rc1" }]);
  assert.equal("medicalNotes" in row, false, "profile-only fields stay out of the roster (SKAI-163)");
  assert.equal(merged.students[1], data.students[1]);
  assert.equal(data.students[0].guardianPhone, "0300", "the loaded data is not mutated");
});

test("student edits that other widgets derive from fall back to a reload", () => {
  const data = campus("school-a", "campus-a1");
  const base = { id: "campus-a1-s1", fullName: "Pupil One", rollNo: "G1-A-001", classId: "campus-a1-c1", status: "active", archivedAt: null };
  assert.equal(mergeStudentEdit(data, "campus-a1-s1", { ...base, fullName: "Renamed" }), null);
  assert.equal(mergeStudentEdit(data, "campus-a1-s1", { ...base, status: "inactive" }), null);
  assert.equal(mergeStudentEdit(data, "campus-a1-s1", { ...base, status: "archived", archivedAt: "2026-11-12T00:00:00.000Z" }), null);
  assert.equal(mergeStudentEdit(null, "campus-a1-s1", base), null);
});

test("an edit for a row outside this campus or school never merges", () => {
  const schoolA = campus("school-a", "campus-a1");
  const otherCampus = campus("school-a", "campus-a2");
  const schoolB = campus("school-b", "campus-b1");
  assert.equal(mergeStudentEdit(schoolA, "campus-a2-s1", { ...otherCampus.students[0], guardianPhone: "9" }), null);
  assert.equal(mergeStudentEdit(schoolA, "campus-b1-s1", { ...schoolB.students[0], guardianPhone: "9" }), null);
  assert.equal(mergeStudentEdit(schoolA, "campus-a1-s1", { ...schoolB.students[0], guardianPhone: "9" }), null, "a mismatched saved row is ignored");
  assert.equal(mergeTeacherEdit(schoolA, "campus-b1-t1", { id: "campus-b1-t1", phone: "9" }), null);
  assert.equal(mergeSubjectEdit(schoolA, "campus-b1-c1", "campus-b1-sub1", { totalMarks: 50 }, { id: "campus-b1-sub1", totalMarks: 50 }), null);
});

test("a teacher profile edit merges in place; a rename reloads", () => {
  const data = campus("school-a", "campus-a1");
  const saved = { id: "campus-a1-t1", fullName: "Teacher One", email: "t1@qa.test", isActive: true, profileImageUrl: null, role: "TEACHER", phone: "2", dateOfBirth: "1991-02-02T00:00:00.000Z" };
  const merged = mergeTeacherEdit(data, "campus-a1-t1", saved)!;
  const row = merged.teachers[0] as Record<string, unknown>;
  assert.equal(row.phone, "2");
  assert.ok(row.dateOfBirth instanceof Date, "a date stays a Date");
  assert.equal("role" in row, false);
  assert.equal(row.taughtSubjects, data.teachers[0].taughtSubjects);
  assert.equal(mergeTeacherEdit(data, "campus-a1-t1", { ...saved, fullName: "New Name" }), null);
});

test("a subject marks edit merges into the class and the teacher's list; renames and archives reload", () => {
  const data = campus("school-a", "campus-a1");
  const saved = { id: "campus-a1-sub1", name: "Maths", totalMarks: 50, code: "MA", isElective: false, archivedAt: null, teacherId: "campus-a1-t1", classId: "campus-a1-c1" };
  const merged = mergeSubjectEdit(data, "campus-a1-c1", "campus-a1-sub1", { totalMarks: 50 }, saved)!;
  assert.equal(merged.classes[0].subjects[0].totalMarks, 50);
  assert.equal(merged.teachers[0].taughtSubjects[0].totalMarks, 50);
  assert.equal(data.classes[0].subjects[0].totalMarks, 100);
  assert.equal(mergeSubjectEdit(data, "campus-a1-c1", "campus-a1-sub1", { name: "Mathematics" }, { ...saved, name: "Mathematics" }), null);
  assert.equal(mergeSubjectEdit(data, "campus-a1-c1", "campus-a1-sub1", { archived: true }, { ...saved, archivedAt: "2026-11-12" }), null);
  assert.equal(mergeSubjectEdit(data, "campus-a1-c1", "campus-a1-sub1", { totalMarks: 50 }, { ...saved, teacherId: null }), null);
});

test("the loader remembers what is on screen, including a local merge", async () => {
  const loader = createLatestOnlyLoader(async () => ({ v: 1 }), { onData: () => undefined, onError: () => undefined });
  assert.equal(loader.current(), null);
  await loader.run();
  assert.deepEqual(loader.current(), { v: 1 });
  loader.replace({ v: 2 });
  assert.deepEqual(loader.current(), { v: 2 });
});
