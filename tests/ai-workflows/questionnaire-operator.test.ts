import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import { ADMIN_QUESTIONNAIRE, compileOperator, type OperatorPrefill } from "../../src/lib/ai-workflows/questionnaire/roles/operator";

after(async () => { await prisma.$disconnect(); redis.disconnect(); });

const prefill = (overrides: Partial<OperatorPrefill> = {}): OperatorPrefill => ({
  campusName: "Main", country: "PK", currency: "PKR", standalone: true, canInviteStaff: true, seats: { principal: false, accountant: false },
  cycle: { id: "cycle-1", label: "2026-27", academicYear: 2026, status: "ACTIVE", startDate: "2026-04-01", endDate: "2027-03-31" },
  existing: { classes: [], subjects: 0, rooms: 0, periods: 0, pendingInvites: 0 }, weekend: [0], ...overrides,
});
const base = { gradeLadder: { G1: 2, G6: 1 }, teachingMode: { PRIMARY: "SINGLE", MIDDLE: "SUBJECT" }, subjectsByGrade: { PRIMARY: ["English", "Mathematics"], MIDDLE: ["Science"] } };

test("classes reuse the wizard's year and subjects wait for them; the year is never asked", () => {
  const steps = compileOperator(base, prefill());
  const classes = steps.filter(step => step.capabilityKey === "academics.setup_year");
  assert.equal(classes.length, 1);
  const input = classes[0].input as { existingCycleId: string; classes: Array<{ name: string; section: string; teachingMode: string }> };
  assert.equal(input.existingCycleId, "cycle-1");
  assert.deepEqual(input.classes.map(row => `${row.name}${row.section}:${row.teachingMode}`), ["Grade 1A:SINGLE", "Grade 1B:SINGLE", "Grade 6A:SUBJECT"]);
  const subjects = steps.filter(step => step.capabilityKey === "setup.subjects_by_class");
  assert.deepEqual(subjects[0].dependsOn, [classes[0].stepKey]);
  assert.equal((subjects[0].input as { rows: unknown[] }).rows.length, 5, "2 sections × 2 subjects + 1 × 1");
  assert.ok(!ADMIN_QUESTIONNAIRE.questions.some(question => /year|session/i.test(question.key)), "the academic year is never re-asked");
});

