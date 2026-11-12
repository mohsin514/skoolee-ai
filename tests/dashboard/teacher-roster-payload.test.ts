import { h, groupUser, loadDashboard, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * SKAI-1857: the teacher console roster carries only the fields the console renders, each pupil's latest report card
 * comes from one DISTINCT ON read (not every card nested per pupil), and today's attendance reads by classId.
 */

const PRIVATE_FIELDS = ["medicalNotes", "allergies", "medications", "specialNeeds", "address", "dateOfBirth", "studentUser", "guardianOccupation", "previousSchool"];

function seed(campusId: string, prefix: string) {
  h.answers.set("subject.findMany", () => [{ id: `${prefix}-sub`, classId: `${prefix}-class`, class: { id: `${prefix}-class`, name: "Grade 5", section: "A", academicYear: 2026 }, _count: { marks: 0 } }]);
  h.answers.set("student.findMany", (args) => {
    assert.equal(args.where.campusId, campusId);
    return [
      { id: `${prefix}-s1`, fullName: "Pupil One", rollNo: "1", classId: `${prefix}-class`, class: { id: `${prefix}-class` } },
      { id: `${prefix}-s2`, fullName: "Pupil Two", rollNo: "2", classId: `${prefix}-class`, class: { id: `${prefix}-class` } },
    ];
  });
  h.answers.set("$queryRaw", () => [{
    studentId: `${prefix}-s1`, id: `${prefix}-rc`, percentage: 81, grade: "A", status: "PUBLISHED", deliveryStatus: "NOT_SENT",
    generatedAt: new Date("2026-10-01T00:00:00Z"), examTitle: "Mid-term", examTerm: "Term 1", examStatus: "PUBLISHED",
  }]);
  h.answers.set("attendance.findMany", () => [{ id: "a1", studentId: `${prefix}-s2`, status: "PRESENT" }]);
}

for (const [label, teacher, prefix] of [["standalone", user("TEACHER"), "a"], ["group", groupUser("TEACHER"), "b"]] as const) {
  test(`SKAI-1857: ${label} teacher roster is trimmed and scoped to its own school and campus`, async () => {
    const dashboard = await loadDashboard();
    h.session = teacher;
    seed(String(teacher.campusId), prefix);
    const data = await dashboard.getTeacherDashboardData();

    const studentRead = h.calls.find((call) => call.read === "student.findMany")!;
    for (const field of PRIVATE_FIELDS) assert.equal(field in studentRead.args.select, false, `${field} is not sent to the teacher`);
    assert.equal("reportCards" in studentRead.args.select, false, "no nested per-pupil report cards");
    assert.deepEqual(studentRead.args.where.campus, { schoolId: teacher.schoolId });

    const raw = h.calls.filter((call) => call.read === "$queryRaw");
    assert.equal(raw.length, 1, "one latest-card read for the whole roster");
    assert.match(raw[0].args.sql, /DISTINCT ON \(rc\.student_id\)/);
    assert.match(raw[0].args.sql, /rc\.school_id = \?/);
    assert.match(raw[0].args.sql, /s\.campus_id = \?/);
    assert.deepEqual(raw[0].args.values, [teacher.schoolId, teacher.campusId, [`${prefix}-class`], teacher.schoolId]);

    const attendance = h.calls.find((call) => call.read === "attendance.findMany")!;
    assert.deepEqual(attendance.args.where.classId, { in: [`${prefix}-class`] });
    assert.equal(attendance.args.where.schoolId, teacher.schoolId);
    assert.equal(attendance.args.where.campusId, teacher.campusId);
    assert.equal("student" in attendance.args.where, false);

    const [one, two] = data.students;
    assert.deepEqual(one.reportCards, [{
      id: `${prefix}-rc`, percentage: 81, grade: "A", status: "PUBLISHED", deliveryStatus: "NOT_SENT",
      generatedAt: new Date("2026-10-01T00:00:00Z"), exam: { title: "Mid-term", term: "Term 1", status: "PUBLISHED" },
    }]);
    assert.deepEqual(two.reportCards, []);
    assert.equal(two.todayAttendance, "PRESENT");
    assert.equal(data.classHubs[0]._count.students, 2);
    assert.equal(data.attendanceSummary.unmarked, 1);
  });
}

test("SKAI-1857: a failed latest-card read fails the console closed, as the nested read did", async () => {
  const dashboard = await loadDashboard();
  h.session = user("TEACHER");
  seed("campus-1", "a");
  h.failing = new Set(["$queryRaw"]);
  await assert.rejects(() => dashboard.getTeacherDashboardData());
});

test("SKAI-1857: a non-teacher is denied before any roster read", async () => {
  const dashboard = await loadDashboard();
  h.session = user("PARENT");
  seed("campus-1", "a");
  await assert.rejects(() => dashboard.getTeacherDashboardData(), /Unauthorized/);
  assert.equal(h.calls.some((call) => call.read === "student.findMany" || call.read === "$queryRaw"), false);
});
