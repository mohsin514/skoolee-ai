import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRIEF_DECISION_BOUNDS,
  BRIEF_QUESTION_SEQUENCE,
  FACT_CLASSIFICATIONS,
  MAX_BRIEF_HISTORY,
  acceptSuggestion,
  assessmentBriefSchema,
  briefApprovalIssues,
  briefReadiness,
  briefValueSchema,
  confirmDecision,
  emptyAssessmentBrief,
  nextOpenDecision,
  openDecisions,
  resumeDecision,
  skipDecision,
  skippedDecisions,
  suggestDecision,
  suggestSchoolDefault,
  validateBriefAnswer,
  type AssessmentBrief,
  type BriefDecisionValues,
  type BriefQuestionKey,
  type BriefScope,
  type BriefWriteResult,
} from "../../src/lib/school-ai/assessment-brief";
import { MAX_FORMS_CEILING } from "../../src/lib/school-ai/delivery-policy";
import { parseWorkspaceData } from "../../src/lib/school-ai/schemas";
import { workspaceApprovalIssues } from "../../src/lib/school-ai/workflows";
import { FIXED_EPOCH_MS } from "./exam-studio-generators";

// SKO-408 task 5.1. The Assessment Brief domain module (Requirement 3): the three-way
// classification, the nine-key question sequence, the one-decision-at-a-time cursor, acceptance
// retention and the readiness summary — all with named examples.
//
// Property 33 ("Every brief value holds exactly one classification") is task 5.4 and is appended to
// this file below the marker at the end, over generated answered/accepted/skipped subsets.

/** The fixture epoch, so every recorded confirmation timestamp agrees across the school-ai tests. */
const NOW = new Date(FIXED_EPOCH_MS); // 2026-05-01T08:00:00Z
const LATER = new Date(FIXED_EPOCH_MS + 60_000);
const ACTOR = "teacher-1";
const SUBJECT = "math";
const CLASS = "grade-8";
const SCOPE: BriefScope = { schoolId: "school-1", campusId: "campus-a", classId: CLASS, subjectId: SUBJECT };

/** One storable value per decision, so no scenario below relies on a brief that could not be saved. */
const VALUES: BriefDecisionValues = {
  subject: SUBJECT,
  class: CLASS,
  taughtCoverage: { section: "unit-3", outcomeIds: ["outcome-1", "outcome-2"] },
  durationMinutes: 90,
  totalMarks: 50,
  languages: ["en", "ur"],
  formCount: 2,
  deliveryTier: "STANDARD",
  accommodationIntent: { expected: true, assistance: ["READER"] },
};

const unwrap = (result: BriefWriteResult): AssessmentBrief => {
  assert.ok(result.ok, `write refused: ${result.ok ? "" : `${result.reason} — ${result.detail}`}`);
  return result.brief;
};

const scoped = () => emptyAssessmentBrief({ subjectId: SUBJECT, classId: CLASS });

const confirm = (brief: AssessmentBrief, key: BriefQuestionKey, at: Date = NOW) => confirmDecision(brief, { key, value: VALUES[key], actorId: ACTOR, at, scope: SCOPE });

const suggest = (brief: AssessmentBrief, key: BriefQuestionKey, overrides: { value?: unknown; sourceVersion?: number } = {}) =>
  suggestDecision(brief, {
    key,
    value: (overrides.value ?? VALUES[key]) as BriefDecisionValues[typeof key],
    actorId: ACTOR,
    at: NOW,
    sourceId: "source-9",
    sourceVersion: overrides.sourceVersion ?? 3,
    reference: "page 14, table 2",
    excerpt: "Unit 3 is assessed over 90 minutes for 50 marks.",
  });

/** Every decision confirmed, which is the only state in which a brief is ready. */
const confirmedBrief = () => BRIEF_QUESTION_SEQUENCE.reduce<AssessmentBrief>((brief, key) => unwrap(confirm(brief, key)), scoped());

