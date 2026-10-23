import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentFixture } from "./assessment-fixture";
import { DEFAULT_EXAM_CHAIN_POLICY, examChainPolicy, isExamOffice, mayApprove, moderatorFor, validModerator } from "../../src/lib/school-ai/exam-authority";
import { carryForward, intersectionCoverage, linePosition, moveLine, taughtAfterSitting, taughtOutcomeIds } from "../../src/lib/school-ai/teaching-progress";
import { deriveSlotStatus, slotKey, slotOverdue, slotReadiness, workingDaysBefore, type SlotFacts } from "../../src/lib/school-ai/paper-slot-status";
import { nextStepHref, nextStudioStep, type NextStepInput } from "../../src/lib/school-ai/next-studio-step";
import { paperDna } from "../../src/lib/school-ai/paper-dna";
import { pulseFromAttempts } from "../../src/lib/school-ai/exam-pulse";
import { deliveryPolicySchema, PLATFORM_DEFAULT_DELIVERY_POLICY } from "../../src/lib/school-ai/delivery-policy";
import { curriculumDataSchema, paperDataSchema } from "../../src/lib/school-ai/assessment";

// SKO-500 (SKO-408 slice 1): the exam chain's pure rules.

const ladder = {
  outcomes: [
    { id: "o1", title: "Cells", sourceId: "s1", sourcePage: "1", taught: false, included: true, unit: "Unit 1" },
    { id: "o2", title: "Tissues", sourceId: "s1", sourcePage: "2", taught: false, included: true, unit: "Unit 1" },
    { id: "o3", title: "Organs", sourceId: "s1", sourcePage: "5", taught: false, included: true, unit: "Unit 2" },
    { id: "ox", title: "Excluded", sourceId: "s1", sourcePage: "6", taught: false, included: false, unit: "Unit 2" },
    { id: "o4", title: "Systems", sourceId: "s1", sourcePage: "8", taught: false, included: true, unit: "Unit 3" },
  ],
};

test("the stored schemas accept older records and the new optional fields", () => {
  const { curriculum, paper } = assessmentFixture();
  assert.ok(curriculumDataSchema.parse(curriculum));
  assert.ok(paperDataSchema.parse(paper));
  assert.ok(curriculumDataSchema.parse({ ...curriculum, approvalBundle: { sourceRecordId: "src-1", sourceVersion: 2 }, outcomes: curriculum.outcomes.map(outcome => ({ ...outcome, unit: "Unit 1" })) }));
  assert.ok(paperDataSchema.parse({ ...paper, examType: "QUIZ", slotId: "slot-1" }));
  assert.equal(deliveryPolicySchema.safeParse(PLATFORM_DEFAULT_DELIVERY_POLICY).success, true, "the platform default still parses");
  assert.equal(deliveryPolicySchema.safeParse({ ...PLATFORM_DEFAULT_DELIVERY_POLICY, chain: { sealedBy: "HEAD_OF_DEPARTMENT" } }).success, true);
});

test("the effective chain policy fills every part from the platform default", () => {
  assert.deepEqual(examChainPolicy(null), DEFAULT_EXAM_CHAIN_POLICY);
  const custom = examChainPolicy({ chain: { sealedBy: "HEAD_OF_DEPARTMENT", classroomTier: { enabled: false, examTypes: ["QUIZ"], maxMarks: 20, requiresRehearsal: true, teacherApprovesSyllabus: false } } });
  assert.equal(custom.sealedBy, "HEAD_OF_DEPARTMENT");
  assert.equal(custom.classroomTier.enabled, false);
  assert.equal(custom.familyResultsGate, "AFTER_PUBLICATION");
});

