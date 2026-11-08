import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSetupWorkflowDrafts, setupFactsFingerprint, type SetupGeneratedDraft } from "../../src/lib/school-ai/setup-generation";
import { ONBOARDING_ANSWER_KEYS, parseWorkspaceData } from "../../src/lib/school-ai/schemas";
import type { OnboardingData } from "../../src/lib/school-ai/types";

const sourceRecordId = "synthetic-source-record";
const fixture = (answers: Partial<OnboardingData["answers"]> = {}): OnboardingData => ({
  path: "new",
  step: "review",
  confirmedKeys: ONBOARDING_ANSWER_KEYS.filter(key => key !== "migrationSource"),
  answers: {
    schoolName: "Synthetic Horizon Academy", country: "Pakistan", timezone: "Asia/Karachi", campuses: "Learning campus",
    grades: "Grade 8", academicYear: "2026–2027", startDate: "2026-08-01", endDate: "2027-06-30", workingDays: "Monday to Friday", firstOutcome: "complete",
    curriculum: "Grade 8 Mathematics: fractions, decimals, ratios and introductory algebra.",
    assessmentPolicy: "Monthly 20-mark assessments; 50 percent pass mark; teacher reviews every question.",
    resources: "Two classrooms and one science lab; eight 40-minute periods from 08:00.",
    staff: "Two mathematics teachers available Monday to Friday.",
    feePolicy: "Monthly tuition PKR 5000 per student; due on day 10.",
    students: "One Grade 8 section with 24 students; roster import will follow.",
    communications: "Principal reviews school updates before families receive them.",
    ...answers,
  },
});
const generate = (data = fixture(), language: "en" | "ar" | "ur" = "en") => buildSetupWorkflowDrafts(data, language, sourceRecordId, 7);
const workflow = (drafts: SetupGeneratedDraft[], key: string) => {
  const draft = drafts.find(item => item.key === key);
  assert.ok(draft, key);
  assert.equal(draft.kind, "WORKFLOW");
  if (draft.kind !== "WORKFLOW") throw new Error(`Expected workflow: ${key}`);
  return draft.data;
};
const academic = (drafts: SetupGeneratedDraft[]) => {
  const proposal = workflow(drafts, "academic-setup").proposal;
  assert.ok(proposal);
  assert.equal(proposal.operation, "academics.setup_year");
  if (proposal.operation !== "academics.setup_year") throw new Error("Expected academic proposal");
  return proposal;
};
const weekdays = { mondayClosed: false, tuesdayClosed: false, wednesdayClosed: false, thursdayClosed: false, fridayClosed: false, saturdayClosed: true, sundayClosed: true };

test("confirmed school facts produce schema-valid drafts with prefilled academic review", () => {
  const data = fixture();
  const before = structuredClone(data);
  const drafts = generate(data);
  assert.equal(drafts.length, 9);
  assert.deepEqual(data, before, "building drafts must not mutate saved answers");
  for (const draft of drafts) {
    assert.doesNotThrow(() => parseWorkspaceData(draft.kind, draft.data), draft.key);
    const visibleText = draft.kind === "WORKFLOW" ? draft.data.goal : draft.data.instructions;
    assert.equal(visibleText.includes(sourceRecordId), false, "record IDs stay out of user-facing prose");
    assert.match(visibleText, /v7/);
    if (draft.kind === "WORKFLOW") assert.deepEqual(draft.data.sourceIds, []);
  }
  const setup = workflow(drafts, "academic-setup");
  assert.deepEqual(setup.missingInformation, []);
  assert.ok(setup.steps.every(step => step.status === "proposed"));
  assert.match(setup.goal, /SUBJECT is a draft suggestion/);
  assert.deepEqual(academic(drafts).classes.map(({ name, section, teachingMode }) => ({ name, section, teachingMode })), [{ name: "Grade 8", section: null, teachingMode: "SUBJECT" }]);
});

test("academic labels accept one year or the next year and reject unrelated year ranges", () => {
  for (const label of ["2026", "2026-2027", "2026–27", "2026 / 2027"]) {
    const proposal = academic(generate(fixture({ academicYear: label })));
    assert.equal(proposal.academicYear, 2026, label);
    assert.equal(proposal.startDate, "2026-08-01", label);
    assert.equal(proposal.endDate, "2027-06-30", label);
  }
  for (const label of ["2026-2039", "2026-2026", "2026–25", "school year 2026", "2026-2027-2028"]) {
    const setup = workflow(generate(fixture({ academicYear: label })), "academic-setup");
    assert.equal(setup.proposal, undefined, label);
    assert.ok(setup.missingInformation.length > 0, label);
    assert.ok(setup.steps.every(step => step.status === "blocked"), label);
  }
});