/* ------------------------------------------------------------------ the sequence and the record */

test("the brief asks nine decisions in the recorded order, and every key always holds a classification", () => {
  assert.deepEqual([...BRIEF_QUESTION_SEQUENCE], ["subject", "class", "taughtCoverage", "durationMinutes", "totalMarks", "languages", "formCount", "deliveryTier", "accommodationIntent"]);
  assert.deepEqual([...FACT_CLASSIFICATIONS], ["CONFIRMED_FACT", "EXTRACTED_SUGGESTION", "OPEN_DECISION"]);

  const brief = scoped();
  // Exhaustive by construction: an unanswered decision is a stored Open_Decision, not an absent key.
  assert.deepEqual(Object.keys(brief.decisions).sort(), [...BRIEF_QUESTION_SEQUENCE].sort());
  for (const key of BRIEF_QUESTION_SEQUENCE) assert.deepEqual(brief.decisions[key], { classification: "OPEN_DECISION", skipped: false });

  // A key cannot be dropped, and no key outside the sequence can be introduced.
  const { subject: _dropped, ...missingOne } = brief.decisions;
  assert.equal(assessmentBriefSchema.safeParse({ ...brief, decisions: missingOne }).success, false);
  assert.equal(assessmentBriefSchema.safeParse({ ...brief, decisions: { ...brief.decisions, calculatorPolicy: { classification: "OPEN_DECISION", skipped: false } } }).success, false);
  // The brief body carries the paired teaching scope `assertWorkspaceSubject` reads, and nothing else.
  assert.equal(assessmentBriefSchema.safeParse({ ...brief, subjectId: SUBJECT, classId: undefined }).success, false);
  assert.equal(assessmentBriefSchema.safeParse({ ...brief, readiness: "ready" }).success, false);
});

test("each classification carries its own required evidence, and no value carries two classifications", () => {
  const fact = { classification: "CONFIRMED_FACT", value: 90, actorId: ACTOR, at: NOW.toISOString(), scope: SCOPE };
  assert.ok(briefValueSchema.safeParse(fact).success);
  // R3.3: a fact without its confirming actor, authoritative timestamp or scope is not a fact.
  for (const field of ["actorId", "at", "scope", "value"] as const) {
    const { [field]: _removed, ...incomplete } = fact;
    assert.equal(briefValueSchema.safeParse(incomplete).success, false, field);
  }
  assert.equal(briefValueSchema.safeParse({ ...fact, at: "2026-05-01 08:00:00" }).success, false, "an authoritative timestamp is an ISO instant in UTC");
  assert.equal(briefValueSchema.safeParse({ ...fact, at: "2026-05-01T08:00:00+02:00" }).success, false, "a local offset is not the authoritative timestamp");

  const suggestion = { classification: "EXTRACTED_SUGGESTION", value: 90, sourceId: "source-9", sourceVersion: 3, reference: "page 14", excerpt: "90 minutes", origin: "APPROVED_SOURCE", reviewed: false };
  assert.ok(briefValueSchema.safeParse(suggestion).success);
  // R3.4: source record, source version, page or region reference and the exact excerpt, all required.
  for (const field of ["sourceId", "sourceVersion", "reference", "excerpt", "value"] as const) {
    const { [field]: _removed, ...incomplete } = suggestion;
    assert.equal(briefValueSchema.safeParse(incomplete).success, false, field);
  }
  // R3.11: a suggestion cannot claim it was reviewed; only a confirmation produces a reviewed value.
  assert.equal(briefValueSchema.safeParse({ ...suggestion, reviewed: true }).success, false);

  // An Open_Decision has no field for a value, so an unanswered question cannot hold one.
  assert.ok(briefValueSchema.safeParse({ classification: "OPEN_DECISION", skipped: false, lastEnteredText: "ninety-ish" }).success);
  assert.equal(briefValueSchema.safeParse({ classification: "OPEN_DECISION", skipped: false, value: 90 }).success, false);
  // The union is disjoint: one value cannot be a fact and a suggestion at once, nor neither.
  assert.equal(briefValueSchema.safeParse({ ...fact, sourceId: "source-9", sourceVersion: 3, reference: "page 14", excerpt: "90 minutes", origin: "APPROVED_SOURCE", reviewed: false }).success, false);
  assert.equal(briefValueSchema.safeParse({ classification: "CONFIRMED_SUGGESTION", value: 90 }).success, false);
});