test("approval: managers keep approving; heads and teachers gain bounded authority", () => {
  const policy = examChainPolicy(null);
  const teacher = { userId: "t1", role: "TEACHER", teachesRecordScope: true, headsAuthorDepartment: false };
  const head = { userId: "h1", role: "TEACHER", teachesRecordScope: false, headsAuthorDepartment: true };
  assert.deepEqual(mayApprove({ userId: "p", role: "PRINCIPAL", teachesRecordScope: false, headsAuthorDepartment: false }, { kind: "PAPER", createdById: "t1", examType: "FINAL" }, policy), { allowed: true, as: "MANAGER" });
  assert.deepEqual(mayApprove(teacher, { kind: "CURRICULUM", createdById: "t1" }, policy), { allowed: true, as: "CLASSROOM_TIER" });
  assert.deepEqual(mayApprove(teacher, { kind: "PAPER", createdById: "t1", examType: "QUIZ", totalMarks: 20 }, policy), { allowed: true, as: "CLASSROOM_TIER" });
  assert.deepEqual(mayApprove(teacher, { kind: "PAPER", createdById: "t1", totalMarks: 50 }, policy), { allowed: true, as: "CLASSROOM_TIER" }, "an untyped older paper reads as a class test");
  assert.deepEqual(mayApprove(teacher, { kind: "PAPER", createdById: "t1", examType: "CLASS_TEST", totalMarks: 60 }, policy), { allowed: false, reason: "ABOVE_CLASSROOM_CEILING" });
  assert.deepEqual(mayApprove(teacher, { kind: "PAPER", createdById: "t1", examType: "MID_TERM", totalMarks: 50 }, policy), { allowed: false, reason: "TERM_PAPER_NEEDS_SEAL_AUTHORITY" });
  assert.deepEqual(mayApprove({ ...teacher, teachesRecordScope: false }, { kind: "CURRICULUM", createdById: "t1" }, policy), { allowed: false, reason: "OUT_OF_SCOPE" });
  assert.deepEqual(mayApprove(teacher, { kind: "WORKFLOW", createdById: "t1" }, policy), { allowed: false, reason: "NOT_AN_APPROVER" });
  assert.deepEqual(mayApprove(head, { kind: "CURRICULUM", createdById: "t1" }, policy), { allowed: true, as: "HEAD_OF_DEPARTMENT" });
  assert.deepEqual(mayApprove(head, { kind: "PAPER", createdById: "t1", examType: "MID_TERM" }, policy), { allowed: false, reason: "TERM_PAPER_NEEDS_SEAL_AUTHORITY" });
  assert.deepEqual(mayApprove(head, { kind: "PAPER", createdById: "t1", examType: "MID_TERM" }, examChainPolicy({ chain: { sealedBy: "HEAD_OF_DEPARTMENT" } })), { allowed: true, as: "HEAD_OF_DEPARTMENT" });
  assert.equal(mayApprove({ ...head, userId: "t1" }, { kind: "CURRICULUM", createdById: "t1" }, examChainPolicy({ chain: { classroomTier: { enabled: false, examTypes: ["QUIZ"], maxMarks: 50, requiresRehearsal: true, teacherApprovesSyllabus: true } } })).allowed, false, "a head never approves their own record through the head path");
  assert.equal(mayApprove(teacher, { kind: "CURRICULUM", createdById: "t1" }, examChainPolicy({ chain: { classroomTier: { enabled: false, examTypes: ["QUIZ"], maxMarks: 50, requiresRehearsal: true, teacherApprovesSyllabus: true } } })).allowed, false);
});

test("the author never moderates their own paper; the office seat is office role or coordinator", () => {
  assert.equal(moderatorFor({ authorUserId: "t1", authorDepartmentHeadIds: ["h1"], academicLeadIds: ["p1"], rule: "DEPARTMENT_HEAD" }), "h1");
  assert.equal(moderatorFor({ authorUserId: "h1", authorDepartmentHeadIds: ["h1"], academicLeadIds: ["p1"], rule: "DEPARTMENT_HEAD" }), "p1");
  assert.equal(moderatorFor({ authorUserId: "p1", authorDepartmentHeadIds: [], academicLeadIds: ["p1"], rule: "DEPARTMENT_HEAD" }), null);
  assert.equal(moderatorFor({ authorUserId: "t1", authorDepartmentHeadIds: ["h1"], academicLeadIds: ["p1"], rule: "ACADEMIC_LEAD" }), "p1");
  assert.equal(validModerator("t1", "t1"), false);
  assert.equal(validModerator("t1", null), true);
  assert.equal(isExamOffice({ userId: "c1", isOfficeRole: false, examCoordinatorUserId: "c1" }), true);
  assert.equal(isExamOffice({ userId: "t1", isOfficeRole: false, examCoordinatorUserId: "c1" }), false);
});

