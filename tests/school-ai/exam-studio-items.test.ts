/**
 * Item review state, the transition rules and dependency staleness — unit coverage for
 * `src/lib/school-ai/item-review.ts` (SKO-408, Requirements 4 and 6).
 *
 * Two property tests are appended to this file by their own tasks:
 *   - Property 16: Item review state is derived from the item alone (R4.1–R4.6)
 *   - Property 17: A form with any unapproved item cannot be released (R4.10, R7.4)
 * The seeded generators and the helpers below are written to be reused by both, so each property
 * test adds its `forEachSeed` sweep and nothing else. Property 15 (transitive staleness) lives in
 * `exam-studio-staleness.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ITEM_FACETS,
  ITEM_FACET_EFFECTS,
  ITEM_FACET_FOR_FIELD,
  ITEM_REVIEW_STATES,
  ITEM_REVIEW_TRANSITIONS,
  applyItemEdit,
  applyStaleness,
  canRelease,
  itemFacetsChanged,
  itemReviewSchema,
  itemReviewTransition,
  itemStateCounts,
  itemStateFor,
  releaseBlockers,
  stalenessChangeSchema,
  stalenessNotices,
  type ItemReview,
  type ItemReviewState,
  type StalenessChange,
} from "../../src/lib/school-ai/item-review";
import { paperDataSchema, validatePaperApproval, type PaperData, type Question } from "../../src/lib/school-ai/assessment";
import { canonicalJson } from "../../src/lib/school-ai/canonical";
import { assessmentFixture } from "./assessment-fixture";
import { arbitraryPaper, xorshift } from "./exam-studio-generators";

/* ------------------------------------------------------------------ shared helpers */

const AUTHOR = "actor-author";
const APPROVER = "actor-approver";
const AT = "2026-05-01T08:00:00.000Z";
const LATER = "2026-05-01T09:30:00.000Z";

/** A review record in a stated state, approved at its own item revision so the paper validator agrees. */
export function review(state: ItemReviewState, itemRevision = 1): ItemReview {
  return {
    state,
    itemRevision,
    ...(state === "APPROVED" ? { approvedBy: { actorId: APPROVER, at: AT, itemRevision } } : {}),
    invalidated: [],
    history: [{ state, actorId: state === "APPROVED" ? APPROVER : AUTHOR, at: AT }],
  };
}

/** The paper with a review record on every item, or on the named items only. */
export function withReviews(paper: PaperData, state: ItemReviewState, questionIds?: readonly string[]): PaperData {
  return {
    ...paper,
    questions: paper.questions.map(question => (questionIds && !questionIds.includes(question.id) ? question : { ...question, review: review(state) })),
  };
}

/** Deep-frozen, so any assignment through the argument throws instead of passing silently. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") for (const inner of Object.values(value)) deepFreeze(inner);
  return Object.freeze(value);
}

const contentChange = (questionId: string, facet: (typeof ITEM_FACETS)[number], actorId = AUTHOR, at = LATER): StalenessChange =>
  stalenessChangeSchema.parse({ kind: "ITEM_CONTENT", questionId, facet, actorId, at });

const entriesFor = (paper: PaperData, questionId: string) => paper.questions.find(question => question.id === questionId)?.review?.invalidated ?? [];
const artifactsFor = (paper: PaperData, questionId: string) => entriesFor(paper, questionId).map(entry => entry.artifact).sort();
const stateOf = (paper: PaperData, questionId: string) => itemStateFor(paper.questions.find(question => question.id === questionId)!);

/* ------------------------------------------------------------------ R4.1, R4.2: state resolution */

test("an absent review is DRAFT, and an item citing no source is NEEDS_SOURCE whatever is recorded", () => {
  const { paper } = assessmentFixture();
  const [first] = paper.questions;
  assert.equal(itemStateFor(first), "DRAFT");
  for (const state of ITEM_REVIEW_STATES) assert.equal(itemStateFor({ ...first, review: review(state) }), state);
  // No cited evidence is structurally NEEDS_SOURCE: a stale APPROVED record cannot outrank it (R4.2).
  assert.equal(itemStateFor({ ...first, sourceRefs: [] }), "NEEDS_SOURCE");
  assert.equal(itemStateFor({ ...first, sourceRefs: [], review: review("APPROVED") }), "NEEDS_SOURCE");
  // The state is a property of the item alone: nothing but the item is read.
  assert.equal(itemStateFor({ ...first, review: review("READY_FOR_REVIEW") }), "READY_FOR_REVIEW");
});