/* ------------------------------------------------------------------ one decision at a time (R3.1, R3.6, R3.10) */

test("exactly one open decision is presented, in sequence order, and answering advances the cursor", () => {
  let brief = scoped();
  for (const key of BRIEF_QUESTION_SEQUENCE) {
    assert.equal(nextOpenDecision(brief), key);
    brief = unwrap(confirm(brief, key));
  }
  assert.equal(nextOpenDecision(brief), null, "nothing is left to ask once every decision is confirmed");
  assert.deepEqual(openDecisions(brief), []);
});

test("a skipped decision stays open, the assistant continues, and a returning author resumes at it", () => {
  const skipped = unwrap(skipDecision(scoped(), { key: "subject", actorId: ACTOR, at: NOW, enteredText: "not sure yet" }));
  const decision = skipped.decisions.subject;
  assert.equal(decision.classification, "OPEN_DECISION", "R3.6: a skip answers nothing");
  assert.deepEqual(decision, { classification: "OPEN_DECISION", skipped: true, lastEnteredText: "not sure yet" });
  // R3.6: continue to the next open decision rather than re-presenting the skipped one.
  assert.equal(nextOpenDecision(skipped), "class");
  assert.deepEqual(skippedDecisions(skipped), ["subject"]);
  // R3.8: it still blocks. R3.10: the next visit resumes at it.
  assert.ok(briefReadiness(skipped).blocking.includes("subject"));
  assert.equal(resumeDecision(skipped), "subject");

  // A skip cannot erase an answer: skipping an answered decision is refused.
  const answered = unwrap(confirm(scoped(), "subject"));
  const refused = skipDecision(answered, { key: "subject", actorId: ACTOR, at: LATER });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.reason, "NOT_OPEN");
  assert.deepEqual(refused.brief, answered, "a refused write leaves the brief untouched");
});

test("a persisted draft resumes at the first open decision while keeping every answered value", () => {
  const brief = unwrap(confirm(unwrap(confirm(scoped(), "subject")), "class"));
  // The draft survives a round trip through the stored record body, which is how it crosses sessions (R3.9).
  const stored = assessmentBriefSchema.parse(JSON.parse(JSON.stringify(brief)));
  assert.equal(resumeDecision(stored), "taughtCoverage");
  assert.equal(stored.decisions.subject.classification, "CONFIRMED_FACT");
  assert.equal(stored.decisions.class.classification, "CONFIRMED_FACT");
  assert.deepEqual(stored, brief);
});

/* ------------------------------------------------------------------ suggestions and acceptance (R3.4, R3.5, R3.7) */