test("the Teaching Line moves forward, back and flags a jump across units", () => {
  const forward = moveLine(ladder, [], "o3");
  assert.deepEqual(forward.write, ["o1", "o2", "o3"], "excluded outcomes are never on the line");
  assert.equal(forward.unitsCrossed, 2);
  assert.equal(forward.flagged, true);
  const rows = forward.write.map(outcomeId => ({ outcomeId, taughtOn: "2026-10-20" }));
  assert.equal(linePosition(ladder, rows), "o3");
  const back = moveLine(ladder, rows, "o1");
  assert.deepEqual(back, { write: [], remove: ["o2", "o3"], unitsCrossed: 0, flagged: false });
  assert.deepEqual(moveLine(ladder, rows, null).remove, ["o1", "o2", "o3"]);
  assert.equal(moveLine(ladder, [{ outcomeId: "o1", taughtOn: "2026-10-20" }], "o2").flagged, false);
  assert.throws(() => moveLine(ladder, [], "ox"), /TEACHING_LINE_UNKNOWN_OUTCOME/);
  const flaggedTaught = { outcomes: ladder.outcomes.map(outcome => outcome.id === "o4" ? { ...outcome, taught: true } : outcome) };
  assert.deepEqual([...taughtOutcomeIds(flaggedTaught, rows)].sort(), ["o1", "o2", "o3", "o4"], "a curriculum taught flag still counts");
});

test("a common paper is bounded by what every section has taught", () => {
  const result = intersectionCoverage([{ classId: "7A", taught: new Set(["o1", "o2", "o3"]) }, { classId: "7B", taught: new Set(["o1", "o2"]) }]);
  assert.deepEqual(result.common, ["o1", "o2"]);
  assert.deepEqual(result.ahead, [{ classId: "7A", outcomeIds: ["o3"] }]);
  assert.deepEqual(intersectionCoverage([]), { common: [], ahead: [] });
});

test("taught after the sitting, and carrying progress to a new edition", () => {
  const rows = [{ outcomeId: "o1", taughtOn: "2026-10-01" }, { outcomeId: "o2", taughtOn: "2026-11-05" }];
  assert.deepEqual(taughtAfterSitting(["o1", "o2", "o3"], ladder, rows, "2026-11-01"), ["o2", "o3"]);
  const next = { outcomes: [{ ...ladder.outcomes[0], id: "n1" }, { ...ladder.outcomes[1], id: "n2", title: "  tissues " }, { ...ladder.outcomes[2], id: "n3", code: "B3" }] };
  const prevWithCode = { outcomes: ladder.outcomes.map(outcome => outcome.id === "o3" ? { ...outcome, code: "b3" } : outcome) };
  const moved = carryForward(prevWithCode, next, [...rows, { outcomeId: "o3", taughtOn: "2026-10-10" }, { outcomeId: "o4", taughtOn: "2026-10-11" }]);
  assert.deepEqual(moved.carried.map(row => [row.fromOutcomeId, row.outcomeId]), [["o1", "n1"], ["o2", "n2"], ["o3", "n3"]]);
  assert.deepEqual(moved.unmatched, ["o4"]);
});

const facts = (over: Partial<SlotFacts> = {}): SlotFacts => ({ cancelledAt: null, dueOn: "2026-11-01", paper: null, moderation: null, seal: null, sittingDates: ["2026-11-15"], printed: false, windowOpen: false, attendanceComplete: false, marksComplete: false, published: false, ...over });