test("large campuses are chunked within each operation's row cap", () => {
  const ladder = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`G${index + 1}`, 8]));
  const steps = compileOperator({ gradeLadder: ladder, subjectsByGrade: { PRIMARY: ["A1", "B1", "C1", "D1", "E1", "F1", "G1"], MIDDLE: ["A1", "B1", "C1", "D1", "E1", "F1", "G1"], SENIOR: ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"] } }, prefill());
  const classes = steps.filter(step => step.capabilityKey === "academics.setup_year");
  assert.equal(classes.reduce((sum, step) => sum + (step.input as { classes: unknown[] }).classes.length, 0), 96);
  assert.ok(classes.every(step => (step.input as { classes: unknown[] }).classes.length <= 50));
  const subjects = steps.filter(step => step.capabilityKey === "setup.subjects_by_class");
  assert.ok(subjects.every(step => (step.input as { rows: unknown[] }).rows.length <= 30));
  assert.equal(subjects.reduce((sum, step) => sum + (step.input as { rows: unknown[] }).rows.length, 0), 40 * 7 + 24 * 7 + 32 * 8);
});

test("the day shape becomes non-overlapping periods with the break in place", () => {
  const steps = compileOperator({ ...base, dayShape: { start: "08:00", periods: 4, minutes: 40, breakAfter: 2, breakMinutes: 20 } }, prefill());
  const rows = (steps.find(step => step.capabilityKey === "setup.periods")!.input as { rows: Array<{ startTime: string; endTime: string }> }).rows;
  assert.deepEqual(rows.map(row => `${row.startTime}-${row.endTime}`), ["08:00-08:40", "08:40-09:20", "09:40-10:20", "10:20-11:00"]);
});

test("staff become pending invitations only from complete rows; duplicates collapse", () => {
  const steps = compileOperator({ ...base, staffRoster: [{ fullName: "Ayesha Khan", email: "ayesha@x.pk", role: "TEACHER" }, { fullName: "Ayesha Khan", email: "AYESHA@x.pk", role: "TEACHER" }, { fullName: "Half typed" }, { fullName: "Bad", email: "x", role: "TEACHER" }] }, prefill());
  const staff = steps.filter(step => step.capabilityKey === "setup.staff_invitations");
  assert.equal((staff[0].input as { rows: unknown[] }).rows.length, 1);
  assert.ok(!compileOperator({ ...base, staffRoster: [{ fullName: "Ayesha Khan", email: "ayesha@x.pk", role: "TEACHER" }] }, prefill({ canInviteStaff: false })).some(step => step.capabilityKey === "setup.staff_invitations"), "only membership managers prepare invitations");
});

test("fees compile only while the admin holds the finance desk, tied together by names", () => {
  const answers = { ...base, feePlan: { monthly_PRIMARY: 4500, admission: 10000, siblingPercent: 10 } };
  const withDesk = compileOperator(answers, prefill());
  const keys = withDesk.map(step => step.capabilityKey);
  assert.ok(keys.includes("fees.create_fee_group") && keys.includes("fees.create_master_line") && keys.includes("fees.assign_fee_group") && keys.includes("fees.create_discount"));
  const line = withDesk.find(step => step.capabilityKey === "fees.create_master_line" && (step.input as { amount: number }).amount === 4500)!;
  assert.deepEqual(line.input, { group: "Primary (1–5) fees", feeType: "Tuition fee", amount: 4500 });
  const assign = withDesk.find(step => step.capabilityKey === "fees.assign_fee_group")!;
  assert.deepEqual((assign.input as { grades: string[] }).grades, ["Grade 1"]);
  assert.ok(!compileOperator(answers, prefill({ seats: { principal: false, accountant: true } })).some(step => step.capabilityKey.startsWith("fees.")), "an accountant in post owns fees");
  const feeQuestion = ADMIN_QUESTIONNAIRE.questions.find(question => question.key === "feePlan")!;
  assert.equal(feeQuestion.appliesWhen!(prefill({ seats: { principal: false, accountant: true } }), base), false);
});

test("without a year nothing is created against a missing cycle; activation goes to the principal when one is in post", () => {
  assert.ok(!compileOperator(base, prefill({ cycle: null })).some(step => step.capabilityKey === "academics.setup_year" || step.capabilityKey === "setup.subjects_by_class"));
  const draft = prefill({ cycle: { id: "c", label: "2026-27", academicYear: 2026, status: "DRAFT", startDate: null, endDate: null }, seats: { principal: true, accountant: false } });
  const task = ADMIN_QUESTIONNAIRE.remains(base, draft).find(item => item.title.en.startsWith("Activate"))!;
  assert.equal(task.who.en, "Your principal");
});

test("existing sections are kept and new ones take the next free letters; the cycle's own dates are passed back", () => {
  const steps = compileOperator({ gradeLadder: { G7: 2 }, teachingMode: { MIDDLE: "SUBJECT" } }, prefill({ existing: { classes: [{ name: "Grade 7", section: "B", teachingMode: "SINGLE" }], subjects: 0, rooms: 0, periods: 0, pendingInvites: 0 } }));
  const input = steps[0].input as { startDate: string; endDate: string; classes: Array<{ section: string; teachingMode: string }> };
  assert.deepEqual(input.classes.map(row => `${row.section}:${row.teachingMode}`), ["B:SINGLE", "A:SUBJECT"], "an existing class keeps its own mode");
  assert.deepEqual([input.startDate, input.endDate], ["2026-04-01", "2027-03-31"]);
});