test("dates outside the selected year or invalid dates remain unresolved", () => {
  for (const dates of [
    { startDate: "2038-08-01", endDate: "2039-06-30" },
    { startDate: "2026-08-01", endDate: "2026-07-01" },
    { startDate: "2026-02-30", endDate: "2027-06-30" },
  ]) {
    const drafts = generate(fixture(dates));
    assert.equal(academic(drafts).startDate, null);
    assert.equal(academic(drafts).endDate, null);
    assert.ok(workflow(drafts, "academic-setup").missingInformation.length > 0);
  }
});

test("explicit grades, ranges and sections become classes but prose and duplicates do not", () => {
  assert.deepEqual(academic(generate(fixture({ grades: "Grades 1–3" }))).classes.map(item => item.name), ["Grade 1", "Grade 2", "Grade 3"]);
  assert.deepEqual(academic(generate(fixture({ grades: "Grade 8 A, Grade 8 section B" }))).classes.map(item => [item.name, item.section]), [["Grade 8", "A"], ["Grade 8", "B"]]);
  for (const grades of ["we teach primary", "Grade 8 and maybe Grade 9", "Grades 8–3", "Grades 1–14", "Grade 8 A, grade 8 a"]) {
    const setup = workflow(generate(fixture({ grades })), "academic-setup");
    assert.equal(setup.proposal, undefined, grades);
    assert.ok(setup.missingInformation.length > 0, grades);
  }
});

test("only exact working-day ranges and lists produce closed-day settings", () => {
  for (const workingDays of ["Monday–Friday", "Mon, Tue, Wed, Thu, Fri", "Monday through Friday"]) {
    const calendar = workflow(generate(fixture({ workingDays })), "working-days");
    assert.deepEqual(calendar.missingInformation, [], workingDays);
    const proposal = calendar.proposal;
    assert.ok(proposal?.operation === "setup.apply_changes" && proposal.action === "WEEKENDS", workingDays);
    assert.deepEqual(proposal.rows, [weekdays], workingDays);
    assert.match(proposal.sourceReference, /synthetic-source-record · v7/);
  }
  for (const workingDays of ["weekdays", "Monday to Friday except holidays", "Monday–Sunday", "Mon, Tue, Wed, Thu, Fri, Sat, Sun"]) {
    const calendar = workflow(generate(fixture({ workingDays })), "working-days");
    assert.equal(calendar.proposal, undefined, workingDays);
    assert.ok(calendar.missingInformation.length > 0, workingDays);
  }
});

test("explicit nonoverlapping 24-hour teaching windows become period drafts", () => {
  const drafts = generate(fixture({ resources: "Teaching periods: 08:00–08:40, 08:40–09:20, 09:30–10:10." }));
  const periods = workflow(drafts, "teaching-periods");
  const proposal = periods.proposal;
  assert.ok(proposal?.operation === "setup.apply_changes" && proposal.action === "PERIODS");
  assert.deepEqual(proposal.rows, [
    { timeType: "CLASS", periodNumber: 1, startTime: "08:00", endTime: "08:40" },
    { timeType: "CLASS", periodNumber: 2, startTime: "08:40", endTime: "09:20" },
    { timeType: "CLASS", periodNumber: 3, startTime: "09:30", endTime: "10:10" },
  ]);
  assert.deepEqual(periods.missingInformation, []);
  assert.doesNotThrow(() => parseWorkspaceData("WORKFLOW", periods));
  assert.ok(workflow(drafts, "timetable-preparation").missingInformation.length > 0, "period times alone cannot establish a clash-free timetable");
});

test("ambiguous, mixed-use and overlapping times never produce teaching periods", () => {
  for (const resources of [
    "Eight 40-minute periods from 08:00.",
    "Periods: 8:00–8:40.",
    "Periods: 08:00–08:40 PM.",
    "Periods: 08:00–08:40; break 08:40–09:00.",
    "Exam periods: 08:00–08:40.",
    "Periods: 08:00–08:40, 08:30–09:10.",
    "Periods: 09:00–08:40.",
    "Periods: 08:00–08:00.",
    "Periods: 08:00–08:40; dismissal 12:00.",
    "Rooms available 08:00–08:40.",
  ]) assert.equal(generate(fixture({ resources })).some(item => item.key === "teaching-periods"), false, resources);
});