test("slot status is derived from the linked records, every word", () => {
  const paper = (status: "DRAFT" | "IN_REVIEW" | "APPROVED", itemStates: Array<"DRAFT" | "READY_FOR_REVIEW" | "APPROVED" | "NEEDS_CORRECTION">, version = 3) => ({ status, version, itemStates });
  assert.equal(deriveSlotStatus(facts()), "REQUESTED");
  assert.equal(deriveSlotStatus(facts({ paper: paper("DRAFT", ["DRAFT"]) })), "DRAFT");
  assert.equal(deriveSlotStatus(facts({ paper: paper("DRAFT", ["READY_FOR_REVIEW", "APPROVED"]) })), "READY_FOR_REVIEW");
  assert.equal(deriveSlotStatus(facts({ paper: paper("DRAFT", ["READY_FOR_REVIEW", "NEEDS_CORRECTION"]) })), "NEEDS_CORRECTION");
  assert.equal(deriveSlotStatus(facts({ paper: paper("IN_REVIEW", ["DRAFT"]) })), "READY_FOR_REVIEW");
  assert.equal(deriveSlotStatus(facts({ paper: paper("APPROVED", ["APPROVED"]) })), "APPROVED");
  assert.equal(deriveSlotStatus(facts({ paper: paper("DRAFT", ["APPROVED"]), moderation: { decision: "SIGNED", paperVersion: 3 } })), "MODERATED");
  assert.equal(deriveSlotStatus(facts({ paper: paper("DRAFT", ["APPROVED"], 4), moderation: { decision: "SIGNED", paperVersion: 3 } })), "CHANGED_AFTER_APPROVAL");
  assert.equal(deriveSlotStatus(facts({ paper: paper("DRAFT", ["APPROVED"]), moderation: { decision: "RETURNED", paperVersion: 3 } })), "NEEDS_CORRECTION");
  const sealed = { paper: paper("APPROVED", ["APPROVED"]), seal: { paperVersion: 3, sittingDate: "2026-11-15" } };
  assert.equal(deriveSlotStatus(facts(sealed)), "SEALED");
  assert.equal(deriveSlotStatus(facts({ ...sealed, printed: true })), "PRINTED");
  assert.equal(deriveSlotStatus(facts({ ...sealed, sittingDates: ["2026-11-16"] })), "STALE");
  assert.equal(deriveSlotStatus(facts({ ...sealed, paper: paper("APPROVED", ["APPROVED"], 5) })), "CHANGED_AFTER_APPROVAL");
  assert.equal(deriveSlotStatus(facts({ ...sealed, windowOpen: true })), "GATE_OPEN");
  assert.equal(deriveSlotStatus(facts({ ...sealed, attendanceComplete: true })), "SAT");
  assert.equal(deriveSlotStatus(facts({ ...sealed, marksComplete: true })), "MARKED");
  assert.equal(deriveSlotStatus(facts({ ...sealed, published: true })), "PUBLISHED");
  assert.equal(deriveSlotStatus(facts({ ...sealed, cancelledAt: "2026-10-30T00:00:00Z" })), "CANCELLED");
  assert.equal(deriveSlotStatus(facts({ paper: { status: "ARCHIVED", version: 2, itemStates: [] } })), "REQUESTED", "an archived paper no longer answers the slot");
});

test("overdue, readiness ticks, deadline arithmetic and the grade-subject key", () => {
  assert.equal(slotOverdue("DRAFT", "2026-10-20", "2026-10-21"), true);
  assert.equal(slotOverdue("READY_FOR_REVIEW", "2026-10-20", "2026-10-21"), false);
  assert.equal(slotOverdue("REQUESTED", "2026-10-21", "2026-10-21"), false);
  const ticks = slotReadiness({ authorUserId: "t1", moderatorUserId: null, deliveryKind: "ONLINE", facts: facts() });
  assert.deepEqual(ticks.map(tick => tick.tick), ["AUTHOR", "MODERATOR", "PAPER", "ITEMS_REVIEWED", "MODERATED", "SEALED"]);
  assert.equal(slotReadiness({ authorUserId: "t1", moderatorUserId: "h1", deliveryKind: "PAPER", facts: facts() }).at(-1)?.tick, "PRINTED");
  assert.equal(workingDaysBefore("2026-11-16", 1, [6, 7]), "2026-11-13", "Monday minus one working day is Friday with a Saturday-Sunday weekend");
  assert.equal(workingDaysBefore("2026-11-15", 1, [5, 6]), "2026-11-12", "Sunday minus one working day is Thursday with a Friday-Saturday weekend");
  assert.equal(workingDaysBefore("2026-11-16", 15, [6, 7]), "2026-10-26");
  assert.deepEqual(slotKey("  General   Science ", "Grade 7"), { subjectName: "general science", gradeName: "grade 7" });
});

const empty: NextStepInput = { today: "2026-10-23", saveFailed: false, blockingRehearsals: [], mySlots: [], toModerate: [], toApprove: [], itemsToReview: [], openSittings: [], releasedWithoutNextLesson: [], hasApprovedCurriculum: true };