test("accepting a suggestion confirms the value and retains both the suggestion and the acceptance", () => {
  const offered = unwrap(suggest(scoped(), "durationMinutes"));
  const suggestion = offered.decisions.durationMinutes;
  assert.equal(suggestion.classification, "EXTRACTED_SUGGESTION");

  const accepted = unwrap(acceptSuggestion(offered, { key: "durationMinutes", actorId: "teacher-2", at: LATER, scope: SCOPE }));
  const fact = accepted.decisions.durationMinutes;
  assert.equal(fact.classification, "CONFIRMED_FACT");
  assert.ok(fact.classification === "CONFIRMED_FACT");
  assert.equal(fact.value, VALUES.durationMinutes);
  assert.equal(fact.actorId, "teacher-2");
  assert.equal(fact.at, LATER.toISOString());
  assert.deepEqual(fact.scope, SCOPE);
  // `acceptedFrom` is copied off the suggestion, so acceptance cannot invent a source or a version.
  assert.deepEqual(fact.acceptedFrom, { sourceId: "source-9", sourceVersion: 3 });

  // R3.5: the original suggestion and the acceptance event are both in the history, and the
  // suggestion event that preceded them is still there — history is appended to, never rewritten.
  assert.equal(accepted.history.length, 2);
  assert.deepEqual(accepted.history[0], { key: "durationMinutes", event: "SUGGESTED", actorId: ACTOR, at: NOW.toISOString(), from: "OPEN_DECISION", to: "EXTRACTED_SUGGESTION" });
  assert.deepEqual(accepted.history[1], { key: "durationMinutes", event: "ACCEPTED_SUGGESTION", actorId: "teacher-2", at: LATER.toISOString(), from: "EXTRACTED_SUGGESTION", to: "CONFIRMED_FACT", retainedSuggestion: suggestion });
  assert.deepEqual(accepted.history[0], offered.history[0], "the earlier entry is unchanged");

  // The retained suggestion is refused as a bare acceptance claim: the two travel together or not at all.
  const withoutSuggestion = { ...accepted, history: [accepted.history[0], { ...accepted.history[1], retainedSuggestion: undefined }] };
  assert.equal(assessmentBriefSchema.safeParse(withoutSuggestion).success, false);
  const suggestionWithoutAcceptance = { ...accepted, history: [{ ...accepted.history[0], retainedSuggestion: suggestion }] };
  assert.equal(assessmentBriefSchema.safeParse(suggestionWithoutAcceptance).success, false);
});

test("a school default is a suggestion labelled as one, and confirms nothing until it is accepted", () => {
  const offered = unwrap(suggestSchoolDefault(scoped(), { key: "formCount", value: 2, actorId: ACTOR, at: NOW, sourceId: "school-policy-1", sourceVersion: 4, reference: "Assessment policy, clause 6", excerpt: "Two forms are produced for every terminal examination." }));
  const suggestion = offered.decisions.formCount;
  assert.ok(suggestion.classification === "EXTRACTED_SUGGESTION");
  assert.equal(suggestion.origin, "SCHOOL_DEFAULT", "R3.7: the default is labelled as a school default");
  assert.equal(suggestion.reviewed, false);
  assert.equal(suggestion.sourceVersion, 4);

  // R3.8 and R3.11: an unaccepted default is evidence, not a decision, so it still blocks release.
  const readiness = briefReadiness(offered);
  assert.ok(readiness.blocking.includes("formCount"));
  assert.deepEqual(readiness.awaitingAcceptance, ["formCount"]);
  assert.equal(readiness.open.includes("formCount"), false);
  assert.equal(readiness.ready, false);

  assert.ok(acceptSuggestion(offered, { key: "formCount", actorId: ACTOR, at: LATER, scope: SCOPE }).ok);
});

test("a suggestion never displaces a confirmed fact, and acceptance needs a suggestion to accept", () => {
  const confirmed = unwrap(confirm(scoped(), "totalMarks"));
  const refused = suggest(confirmed, "totalMarks", { value: 80 });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.reason, "ALREADY_CONFIRMED");
  assert.deepEqual(refused.brief, confirmed);

  // An open decision holds no value, so there is nothing an acceptance could confirm.
  for (const brief of [scoped(), confirmed]) {
    const nothing = acceptSuggestion(brief, { key: "totalMarks", actorId: ACTOR, at: LATER, scope: SCOPE });
    assert.equal(nothing.ok, false);
    assert.equal(nothing.ok === false && nothing.reason, "NOT_A_SUGGESTION");
  }
});

/* ------------------------------------------------------------------ nothing is derived (R3.11) */