test("the per-state counts cover every state and every item of the form (R4.9)", () => {
  const generated = arbitraryPaper(xorshift(0x1f2e3d4c), { edgeCase: "HUNDRED_ITEM_PAPER" });
  const paper = withReviews(generated.paper, "APPROVED", generated.paper.questions.slice(0, 40).map(question => question.id));
  const counts = itemStateCounts(paper);
  assert.deepEqual(Object.keys(counts).sort(), [...ITEM_REVIEW_STATES].sort());
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), paper.questions.length);
  assert.equal(counts.APPROVED, 40);
  assert.equal(counts.DRAFT, paper.questions.length - 40);
  assert.equal(counts.CHANGED_AFTER_APPROVAL, 0);
});

/* ------------------------------------------------------------------ R4.3, R4.4, R4.5: transitions */

test("APPROVED is reachable only from READY_FOR_REVIEW, and CHANGED_AFTER_APPROVAL only from an edit", () => {
  for (const [from, targets] of Object.entries(ITEM_REVIEW_TRANSITIONS)) {
    assert.ok(!targets.includes(from as ItemReviewState), `${from} must not list itself as a target`);
    assert.ok(!targets.includes("CHANGED_AFTER_APPROVAL"), `${from} must not be able to request CHANGED_AFTER_APPROVAL`);
    if (from !== "READY_FOR_REVIEW") assert.ok(!targets.includes("APPROVED"), `${from} must not be able to request APPROVED`);
  }
  assert.deepEqual([...ITEM_REVIEW_TRANSITIONS.READY_FOR_REVIEW].filter(state => state === "APPROVED"), ["APPROVED"]);

  const { paper } = assessmentFixture();
  const ready = { ...paper.questions[0], review: review("READY_FOR_REVIEW") };
  // Every requested target is decided by the table, over the whole state × state cross-product.
  for (const from of ITEM_REVIEW_STATES) {
    for (const target of ITEM_REVIEW_STATES) {
      const decision = itemReviewTransition({ ...paper.questions[0], review: review(from) }, { target, actorId: APPROVER, at: LATER, itemRevision: 1 });
      assert.equal(decision.allowed, ITEM_REVIEW_TRANSITIONS[from].includes(target), `${from} -> ${target}`);
    }
  }
  assert.equal(itemReviewTransition(ready, { target: "CHANGED_AFTER_APPROVAL", actorId: APPROVER, at: LATER }).allowed, false);
});

test("an approval records the actor, the authoritative timestamp and the approved item revision (R4.5)", () => {
  const { paper } = assessmentFixture();
  const question = { ...paper.questions[0], review: review("READY_FOR_REVIEW", 4) };
  const decision = itemReviewTransition(question, { target: "APPROVED", actorId: APPROVER, at: LATER, itemRevision: 4, note: "Checked against the syllabus." });
  assert.ok(decision.allowed);
  assert.deepEqual(decision.review.approvedBy, { actorId: APPROVER, at: LATER, itemRevision: 4 });
  assert.equal(decision.review.itemRevision, 4);
  assert.deepEqual(decision.review.history.at(-1), { state: "APPROVED", actorId: APPROVER, at: LATER, note: "Checked against the syllabus." });
  itemReviewSchema.parse(decision.review);
  // The paper validator reads the approval back and agrees it belongs to this item revision.
  assert.deepEqual(validatePaperApproval({ ...paper, questions: paper.questions.map(item => ({ ...item, review: decision.review })) }, assessmentFixture().curriculum), []);
});