test("the next step follows its published order", () => {
  assert.equal(nextStudioStep({ ...empty, hasApprovedCurriculum: false }).kind, "ADD_SYLLABUS");
  assert.equal(nextStudioStep(empty).kind, "CREATE_QUIZ");
  assert.equal(nextStudioStep({ ...empty, releasedWithoutNextLesson: [{ id: "e1", title: "Quiz" }] }).kind, "NEXT_LESSON");
  assert.equal(nextStudioStep({ ...empty, openSittings: [{ id: "e2", title: "Live" }], releasedWithoutNextLesson: [{ id: "e1", title: "Quiz" }] }).kind, "OPEN_SITTING");
  assert.equal(nextStudioStep({ ...empty, itemsToReview: [{ paperId: "p1", title: "Paper", count: 3 }], openSittings: [{ id: "e2", title: "Live" }] }).kind, "REVIEW_ITEMS");
  assert.equal(nextStudioStep({ ...empty, toApprove: [{ id: "c1", kind: "CURRICULUM", title: "Syllabus" }], itemsToReview: [{ paperId: "p1", title: "Paper", count: 3 }] }).count, 1);
  assert.equal(nextStudioStep({ ...empty, toModerate: [{ id: "s2", title: "Maths", dueOn: "2026-10-30" }, { id: "s1", title: "Science", dueOn: "2026-10-28" }], toApprove: [{ id: "c1", kind: "CURRICULUM", title: "Syllabus" }] }).targetId, "s1");
  const due = nextStudioStep({ ...empty, mySlots: [{ id: "s9", title: "Science", status: "DRAFT", dueOn: "2026-11-02" }], toModerate: [{ id: "s1", title: "Science", dueOn: "2026-10-28" }] });
  assert.deepEqual([due.kind, due.targetId], ["SLOT_DUE", "s9"]);
  assert.equal(nextStudioStep({ ...empty, mySlots: [{ id: "s9", title: "Science", status: "READY_FOR_REVIEW", dueOn: "2026-10-20" }] }).kind, "CREATE_QUIZ", "a submitted paper owes nothing");
  assert.equal(nextStudioStep({ ...empty, mySlots: [{ id: "s3", title: "Old", status: "REQUESTED", dueOn: "2026-10-20" }, { id: "s4", title: "New", status: "REQUESTED", dueOn: "2026-10-25" }] }).kind, "SLOT_OVERDUE");
  assert.equal(nextStudioStep({ ...empty, blockingRehearsals: [{ paperId: "p", title: "Paper" }], mySlots: [{ id: "s3", title: "Old", status: "REQUESTED", dueOn: "2026-10-20" }] }).kind, "REHEARSAL_BLOCKING");
  assert.equal(nextStudioStep({ ...empty, saveFailed: true, blockingRehearsals: [{ paperId: "p", title: "Paper" }] }).kind, "SAVE_FAILED");
  assert.equal(nextStepHref({ kind: "SLOT_DUE", targetId: "s 1", title: "x" }), "/ai/studio#space=brief&slot=s%201");
});

test("Paper DNA strands are deterministic and flag what a moderator would", () => {
  const { paper, curriculum } = assessmentFixture();
  const dna = paperDna(paper, curriculum, new Set(["outcome-1", "outcome-2"]));
  assert.equal(dna.marks.items, 5, "section A is 'answer 1 of 2', so only one of its 2-mark items counts");
  assert.equal(dna.advisories.includes("MARKS_DO_NOT_ADD_UP"), false);
  const short = paperDna({ ...paper, questions: paper.questions.filter(question => question.id !== "q3") }, curriculum, null);
  assert.ok(short.advisories.includes("MARKS_DO_NOT_ADD_UP"), "removing the 3-mark item leaves 2 of 5");
  assert.deepEqual(dna.coverage.taughtNotAssessed, ["outcome-2"]);
  assert.deepEqual(dna.coverage.assessedNotTaught, []);
  assert.equal(dna.time.estimate, true);
  assert.equal(dna.difficulty.UNSPECIFIED, 3);
  const untaught = paperDna(paper, curriculum, new Set());
  assert.ok(untaught.advisories.includes("ASSESSES_UNTAUGHT"));
  const mixed = paperDna({ ...paper, questions: [{ ...paper.questions[0], prompt: "٢ + 2 = ?" }] }, curriculum, null);
  assert.deepEqual(mixed.language.mixedNumeralItems, [1]);
  assert.ok(paperDna({ ...paper, questions: [] }, curriculum, null).advisories.includes("NO_ITEMS"));
});