test("no value becomes a fact without an explicitly named actor and an authoritative timestamp", () => {
  const brief = scoped();
  for (const actorId of ["", "   "]) {
    const refused = confirmDecision(brief, { key: "durationMinutes", value: 90, actorId, at: NOW, scope: SCOPE });
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.reason, "MISSING_ACTOR");
  }
  const noClock = confirmDecision(brief, { key: "durationMinutes", value: 90, actorId: ACTOR, at: new Date(Number.NaN), scope: SCOPE });
  assert.equal(noClock.ok, false);
  assert.equal(noClock.ok === false && noClock.reason, "INVALID_TIMESTAMP");

  // Entered text is retained for correction and is read by nothing else: the decision stays open,
  // so the text the author typed can never be mistaken for the decision they never made.
  const typed = unwrap(skipDecision(brief, { key: "durationMinutes", actorId: ACTOR, at: NOW, enteredText: "about an hour and a half" }));
  assert.equal(typed.decisions.durationMinutes.classification, "OPEN_DECISION");
  assert.ok(briefReadiness(typed).blocking.includes("durationMinutes"));
  assert.equal(briefApprovalIssues(typed).length, BRIEF_QUESTION_SEQUENCE.length);
});

test("a confirmation is refused outside the subject and class the brief is for", () => {
  const brief = scoped();
  for (const scope of [{ ...SCOPE, subjectId: "science" }, { ...SCOPE, classId: "grade-9" }]) {
    const refused = confirmDecision(brief, { key: "durationMinutes", value: 90, actorId: ACTOR, at: NOW, scope });
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.reason, "SCOPE_MISMATCH");
  }
  // The same statement at the record boundary: a stored fact cannot claim another scope either.
  const confirmed = unwrap(confirm(brief, "durationMinutes"));
  const smuggled = { ...confirmed, decisions: { ...confirmed.decisions, durationMinutes: { ...confirmed.decisions.durationMinutes, scope: { ...SCOPE, subjectId: "science" } } } };
  assert.equal(assessmentBriefSchema.safeParse(smuggled).success, false);
  // And a confirmed subject or class is the one the brief is for.
  const mismatched = confirmDecision(brief, { key: "subject", value: "science", actorId: ACTOR, at: NOW, scope: SCOPE });
  assert.equal(mismatched.ok, false);
});

/* ------------------------------------------------------------------ validation bounds (R3.12) */

test("each decision has its own bound, and a failed answer reports the bound and keeps the entered text", () => {
  const cases: Array<[BriefQuestionKey, unknown]> = [
    ["subject", "maths and science"],
    ["class", ""],
    ["taughtCoverage", { section: "unit-3", outcomeIds: ["outcome-1", "outcome-1"] }],
    ["durationMinutes", 481],
    ["totalMarks", 0],
    ["languages", ["en", "en"]],
    ["formCount", MAX_FORMS_CEILING + 1],
    ["deliveryTier", "KIOSK"],
    ["accommodationIntent", { expected: true, assistance: [] }],
  ];
  for (const [key, value] of cases) {
    const bad = validateBriefAnswer(key, value);
    assert.equal(bad.ok, false, key);
    assert.ok(bad.ok === false && bad.bound.startsWith(BRIEF_DECISION_BOUNDS[key]), `${key} reports its own bound`);
    const good = validateBriefAnswer(key, VALUES[key]);
    assert.ok(good.ok, key);
  }

  const refused = confirmDecision(scoped(), { key: "durationMinutes", value: 481 as BriefDecisionValues["durationMinutes"], actorId: ACTOR, at: NOW, scope: SCOPE });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.reason, "FAILED_BOUND");
  assert.ok(refused.ok === false && refused.detail.includes("between 1 and 480"));
  // R3.12: the entered text comes back with the refusal, against a decision that is still open.
  assert.deepEqual(refused.brief.decisions.durationMinutes, { classification: "OPEN_DECISION", skipped: false, lastEnteredText: "481" });
  assert.deepEqual(refused.brief.history, [], "a refused answer is not a decision event");
});