test("an approval is refused without a stated item revision, at the wrong revision, or over an unresolved check", () => {
  const { paper } = assessmentFixture();
  const ready = { ...paper.questions[0], review: review("READY_FOR_REVIEW", 3) };
  const refusals = [
    [itemReviewTransition(ready, { target: "APPROVED", actorId: APPROVER, at: LATER }), "ITEM_REVISION_MISMATCH"],
    [itemReviewTransition(ready, { target: "APPROVED", actorId: APPROVER, at: LATER, itemRevision: 2 }), "ITEM_REVISION_MISMATCH"],
    [itemReviewTransition(ready, { target: "APPROVED", actorId: APPROVER, at: LATER, itemRevision: 3, unresolved: ["The rubric does not total the question marks."] }), "UNRESOLVED_OBSERVATIONS"],
    [itemReviewTransition({ ...paper.questions[0], review: review("APPROVED") }, { target: "READY_FOR_REVIEW", actorId: AUTHOR, at: LATER, itemRevision: 1 }), "UNREACHABLE_STATE"],
    // An item whose evidence was removed reads NEEDS_SOURCE, from which marking complete is a
    // reachable request — and is refused on the evidence itself rather than on the table.
    [itemReviewTransition({ ...ready, sourceRefs: [] }, { target: "READY_FOR_REVIEW", actorId: AUTHOR, at: LATER }), "MISSING_SOURCE_EVIDENCE"],
    [itemReviewTransition({ ...paper.questions[0], sourceRefs: [], review: review("NEEDS_SOURCE") }, { target: "READY_FOR_REVIEW", actorId: AUTHOR, at: LATER }), "MISSING_SOURCE_EVIDENCE"],
  ] as const;
  for (const [decision, refusal] of refusals) {
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.refusal, refusal);
  }
  // An invalidated check is itself unresolved, so a stale item cannot be re-approved without a re-review.
  const stale = applyStaleness(withReviews(paper, "APPROVED"), contentChange("q1", "PROMPT"));
  const changed = stale.questions[0];
  const blocked = itemReviewTransition(changed, { target: "READY_FOR_REVIEW", actorId: AUTHOR, at: LATER, itemRevision: changed.review?.itemRevision });
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.refusal, "UNRESOLVED_OBSERVATIONS");
  // Marking it complete after the correction clears the recorded invalidations against this revision.
  const corrected = itemReviewTransition({ ...changed, review: { ...changed.review!, invalidated: [] } }, { target: "READY_FOR_REVIEW", actorId: AUTHOR, at: LATER, itemRevision: 2 });
  assert.ok(corrected.allowed);
  assert.deepEqual(corrected.review.invalidated, []);
});

/* ------------------------------------------------------------------ R4.6, R6.1, R6.2: item edits */

test("every field R4.6 names maps to a facet, and a change to it invalidates that facet's artifacts", () => {
  const { paper } = assessmentFixture();
  const approved = withReviews(paper, "APPROVED");
  for (const facet of ITEM_FACETS) {
    const next = applyStaleness(approved, contentChange("q1", facet));
    assert.equal(stateOf(next, "q1"), "CHANGED_AFTER_APPROVAL", facet);
    assert.deepEqual(artifactsFor(next, "q1"), [...ITEM_FACET_EFFECTS[facet].artifacts].sort(), facet);
    assert.equal(next.questions[0].review?.itemRevision, 2, facet);
    // The other items of the form are untouched, by reference.
    assert.strictEqual(next.questions[1], approved.questions[1], facet);
    itemReviewSchema.parse(next.questions[0].review);
    paperDataSchema.parse(next);
  }
  // R6.1 and R6.2 named explicitly, so the graph cannot be loosened without this failing.
  for (const facet of ["PROMPT", "OPTIONS", "MARKS"] as const) {
    assert.deepEqual([...ITEM_FACET_EFFECTS[facet].artifacts].sort(), ["ITEM_APPROVAL", "KEY", "RUBRIC", "SEMANTIC_REVIEW"]);
  }
  assert.deepEqual([...ITEM_FACET_EFFECTS.FIGURES.artifacts].sort(), ["FIGURE_CHECK", "ITEM_APPROVAL"]);
});

