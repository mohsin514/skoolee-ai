import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import { TEACHER_QUESTIONNAIRE, compileTeacher, nextWeekday, type TeacherPrefill } from "../../src/lib/ai-workflows/questionnaire/roles/teacher";
import { definitionForRole } from "../../src/lib/ai-workflows/questionnaire/service";
import { matchPupil, resolvePupils } from "../../src/lib/ai-workflows/resolve/pupils";
import { checkEvidence, expandPointers } from "../../src/lib/ai-workflows/planner/evidence";
import { InputRequired } from "../../src/lib/ai-workflows/errors";
import { USER_ROLES } from "../../src/lib/roles";

after(async () => { await prisma.$disconnect(); redis.disconnect(); });

const prefill = (overrides: Partial<TeacherPrefill> = {}): TeacherPrefill => ({
  today: "2026-10-26",
  profile: { preferredLanguage: null, qualification: null, experience: null, subjectSpecialties: [] },
  classTeacherOf: [{ id: "c7b", label: "7 B" }],
  subjects: [{ id: "s-math", name: "Mathematics", classId: "c7b", classLabel: "7 B", totalMarks: 100, topics: [{ id: "t1", title: "Fractions" }, { id: "t2", title: "Decimals" }] }],
  week: [1, 2, 3, 4, 5].map(day => ({ day, periods: [{ number: 1, start: "08:00", end: "08:40", busy: true }, { number: 2, start: "08:40", end: "09:20", busy: day !== 2 }] })),
  activityStaff: false,
  ...overrides,
});

test("only the signed-in role's own definition exists (RT14): each role maps to its own key or none", () => {
  const expected: Record<string, string> = { TEACHER: "teacher", ADMIN: "admin", CAMPUS_ADMIN: "campus-admin", PARENT: "parent", STUDENT: "student", ACCOUNTANT: "accountant", LIBRARIAN: "librarian", RECEPTIONIST: "receptionist" };
  for (const role of USER_ROLES) assert.equal(definitionForRole(role)?.key ?? null, expected[role] ?? null, role);
});

test("compile is deterministic and turns each answer into exactly the steps it drives", () => {
  const answers = {
    assignmentCheck: "CORRECT", preferredLanguage: "ur", focusAreas: ["REGISTER", "MEETINGS", "TESTS"],
    startingUnits: { "s-math": "t2" }, meetingHours: { slots: ["2:2"], weeks: 2 }, meetingDetails: { mode: "IN_PERSON", slotMinutes: "15", location: "Room 4", policy: "H24" },
    classTests: ["s-math"], marksEntry: "SCAN",
  };
  const first = compileTeacher(answers, prefill());
  assert.deepEqual(first, compileTeacher(answers, prefill()));
  const keys = first.map(step => step.capabilityKey);
  assert.deepEqual(keys, ["profile.update", "personal.save_plan", "work.save", "meetings.open_window", "meetings.open_window", "exams.create", "marks_scan.create_template"]);
  assert.deepEqual(first.filter(step => step.capabilityKey === "meetings.open_window").map(step => (step.input as { date: string }).date), ["2026-10-27", "2026-11-03"], "Tuesday period 2, this week and next");
  assert.equal((first.find(step => step.capabilityKey === "work.save")!.input as { steps: unknown[] }).steps.length, 1, "starts at the chosen unit");
  assert.equal((first.find(step => step.capabilityKey === "exams.create")!.input as { examType: string }).examType, "CLASS_TEST");
  const exam = first.find(step => step.capabilityKey === "exams.create")!;
  assert.deepEqual(first.find(step => step.capabilityKey === "marks_scan.create_template")!.dependsOn, [exam.stepKey], "the scan sheet waits for its saved test");
});

test("a correct assignment raises no task; a missing one asks the academic lead, never assigns", () => {
  assert.ok(!compileTeacher({ assignmentCheck: "CORRECT" }, prefill()).some(step => step.capabilityKey === "readiness.update_task"));
  const task = compileTeacher({ assignmentCheck: "MISSING" }, prefill({ classTeacherOf: [], subjects: [] }));
  assert.equal(task[0].capabilityKey, "readiness.update_task");
  assert.match(JSON.stringify(task[0].input), /none/);
});