test("skipped and unconfirmed answers retain blockers even when a proposal can be parsed", () => {
  const skipped = fixture({ grades: "", workingDays: "" });
  for (const key of ["academic-setup", "working-days"]) {
    const draft = workflow(generate(skipped), key);
    assert.equal(draft.proposal, undefined);
    assert.ok(draft.missingInformation.some(item => item.startsWith("Provide and confirm:")));
    assert.ok(draft.steps.every(step => step.status === "blocked"));
  }
  const unconfirmed = fixture({ resources: "Periods: 08:00–08:40." });
  unconfirmed.confirmedKeys = unconfirmed.confirmedKeys.filter(key => !["grades", "workingDays", "resources"].includes(key));
  for (const key of ["academic-setup", "working-days", "teaching-periods"]) {
    const draft = workflow(generate(unconfirmed), key);
    assert.ok(draft.proposal, key);
    assert.ok(draft.missingInformation.some(item => item.startsWith("Review and confirm:")), key);
    assert.ok(draft.steps.every(step => step.status === "blocked"), key);
  }
});

test("policy drafts preserve supplied amounts and assessment structure with approval required", () => {
  const data = fixture({
    feePolicy: "Monthly tuition PKR 5000 per student; due on day 10.\nSibling concession: 10%; no late fee.",
    assessmentPolicy: "Monthly 20-mark assessment: 10 MCQs × 1 mark and 2 written answers × 5 marks. Pass mark: 50%.",
  });
  for (const [key, field, scope] of [["fee-policy", "feePolicy", "finance"], ["assessment-policy", "assessmentPolicy", "academics"]] as const) {
    const draft = generate(data).find(item => item.key === key);
    assert.ok(draft?.kind === "POLICY");
    assert.ok(draft.data.instructions.includes(data.answers[field]!));
    assert.equal(draft.data.scope, scope);
    assert.equal(draft.data.requiresApproval, true);
    assert.equal(draft.data.mode, "approval_required");
  }
});

test("localized headings and normalized grade/year digits preserve the same typed settings", () => {
  const titles = new Set<string>();
  for (const [language, grades, academicYear, workingDays] of [
    ["en", "Grade ８", "２０２６–２０２７", "Monday–Friday"],
    ["ar", "الصف ٨", "٢٠٢٦–٢٠٢٧", "الاثنين إلى الجمعة"],
    ["ur", "جماعت ۸", "۲۰۲۶–۲۷", "پیر تا جمعہ"],
  ] as const) {
    const drafts = generate(fixture({ grades, academicYear, workingDays }), language);
    titles.add(drafts[0].title);
    assert.equal(academic(drafts).academicYear, 2026, language);
    assert.match(academic(drafts).classes[0].name, /8$/);
    const calendar = workflow(drafts, "working-days").proposal;
    assert.ok(calendar?.operation === "setup.apply_changes" && calendar.action === "WEEKENDS");
    assert.deepEqual(calendar.rows, [weekdays]);
    for (const draft of drafts) assert.doesNotThrow(() => parseWorkspaceData(draft.kind, draft.data), `${language}: ${draft.key}`);
  }
  assert.equal(titles.size, 3);
});

test("fact fingerprints ignore navigation and ordering but include confirmations and changed answers", () => {
  const data = fixture();
  const reordered = { ...data, step: "profile" as const, currentQuestion: "schoolName" as const, answers: Object.fromEntries(Object.entries(data.answers).reverse().map(([key, value]) => [key, ` ${value} `])), confirmedKeys: [...data.confirmedKeys].reverse() };
  assert.equal(setupFactsFingerprint(data), setupFactsFingerprint(reordered));
  assert.notEqual(setupFactsFingerprint(data), setupFactsFingerprint({ ...data, confirmedKeys: data.confirmedKeys.filter(key => key !== "grades") }));
  assert.notEqual(setupFactsFingerprint(data), setupFactsFingerprint(fixture({ feePolicy: "Monthly PKR 6000." })));
});