test("a changed item field is detected from the two item versions, and one edit is one item revision", () => {
  const { paper } = assessmentFixture();
  const approved = withReviews(paper, "APPROVED");
  const [previous] = approved.questions;
  const edits: ReadonlyArray<readonly [keyof typeof ITEM_FACET_FOR_FIELD, Partial<Question>]> = [
    ["prompt", { prompt: "What is 2 + 2, exactly?" }],
    ["modelAnswer", { modelAnswer: "Four, because addition combines the quantities." }],
    ["options", { options: [{ id: "a1", text: "4" }, { id: "a2", text: "6" }] }],
    ["correctOptionId", { correctOptionId: "a2" }],
    ["numericKey", { numericKey: { value: 4, tolerance: 0 } }],
    ["marks", { marks: 3 }],
    ["rubric", { rubric: [{ id: "r1", criterion: "Correct choice", marks: 3 }] }],
    ["figures", { figures: [{ id: "f1", sourceId: "source-1", sourceVersion: 1, page: 1, regionId: "region-1", sha256: "a".repeat(64), width: 32, height: 32, png: "aGVsbG8=", alt: "A number line.", caption: "A number line", approved: true }] }],
    ["outcomeIds", { outcomeIds: [] }],
    ["sourceRefs", { sourceRefs: [{ sourceId: "source-2", page: "2", excerpt: "Addition combines numbers." }] }],
  ];
  for (const [field, patch] of edits) {
    const next = { ...previous, ...patch } as Question;
    assert.deepEqual(itemFacetsChanged(previous, next), [ITEM_FACET_FOR_FIELD[field]], field);
    const after = applyItemEdit(approved, previous, next, { actorId: AUTHOR, at: LATER });
    assert.equal(stateOf(after, "q1"), "CHANGED_AFTER_APPROVAL", field);
    assert.equal(after.questions[0].review?.itemRevision, 2, field);
  }
  // Several facets in one edit stay one revision and one history entry, with every artifact recorded.
  const multi = { ...previous, prompt: "Add two and two.", marks: 3, rubric: [{ id: "r1", criterion: "Correct choice", marks: 3 }], figures: [] } as Question;
  assert.deepEqual(itemFacetsChanged(previous, multi), ["PROMPT", "MARKS", "FIGURES"]);
  const after = applyItemEdit(approved, previous, multi, { actorId: AUTHOR, at: LATER });
  assert.equal(after.questions[0].review?.itemRevision, 2);
  assert.equal(after.questions[0].review?.history.length, (approved.questions[0].review?.history.length ?? 0) + 1);
  assert.deepEqual([...new Set(artifactsFor(after, "q1"))], ["FIGURE_CHECK", "ITEM_APPROVAL", "KEY", "RUBRIC", "SEMANTIC_REVIEW"]);
  // One entry per (artifact, trigger): the key was invalidated by the prompt change and by the marks
  // change, and R6.8 names both triggers rather than collapsing them into one.
  const pairs = entriesFor(after, "q1").map(entry => `${entry.artifact}:${entry.trigger}`);
  assert.equal(new Set(pairs).size, pairs.length);
  assert.deepEqual(pairs.filter(pair => pair.startsWith("KEY:")).sort(), ["KEY:MARKS", "KEY:PROMPT"]);
  assert.deepEqual(itemFacetsChanged(previous, { ...previous, locked: !previous.locked }), []);
  itemReviewSchema.parse(after.questions[0].review);
});

/* ------------------------------------------------------------------ R6.3, R6.4: sources and coverage */