test("a teacher with no allocations sees only the profile questions and 'Not assigned yet'", () => {
  const empty = prefill({ classTeacherOf: [], subjects: [] });
  const shown = TEACHER_QUESTIONNAIRE.questions.filter(question => !question.appliesWhen || question.appliesWhen(empty, { focusAreas: ["MEETINGS", "TESTS", "RESOURCES"] })).map(question => question.key);
  assert.deepEqual(shown, ["assignmentCheck", "preferredLanguage", "professionalGaps", "focusAreas"]);
  assert.equal(TEACHER_QUESTIONNAIRE.known(empty, "en")[0].value, "Not assigned yet");
  assert.equal(TEACHER_QUESTIONNAIRE.questions[0].initial?.(empty), "MISSING");
});

test("answers are validated against what the server offered: busy periods and foreign subjects are refused", () => {
  const hours = TEACHER_QUESTIONNAIRE.questions.find(question => question.key === "meetingHours")!;
  assert.ok(hours.answer(prefill()).safeParse({ slots: ["2:2"], weeks: 1 }).success);
  assert.ok(!hours.answer(prefill()).safeParse({ slots: ["1:1"], weeks: 1 }).success, "a busy period cannot be offered to families");
  const tests = TEACHER_QUESTIONNAIRE.questions.find(question => question.key === "classTests")!;
  assert.ok(tests.answer(prefill()).safeParse(["s-math"]).success);
  assert.ok(!tests.answer(prefill()).safeParse(["s-other"]).success, "only the teacher's own subjects");
});

test("nextWeekday counts from today inclusive", () => {
  assert.equal(nextWeekday("2026-10-26", 1), "2026-10-26");
  assert.equal(nextWeekday("2026-10-26", 5), "2026-10-30");
  assert.equal(nextWeekday("2026-10-31", 1, 1), "2026-11-09");
});

const roster = [
  { id: "p1", fullName: "Ali Raza", nameUr: "علی رضا", rollNo: "12" },
  { id: "p2", fullName: "Ali Hassan", nameUr: "علی حسن", rollNo: "13" },
  { id: "p3", fullName: "Sara Khan", nameUr: "سارہ خان", rollNo: "14" },
];

test("pupil names bind by full name, Urdu name, given name or roll number; ambiguity becomes a choice", () => {
  assert.deepEqual(matchPupil(roster, "Sara").map(pupil => pupil.id), ["p3"]);
  assert.deepEqual(matchPupil(roster, "سارہ").map(pupil => pupil.id), ["p3"]);
  assert.deepEqual(matchPupil(roster, "roll 12").map(pupil => pupil.id), ["p1"]);
  assert.deepEqual(matchPupil(roster, "Ali Raza").map(pupil => pupil.id), ["p1"]);
  assert.equal(matchPupil(roster, "Ali").length, 2);
  assert.throws(() => resolvePupils(roster, [{ pointer: "/entries/0", text: "Ali" }, { pointer: "/entries/1", text: "Zubair" }]), (error: unknown) => {
    assert.ok(error instanceof InputRequired);
    assert.deepEqual(error.fields.map(field => field.promptKey), ["PUPIL_AMBIGUOUS", "PUPIL_NOT_FOUND"]);
    assert.equal(error.fields[0].options?.length, 2);
    return true;
  });
  assert.throws(() => resolvePupils(roster, [{ pointer: "/entries/0", text: "Sara" }, { pointer: "/entries/1", text: "roll 14" }]), (error: unknown) => error instanceof InputRequired && error.fields[0].promptKey === "PUPIL_TWICE");
});

test("per-item evidence: every pupil's status needs its own quote; the whole-list quote does not count", () => {
  const input = { entries: [{ student: "Ali", status: "ABSENT", said: "Ali absent" }, { student: "Sara", status: "ABSENT", said: "Sara absent" }] };
  assert.deepEqual(expandPointers(input, ["/entries/*/said"]), ["/entries/0/said", "/entries/1/said"]);
  const segments = [{ id: "s0", normalized: "7b register: ali absent, sara absent" }];
  const one = checkEvidence(input, ["/entries/*/said"], [{ pointer: "/entries/0/said", quote: "ali absent" }], segments);
  assert.deepEqual(one.missing, ["/entries/1/said"]);
  const list = checkEvidence(input, ["/entries/*/said"], [{ pointer: "/entries", quote: "ali absent, sara absent" }], segments);
  assert.equal(list.missing.length, 2, "a claim on the whole list never stands in for each pupil");
  const both = checkEvidence(input, ["/entries/*/said"], [{ pointer: "/entries/0", quote: "ali absent" }, { pointer: "/entries/1/said", quote: "sara absent" }], segments);
  assert.deepEqual(both.missing, []);
});