/* ------------------------------------------------------------------ readiness (R3.8) */

test("the readiness summary lists every decision that blocks release, and clears only when all nine are confirmed", () => {
  let brief = scoped();
  assert.deepEqual(briefReadiness(brief).blocking, [...BRIEF_QUESTION_SEQUENCE]);
  assert.deepEqual(briefReadiness(brief).open, [...BRIEF_QUESTION_SEQUENCE]);
  assert.equal(briefReadiness(brief).ready, false);

  for (const key of BRIEF_QUESTION_SEQUENCE.slice(0, -1)) brief = unwrap(confirm(brief, key));
  assert.deepEqual(briefReadiness(brief).blocking, ["accommodationIntent"]);
  assert.equal(briefReadiness(brief).ready, false);
  assert.deepEqual(briefApprovalIssues(brief), ["Confirm accommodationIntent before approving the assessment brief."]);

  const ready = confirmedBrief();
  assert.deepEqual(briefReadiness(ready), { blocking: [], open: [], skipped: [], awaitingAcceptance: [], ready: true });
  assert.deepEqual(briefApprovalIssues(ready), []);
  // Readiness is a function of the brief alone: the same brief answers the same way every time.
  assert.deepEqual(briefReadiness(ready), briefReadiness(assessmentBriefSchema.parse(JSON.parse(JSON.stringify(ready)))));
});

test("the brief history is appended to and never trimmed, so a full history refuses the write", () => {
  const ready = confirmedBrief();
  assert.equal(ready.history.length, BRIEF_QUESTION_SEQUENCE.length);
  assert.ok(ready.history.every(entry => entry.event === "CONFIRMED" && entry.to === "CONFIRMED_FACT"));

  const full = assessmentBriefSchema.parse({ ...ready, history: Array.from({ length: MAX_BRIEF_HISTORY }, () => ready.history[0]) });
  const refused = confirm(full, "durationMinutes", LATER);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.reason, "HISTORY_FULL");
  assert.equal(refused.brief.history.length, MAX_BRIEF_HISTORY, "no entry is dropped to make room");
  assert.equal(assessmentBriefSchema.safeParse({ ...full, history: [...full.history, full.history[0]] }).success, false);
});

/* ------------------------------------------------------------------ the stored record (R3.9, R3.13) */

test("the BRIEF record body is the brief schema, and its readiness decides approval", () => {
  const ready = confirmedBrief();
  assert.deepEqual(parseWorkspaceData("BRIEF", JSON.parse(JSON.stringify(ready))), JSON.parse(JSON.stringify(ready)));
  // The placeholder body is gone: a brief is a brief, not a scope with an untyped bag beside it.
  assert.throws(() => parseWorkspaceData("BRIEF", { subjectId: SUBJECT, classId: CLASS }));
  assert.throws(() => parseWorkspaceData("BRIEF", { ...ready, readiness: "ready" }));

  assert.deepEqual(workspaceApprovalIssues("BRIEF", JSON.parse(JSON.stringify(ready)), NOW), []);
  const draft = unwrap(skipDecision(scoped(), { key: "subject", actorId: ACTOR, at: NOW }));
  assert.equal(workspaceApprovalIssues("BRIEF", JSON.parse(JSON.stringify(draft)), NOW).length, BRIEF_QUESTION_SEQUENCE.length);
});

// ------------------------------------------------------------------------------------------------
// SKO-408 task 5.4 appends Property 33 below this line:
//   // Feature: ai-exam-studio, Property 33: Every brief value holds exactly one classification
// The fixtures above (`SCOPE`, `VALUES`, `scoped`, `confirm`, `suggest`, `unwrap`) are written to be
// reused by it, so the property test adds generators and assertions only.