test("a superseded source version sends every item citing it to NEEDS_SOURCE, and leaves the rest alone (R6.3)", () => {
  const { paper } = assessmentFixture();
  const approved = withReviews({
    ...paper,
    questions: paper.questions.map(question => (question.id === "q3" ? { ...question, sourceRefs: [{ sourceId: "source-2", page: "1", excerpt: "Addition combines numbers." }] } : question)),
  }, "APPROVED");
  const next = applyStaleness(approved, stalenessChangeSchema.parse({ kind: "SOURCE_VERSION", sourceId: "source-1", actorId: AUTHOR, at: LATER }));
  assert.equal(stateOf(next, "q1"), "NEEDS_SOURCE");
  assert.equal(stateOf(next, "q2"), "NEEDS_SOURCE");
  assert.equal(stateOf(next, "q3"), "APPROVED");
  assert.strictEqual(next.questions[2], approved.questions[2]);
  // The item content did not change, so the item revision does not advance.
  assert.equal(next.questions[0].review?.itemRevision, 1);
  assert.deepEqual(artifactsFor(next, "q1"), ["ITEM_APPROVAL", "SEMANTIC_REVIEW"]);
  // A source nothing cites reaches no item and leaves the form alone.
  const untouched = applyStaleness(approved, stalenessChangeSchema.parse({ kind: "SOURCE_VERSION", sourceId: "source-9", actorId: AUTHOR, at: LATER }));
  assert.equal(canonicalJson(untouched), canonicalJson(approved));
});

test("a taught-coverage change invalidates the coverage check of the form scoped to that section only (R6.4)", () => {
  const { paper } = assessmentFixture();
  const scoped = withReviews({ ...paper, coverageSection: "coverage-1" }, "APPROVED");
  const coverageChange = (section: string): StalenessChange => stalenessChangeSchema.parse({ kind: "COVERAGE", section, actorId: AUTHOR, at: LATER });
  const next = applyStaleness(scoped, coverageChange("coverage-1"));
  for (const question of next.questions) {
    assert.equal(itemStateFor(question), "APPROVED", "coverage is a form artifact: the item's own approval stands");
    assert.deepEqual(question.review?.invalidated.map(entry => entry.artifact), ["COVERAGE_CHECK"]);
    assert.equal(question.review?.itemRevision, 1);
  }
  assert.equal(next.staleness?.rehearsalValid, false);
  paperDataSchema.parse(next);
  // A form scoped elsewhere, or to nothing, is untouched.
  assert.equal(canonicalJson(applyStaleness(scoped, coverageChange("coverage-2"))), canonicalJson(scoped));
  assert.equal(canonicalJson(applyStaleness(withReviews(paper, "APPROVED"), coverageChange("coverage-1"))), canonicalJson(withReviews(paper, "APPROVED")));
});

/* ------------------------------------------------------------------ R6.5, R6.7: the form rehearsal result */

test("any invalidated item invalidates the form's rehearsal result and refuses the release (R6.5, R6.7)", () => {
  const { paper } = assessmentFixture();
  const rehearsed: PaperData = { ...withReviews(paper, "APPROVED"), staleness: { rehearsalValid: true, rehearsalId: "rehearsal-1" } };
  assert.deepEqual(releaseBlockers(rehearsed), []);
  assert.equal(canRelease(rehearsed), true);

  const next = applyStaleness(rehearsed, contentChange("q2", "MARKS"));
  assert.equal(next.staleness?.rehearsalValid, false);
  assert.equal(next.staleness?.rehearsalId, "rehearsal-1", "the invalid result stays identified");
  assert.equal(next.staleness?.invalidatedAt, LATER);
  assert.deepEqual(next.staleness?.triggeredBy, { actorId: AUTHOR, change: "ITEM_CONTENT MARKS q2" });
  assert.deepEqual(releaseBlockers(next).map(blocker => blocker.code).sort(), ["ITEM_NOT_APPROVED", "REHEARSAL_INVALID"]);
  assert.equal(canRelease(next), false);

  // A paper whose items carry no review record has nothing per-item to invalidate, and is refused
  // anyway: its items read DRAFT and the rehearsal it passed exercised the superseded content.
  const legacy: PaperData = { ...paper, staleness: { rehearsalValid: true, rehearsalId: "rehearsal-2" } };
  const afterLegacy = applyStaleness(legacy, contentChange("q2", "PROMPT"));
  assert.equal(afterLegacy.questions.every(question => question.review === undefined), true, "no review record is manufactured");
  assert.equal(afterLegacy.staleness?.rehearsalValid, false);
  assert.deepEqual(releaseBlockers(afterLegacy).map(blocker => blocker.code).sort(), ["ITEM_NOT_APPROVED", "REHEARSAL_INVALID"]);
  // ...and it stays approvable as a paper, which is what keeps task 6.1's no-migration claim true.
  assert.deepEqual(validatePaperApproval(afterLegacy, assessmentFixture().curriculum), []);
});