test("Live Pulse reports shares and stalls without any answer text", () => {
  const questions = [{ id: "q1", sectionId: "a" }, { id: "q2", sectionId: "a" }, { id: "q3", sectionId: "b" }];
  const attempts = [
    { id: "x1", status: "IN_PROGRESS", responses: { q1: "secret answer", q2: "b" }, updatedAt: "2026-10-23T09:59:00Z", pausedAt: null },
    { id: "x2", status: "IN_PROGRESS", responses: { q2: "c", q3: " " }, updatedAt: "2026-10-23T09:50:00Z", pausedAt: null },
    { id: "x3", status: "IN_PROGRESS", responses: {}, updatedAt: "2026-10-23T09:40:00Z", pausedAt: "2026-10-23T09:41:00Z" },
    { id: "x4", status: "SUBMITTED", responses: { q1: "a" }, updatedAt: "2026-10-23T09:00:00Z", pausedAt: null },
  ];
  const pulse = pulseFromAttempts(questions, attempts, "2026-10-23T10:00:00Z");
  assert.equal(pulse.live, 3);
  assert.deepEqual(pulse.questions.map(row => [row.number, row.answered, row.skippedInferred]), [[1, 1, 1], [2, 2, 0], [3, 0, 0]]);
  assert.equal(pulse.questions[0].skippedShare, 33);
  assert.deepEqual(pulse.stalled, [{ attemptId: "x2", minutes: 10 }], "a paused attempt is not stalled; a fresh save is not stalled");
  assert.equal(JSON.stringify(pulse).includes("secret"), false, "no response text leaves the read model");
});

test("paper deadline default: 15 working days back, never already past, never on the first sitting", async () => {
  const { defaultPaperDue, workingDaysAfter } = await import("../../src/lib/school-ai/paper-slot-status");
  // Weekend Sunday only (ISO 7). First sitting Friday 2026-11-20.
  assert.equal(defaultPaperDue("2026-11-20", "2026-10-01", [7]), "2026-11-03");
  // Requested late: three working days from today instead of a past date.
  assert.equal(defaultPaperDue("2026-11-20", "2026-11-10", [7]), "2026-11-13");
  // Requested the day before: the last working day before the sitting, never after it.
  assert.equal(defaultPaperDue("2026-11-20", "2026-11-19", [7]), "2026-11-19");
  assert.equal(workingDaysAfter("2026-11-20", 5, [6, 7]), "2026-11-27");
});

test("one term list: planner spellings normalise to the stored labels", async () => {
  const { normaliseExamTerm, EXAM_TERM_LABELS } = await import("../../src/lib/academic/exam-terms");
  assert.deepEqual(["TERM_1", "term 2", "Term-3", "ANNUAL", "full year", "Term 4", ""].map(normaliseExamTerm), ["Term 1", "Term 2", "Term 3", "Annual", "Annual", null, null]);
  assert.deepEqual([...EXAM_TERM_LABELS], ["Term 1", "Term 2", "Term 3", "Annual"]);
});

test("approving a paper opens the review desk; a syllabus opens the brief space", () => {
  const base: NextStepInput = { today: "2026-10-23", saveFailed: false, blockingRehearsals: [], mySlots: [], toModerate: [], toApprove: [], itemsToReview: [], openSittings: [], releasedWithoutNextLesson: [], hasApprovedCurriculum: true };
  const paper = nextStudioStep({ ...base, toApprove: [{ id: "p", kind: "PAPER", title: "Paper" }] });
  const syllabus = nextStudioStep({ ...base, toApprove: [{ id: "c", kind: "CURRICULUM", title: "Syllabus" }] });
  assert.equal(nextStepHref(paper), "/ai/studio#space=review");
  assert.equal(nextStepHref(syllabus), "/ai/studio#space=brief");
});