test("a BLOCKING rehearsal result blocks the release and an ADVISORY one does not (R7.4)", () => {
  const { paper } = assessmentFixture();
  const rehearsed: PaperData = { ...withReviews(paper, "APPROVED"), staleness: { rehearsalValid: true, rehearsalId: "rehearsal-1" } };
  assert.equal(canRelease(rehearsed, [{ check: "PRINT_PAGINATION", severity: "ADVISORY" }]), true);
  const blocked = releaseBlockers(rehearsed, [{ check: "KEY_SEPARATION", severity: "BLOCKING", questionIds: ["q1"] }, { check: "PRINT_PAGINATION", severity: "ADVISORY" }]);
  assert.deepEqual(blocked.map(blocker => blocker.code), ["REHEARSAL_BLOCKER"]);
  assert.deepEqual(blocked[0].questionIds, ["q1"]);

  // R4.10: each of the five non-approved states refuses the release on its own.
  for (const state of ITEM_REVIEW_STATES.filter(candidate => candidate !== "APPROVED")) {
    const one = { ...rehearsed, questions: rehearsed.questions.map((question, index) => (index === 1 ? { ...question, review: review(state) } : question)) };
    const blockers = releaseBlockers(one);
    assert.deepEqual(blockers.map(blocker => blocker.code), ["ITEM_NOT_APPROVED"], state);
    assert.deepEqual(blockers[0].questionIds, ["q2"], state);
    assert.match(blockers[0].detail, new RegExp(`1 ${state}`), state);
  }
});

/* ------------------------------------------------------------------ R6.6, R6.8: retained evidence */

test("each invalidated artifact carries its triggering change, actor and authoritative timestamp (R6.8)", () => {
  const { paper } = assessmentFixture();
  const next = applyStaleness(applyStaleness(withReviews(paper, "APPROVED"), contentChange("q1", "PROMPT")), contentChange("q1", "FIGURES", APPROVER, "2026-05-01T10:00:00.000Z"));
  const notices = stalenessNotices(next);
  for (const notice of notices.filter(candidate => candidate.scope === "ITEM")) {
    assert.equal(notice.questionId, "q1");
    assert.ok(notice.trigger && notice.change, "every item notice names the triggering change");
    assert.ok(notice.actorId === AUTHOR || notice.actorId === APPROVER);
    assert.ok(!Number.isNaN(Date.parse(notice.at)));
  }
  assert.deepEqual(notices.filter(candidate => candidate.trigger === "FIGURES").map(candidate => candidate.artifact).sort(), ["FIGURE_CHECK", "ITEM_APPROVAL"]);
  assert.deepEqual(notices.filter(candidate => candidate.scope === "FORM"), [{ scope: "FORM", questionId: null, artifact: "REHEARSAL_RESULT", trigger: null, change: "ITEM_CONTENT FIGURES q1", actorId: APPROVER, at: "2026-05-01T10:00:00.000Z" }]);
  // The invalidated figure check reaches the paper validator, which refuses approval until it is redone.
  const issues = validatePaperApproval(next, assessmentFixture().curriculum);
  assert.ok(issues.some(issue => issue.includes("invalidated the figure check")), issues.join(" | "));
});

test("repeated changes stay inside the record's own bounds, and the latest trigger wins (R6.6)", () => {
  const { paper } = assessmentFixture();
  let current = withReviews(paper, "APPROVED");
  for (let round = 0; round < 40; round += 1) {
    for (const facet of ITEM_FACETS) current = applyStaleness(current, contentChange("q1", facet, AUTHOR, new Date(Date.parse(LATER) + round * 1000).toISOString()));
  }
  const entries = entriesFor(current, "q1");
  assert.ok(entries.length <= 24, `invalidated entries must stay inside the 24-entry schema bound, got ${entries.length}`);
  assert.equal(entries.length, 18, "the six item facets reach 18 (artifact, trigger) pairs at most, 19 with the coverage check");
  assert.ok((current.questions[0].review?.history.length ?? 0) <= 60);
  assert.equal(new Set(entries.map(entry => `${entry.artifact}:${entry.trigger}`)).size, entries.length, "one entry per artifact and trigger");
  itemReviewSchema.parse(current.questions[0].review);
  paperDataSchema.parse(current);
});

/* ------------------------------------------------------------------ R6.9: the released form is untouched */

test("applyStaleness never writes through its argument, so a Released_Form stays byte-identical (R6.9)", () => {
  const generated = arbitraryPaper(xorshift(0x5a6b7c8d));
  const paper = deepFreeze(withReviews(generated.paper, "APPROVED"));
  // What release sealed: the exact bytes of the approved form.
  const released = canonicalJson(paper);
  const changes: StalenessChange[] = [
    contentChange(paper.questions[0].id, "PROMPT"),
    contentChange(paper.questions[0].id, "FIGURES"),
    stalenessChangeSchema.parse({ kind: "SOURCE_VERSION", sourceId: "source-1", actorId: AUTHOR, at: LATER }),
    stalenessChangeSchema.parse({ kind: "COVERAGE", section: paper.coverageSection ?? "coverage-1", actorId: AUTHOR, at: LATER }),
  ];
  for (const change of changes) {
    const next = applyStaleness(paper, change);
    assert.notStrictEqual(next, paper, "a new paper is returned rather than the input");
    assert.equal(canonicalJson(paper), released, `${change.kind} must leave the released bytes untouched`);
  }
  assert.equal(canonicalJson(applyItemEdit(paper, paper.questions[0], { ...paper.questions[0], marks: 99 }, { actorId: AUTHOR, at: LATER })) !== released, true);
  assert.equal(canonicalJson(paper), released);
});

test("the first pass is the fixed point: re-applying a change adds no further invalidation", () => {
  const { paper } = assessmentFixture();
  const once = applyStaleness(withReviews(paper, "APPROVED"), contentChange("q1", "PROMPT"));
  const twice = applyStaleness(once, contentChange("q1", "PROMPT"));
  assert.equal(stateOf(twice, "q1"), stateOf(once, "q1"));
  assert.deepEqual(entriesFor(twice, "q1"), entriesFor(once, "q1"));
  // A second edit is a second item revision, which is the only thing that advances.
  assert.equal(twice.questions[0].review?.itemRevision, (once.questions[0].review?.itemRevision ?? 0) + 1);
  // Idempotent where no revision is involved.
  const source = stalenessChangeSchema.parse({ kind: "SOURCE_VERSION", sourceId: "source-1", actorId: AUTHOR, at: LATER });
  const first = applyStaleness(withReviews(paper, "APPROVED"), source);
  assert.equal(canonicalJson(applyStaleness(first, source)), canonicalJson(first));
});

test("the change schema refuses a change that could not be displayed under R6.8", () => {
  for (const invalid of [
    { kind: "ITEM_CONTENT", questionId: "q1", facet: "PROMPT", actorId: AUTHOR },
    { kind: "ITEM_CONTENT", questionId: "q1", facet: "PROMPT", actorId: AUTHOR, at: "yesterday" },
    { kind: "ITEM_CONTENT", questionId: "q1", facet: "KEY", actorId: AUTHOR, at: LATER },
    { kind: "ITEM_CONTENT", questionId: "", facet: "PROMPT", actorId: AUTHOR, at: LATER },
    { kind: "SOURCE_VERSION", sourceId: "source-1", actorId: AUTHOR, at: LATER, section: "coverage-1" },
    { kind: "TAUGHT_COVERAGE", section: "coverage-1", actorId: AUTHOR, at: LATER },
  ]) {
    assert.equal(stalenessChangeSchema.safeParse(invalid).success, false, JSON.stringify(invalid));
  }
});
