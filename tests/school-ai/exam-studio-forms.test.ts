import { test } from "node:test";
import assert from "node:assert/strict";
import * as formSetModule from "../../src/lib/school-ai/form-set";
import {
  ALLOCATION_ISSUE_CODES,
  BLUEPRINT_HASH_SCHEME,
  FORM_LABELS,
  FORM_SET_CLAIM_SCOPE,
  FORM_SET_DATABASE_INVARIANTS,
  LANGUAGE_OBSERVATION_CODES,
  LANGUAGE_RELEASE_BLOCKING_CODES,
  PARITY_CHECKS,
  allocateForms,
  allocationIssues,
  blueprintHashFor,
  blueprintHashSchema,
  blueprintParityProjection,
  compareFormSetParity,
  compareLanguageVersions,
  formAllocationSchema,
  formChangeDecision,
  formCountIssues,
  formSetReleaseBlockers,
  formSetSchema,
  isLanguageReleaseBlocking,
  itemGroupIdsOf,
  keyStructureOf,
  modelComparisonProposalSchema,
  proposalsAwaitingDecision,
  resolveCandidateForm,
  unresolvedLanguageBlockers,
  type FormAllocation,
  type FormLabel,
  type FormSet,
  type FormSetMember,
  type LanguageObservation,
  type ModelComparisonProposal,
} from "../../src/lib/school-ai/form-set";
import { PLATFORM_DEFAULT_DELIVERY_POLICY, resolveDeliveryPolicy } from "../../src/lib/school-ai/delivery-policy";
import { STUDIO_STATUS_TOKENS } from "../../src/lib/school-ai/exam-studio-copy";
import { scanBannedTerms } from "../../src/lib/school-ai/commercial-evidence";
import { paperDataSchema, type AssessmentLocale, type PaperData } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";
import { arbitraryPaper, xorshift } from "./exam-studio-generators";

/**
 * Form sets, blueprint parity, the language comparison and form allocation — named examples.
 *
 * **Property 22 ("Form sets satisfy blueprint parity or no form is released") appends to this file**,
 * sweeping `SEEDS_100` through `arbitraryPaper` with injected parity breaks. The two sibling property
 * tests live in their own files, as the plan names them: language version agreement in
 * `exam-studio-language.test.ts` and one-candidate-one-form in `exam-studio-forms.database.test.ts`.
 * Nothing below depends on the order of the tests in this file, so an appended sweep needs no edit here.
 */

const FORM_SET_ID = "form-set-1";
const clone = (paper: PaperData) => JSON.parse(JSON.stringify(paper)) as PaperData;

/**
 * One member of the set. The recorded `blueprintHash` is computed *after* the mutation, so a test
 * that breaks one check does not also trip the recomputation check; the stale-hash case sets it by hand.
 */
function member(label: FormLabel, language: AssessmentLocale = "en", mutate?: (paper: PaperData) => void): FormSetMember {
  const paper = clone(assessmentFixture().paper);
  paper.language = language;
  paper.itemGroupIds = Object.fromEntries(paper.questions.map(question => [question.id, `group-${question.id}`]));
  mutate?.(paper);
  paper.formSet = { id: FORM_SET_ID, label, blueprintHash: blueprintHashFor(paper.blueprint) };
  return { label, language, paper };
}

const formSetRecord = (labels: FormLabel[], overrides: Record<string, unknown> = {}): FormSet =>
  formSetSchema.parse({
    id: FORM_SET_ID,
    schoolId: "",
    campusId: "campus-1",
    briefRecordId: "brief-1",
    blueprintHash: blueprintHashFor(assessmentFixture().paper.blueprint),
    labels,
    maxForms: 4,
    status: "DRAFT",
    version: 1,
    createdById: "author-1",
    ...overrides,
  });

const checksFor = (findings: readonly { check: string; form: { label: FormLabel } }[], label: FormLabel) => findings.filter(entry => entry.form.label === label).map(entry => entry.check);

/* ------------------------------------------------------------------ the parity key */

test("the parity key is a statement about blueprint structure, so it survives translation and moves with every total", () => {
  const { paper } = assessmentFixture();
  const english = paper.blueprint;
  // The same blueprint as an Arabic form carries it: every authored string translated, nothing structural changed.
  const arabic = { ...clone(paper).blueprint, title: "تقييم الرياضيات", instructions: "أجب عن سؤال واحد في القسم أ وأكمل القسم ب.", sections: english.sections.map((section, index) => ({ ...section, title: index ? "ب" : "أ" })) };
  assert.equal(blueprintHashFor(arabic), blueprintHashFor(english), "a translated form of the same blueprint must share the parity key, or no bilingual set could ever reach parity");

  assert.match(blueprintHashFor(english), /^[a-f0-9]{64}$/);
  assert.equal(blueprintHashSchema.safeParse(blueprintHashFor(english)).success, true);
  assert.equal(blueprintParityProjection(english).scheme, BLUEPRINT_HASH_SCHEME);

  const structural: Array<(blueprint: PaperData["blueprint"]) => void> = [
    blueprint => void (blueprint.sections[0].questionCount = 3),
    blueprint => void (blueprint.sections[0].answerCount = 2),
    blueprint => void (blueprint.sections[0].marksPerQuestion = 4),
    blueprint => void (blueprint.sections[0].type = "SHORT_TEXT"),
    blueprint => void (blueprint.sections[0].outcomeIds = ["outcome-2"]),
    blueprint => void (blueprint.totalMarks = 6),
    blueprint => void (blueprint.durationMinutes = 45),
    blueprint => void blueprint.sections.reverse(),
  ];
  for (const change of structural) {
    const changed = clone(paper).blueprint;
    change(changed);
    assert.notEqual(blueprintHashFor(changed), blueprintHashFor(english));
  }

  // Insignificant difference: outcome ids are a set, and object key order cannot matter because the digest is canonical.
  const reordered = clone(paper).blueprint;
  reordered.sections[0].outcomeIds = ["outcome-1"];
  reordered.sections[0] = { outcomeIds: reordered.sections[0].outcomeIds, type: reordered.sections[0].type, marksPerQuestion: reordered.sections[0].marksPerQuestion, answerCount: reordered.sections[0].answerCount, questionCount: reordered.sections[0].questionCount, title: reordered.sections[0].title, id: reordered.sections[0].id };
  assert.equal(blueprintHashFor(reordered), blueprintHashFor(english));
});

test("the four-form bound is a schema bound a request cannot exceed", () => {
  assert.equal(formSetSchema.safeParse({ ...formSetRecord(["A"]), labels: ["A", "B", "C", "D"] }).success, true);
  for (const labels of [[], ["A", "B", "C", "D", "A"], ["A", "A"], ["E"]]) {
    assert.equal(formSetSchema.safeParse({ ...formSetRecord(["A"]), labels }).success, false, `labels ${JSON.stringify(labels)} must be unstorable`);
  }
  // A set cannot declare more forms than its own recorded maximum.
  assert.equal(formSetSchema.safeParse({ ...formSetRecord(["A"]), labels: ["A", "B", "C"], maxForms: 2 }).success, false);
  assert.equal(formSetSchema.safeParse({ ...formSetRecord(["A"]), labels: ["A", "B"], maxForms: 2 }).success, true);
  assert.equal(formSetSchema.safeParse({ ...formSetRecord(["A"]), maxForms: 5 }).success, false);
  assert.equal(FORM_LABELS.length, 4);

  // `paperDataSchema.formSet` is the other half of the pair, and agrees on the label set and the digest shape.
  const { paper } = member("A");
  assert.equal(paperDataSchema.safeParse(paper).success, true);
  assert.equal(paperDataSchema.safeParse({ ...paper, formSet: { ...paper.formSet, blueprintHash: blueprintHashFor(paper.blueprint).toUpperCase() } }).success, false);
  assert.equal(paperDataSchema.safeParse({ ...paper, formSet: { ...paper.formSet, label: "E" } }).success, false);
});

/* ------------------------------------------------------------------ parity across a set */

test("four forms sharing one blueprint reach parity, and the comparison names the shared and the changed items", () => {
  const members = FORM_LABELS.map((label, index) =>
    member(label, "en", paper => {
      // Every form keeps section A's first item and replaces the rest, which is what an author wants to see.
      paper.itemGroupIds = { q1: "group-q1", q2: `group-q2-${label}`, q3: index === 0 ? "group-q3" : `group-q3-${label}` };
    }),
  );
  const report = compareFormSetParity({ formSet: formSetRecord([...FORM_LABELS]), members });
  assert.equal(report.parity, true);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.reference, { label: "A", language: "en" });
  assert.equal(report.blueprintHash, blueprintHashFor(members[0].paper.blueprint));
  assert.deepEqual(report.sharedItemGroupIds, ["group-q1"]);
  assert.deepEqual(report.changedItemGroupIds, ["group-q2-A", "group-q2-B", "group-q2-C", "group-q2-D", "group-q3", "group-q3-B", "group-q3-C", "group-q3-D"]);
  assert.deepEqual(report.coverage, { sharedOutcomeIds: ["outcome-1"], differingOutcomeIds: [] });
  assert.deepEqual(report.forms.map(entry => entry.form.label), [...FORM_LABELS]);
  assert.deepEqual(report.forms[0].summary.itemsPerSection, [{ sectionId: "a", items: 2 }, { sectionId: "b", items: 1 }]);
  assert.equal(report.forms[0].summary.itemMarksTotal, 7);
  assert.deepEqual(itemGroupIdsOf(members[1].paper), ["group-q1", "group-q2-B", "group-q3-B"]);
  assert.equal(formSetReleaseBlockers({ formSet: formSetRecord([...FORM_LABELS]), members }).release, "PERMITTED");
});

test("each parity break names the failing form and the failing check, and refuses the whole set", () => {
  const cases: Array<{ label: FormLabel; check: string; subject: string | null; mutate: (paper: PaperData) => void }> = [
    { label: "C", check: "SECTION_TOTALS_MISMATCH", subject: "a.questionCount", mutate: paper => void (paper.blueprint.sections[0].questionCount = 3) },
    { label: "C", check: "MARKS_TOTAL_MISMATCH", subject: null, mutate: paper => void (paper.blueprint.totalMarks = 6) },
    { label: "B", check: "ITEM_MARKS_TOTAL_MISMATCH", subject: null, mutate: paper => void (paper.questions[0].marks = 3) },
    { label: "B", check: "OUTCOME_COVERAGE_MISMATCH", subject: "outcome-2", mutate: paper => void (paper.questions[2].outcomeIds = ["outcome-2"]) },
    { label: "D", check: "SECTION_SET_MISMATCH", subject: "c", mutate: paper => void (paper.blueprint.sections[1].id = "c") },
    { label: "D", check: "ITEM_ALLOCATION_MISMATCH", subject: "a", mutate: paper => void paper.questions.splice(1, 1) },
  ];
  for (const scenario of cases) {
    const members = [member("A"), member("B", "en", scenario.label === "B" ? scenario.mutate : undefined), member("C", "en", scenario.label === "C" ? scenario.mutate : undefined), member("D", "en", scenario.label === "D" ? scenario.mutate : undefined)];
    const formSet = formSetRecord([...FORM_LABELS]);
    const report = compareFormSetParity({ formSet, members });
    assert.equal(report.parity, false, scenario.check);
    const failing = report.findings.filter(entry => entry.check === scenario.check);
    assert.ok(failing.length, `${scenario.check} was not reported`);
    assert.deepEqual([...new Set(failing.map(entry => entry.form.label))], [scenario.label], `${scenario.check} must name only the failing form`);
    if (scenario.subject !== null) assert.ok(failing.some(entry => entry.subject === scenario.subject), `${scenario.check} must name ${scenario.subject}`);
    // Every other form stays clean, and the refusal still covers the whole set (R10.4).
    for (const label of FORM_LABELS.filter(entry => entry !== scenario.label)) assert.deepEqual(checksFor(report.findings, label), []);
    const precondition = formSetReleaseBlockers({ formSet, members });
    assert.equal(precondition.release, "REFUSED");
    assert.ok(precondition.blockers.some(blocker => blocker.code === scenario.check && blocker.form?.label === scenario.label && blocker.severity === "BLOCKING"));
  }
});

test("a declared form with no record, a record outside the set and a recorded hash that is not a recomputation are each reported", () => {
  const missing = compareFormSetParity({ formSet: formSetRecord(["A", "B"]), members: [member("A")] });
  assert.deepEqual(missing.findings.map(entry => [entry.check, entry.form.label, entry.form.language]), [["MISSING_FORM_FOR_LABEL", "B", null]]);

  const outside = compareFormSetParity({ formSet: formSetRecord(["A"]), members: [member("A"), member("B")] });
  assert.ok(checksFor(outside.findings, "B").includes("LABEL_NOT_IN_SET"));

  const foreign = member("B");
  foreign.paper.formSet = { ...foreign.paper.formSet!, id: "another-set" };
  assert.ok(checksFor(compareFormSetParity({ formSet: formSetRecord(["A", "B"]), members: [member("A"), foreign] }).findings, "B").includes("FORM_SET_ID_MISMATCH"));

  const stale = member("B");
  stale.paper.formSet = { ...stale.paper.formSet!, blueprintHash: "0".repeat(64) };
  assert.ok(checksFor(compareFormSetParity({ formSet: formSetRecord(["A", "B"]), members: [member("A"), stale] }).findings, "B").includes("BLUEPRINT_HASH_NOT_RECOMPUTABLE"));

  const mislabelled = member("B");
  mislabelled.paper.formSet = { ...mislabelled.paper.formSet!, label: "C" };
  mislabelled.paper.language = "ar";
  const confused = checksFor(compareFormSetParity({ formSet: formSetRecord(["A", "B"]), members: [member("A"), mislabelled] }).findings, "B");
  assert.ok(confused.includes("FORM_LABEL_MISMATCH"));
  assert.ok(confused.includes("LANGUAGE_MISMATCH"));

  // A whole set agreeing on the wrong blueprint is still a failure, because the set record owns the key.
  const drifted = compareFormSetParity({ formSet: formSetRecord(["A", "B"], { blueprintHash: "f".repeat(64) }), members: [member("A"), member("B")] });
  assert.deepEqual([...new Set(drifted.findings.map(entry => entry.check))], ["BLUEPRINT_HASH_MISMATCH"]);
  assert.deepEqual([...new Set(drifted.findings.map(entry => entry.form.label))], ["A", "B"]);
});

test("the two language versions of one form are compared against the same reference as every other form", () => {
  const members = [member("A", "en"), member("A", "ar"), member("B", "en")];
  const report = compareFormSetParity({ formSet: formSetRecord(["A", "B"]), members });
  assert.equal(report.parity, true);
  assert.deepEqual(report.forms.map(entry => [entry.form.label, entry.form.language]), [["A", "en"], ["A", "ar"], ["B", "en"]]);
  // Both language versions of A carry the same item groups, so every item is shared between A and B here.
  assert.deepEqual(report.sharedItemGroupIds, ["group-q1", "group-q2", "group-q3"]);
  assert.deepEqual(report.changedItemGroupIds, []);

  const duplicated = compareFormSetParity({ formSet: formSetRecord(["A"]), members: [member("A", "en"), member("A", "en")] });
  assert.ok(duplicated.findings.some(entry => entry.check === "DUPLICATE_FORM_VERSION"));
});

test("a generated four-form set with one blueprint reaches parity through the same comparison the property sweep will use", () => {
  const generated = arbitraryPaper(xorshift(0x5ec0_0001), { edgeCase: "FOUR_FORMS_IDENTICAL_BLUEPRINT" });
  assert.equal(generated.forms.length, 4);
  const report = compareFormSetParity({ members: generated.forms.map(form => ({ label: form.label, language: form.paper.language, paper: form.paper })) });
  assert.deepEqual(report.findings, []);
  assert.equal(report.parity, true);
  // The generated forms carry no item groups, so item identity falls back to the question id and every item differs.
  assert.deepEqual(report.sharedItemGroupIds, []);
  assert.equal(report.changedItemGroupIds.length, generated.forms.reduce((sum, form) => sum + form.paper.questions.length, 0));
});

/* ------------------------------------------------------------------ the configured bound */

test("a school configures the form count down from the platform ceiling and can never configure it up", () => {
  const platformDefault = resolveDeliveryPolicy(null);
  assert.deepEqual(formCountIssues(["A", "B", "C", "D"], platformDefault), []);

  const narrowed = resolveDeliveryPolicy({ recordId: "policy-1", version: 3, data: { ...PLATFORM_DEFAULT_DELIVERY_POLICY, maxForms: 2 } });
  assert.equal(narrowed.source, "SCHOOL_POLICY");
  assert.deepEqual(formCountIssues(["A", "B"], narrowed), []);
  assert.deepEqual(formCountIssues(["A", "B", "C"], narrowed), [{ code: "EXCEEDS_POLICY_MAX_FORMS", limit: 2, declared: 3, source: "SCHOOL_POLICY" }]);

  // A record asking for more than the ceiling is unstorable, so resolution degrades to the default rather than widening.
  const widened = resolveDeliveryPolicy({ recordId: "policy-2", version: 1, data: { ...PLATFORM_DEFAULT_DELIVERY_POLICY, maxForms: 9 } });
  assert.equal(widened.source, "PLATFORM_DEFAULT");
  assert.equal(widened.defaultedBecause, "POLICY_UNREADABLE");
  assert.deepEqual(formCountIssues(["A", "B", "C", "D"], widened), []);
  assert.deepEqual(formCountIssues([], widened).map(issue => issue.code), ["NO_FORM_DECLARED"]);
  assert.deepEqual(formCountIssues(["A", "A"], widened).map(issue => issue.code), ["DUPLICATE_FORM_LABEL"]);

  const refused = formSetReleaseBlockers({ formSet: formSetRecord(["A", "B", "C"], { maxForms: 3 }), members: [member("A"), member("B"), member("C")], resolved: narrowed });
  assert.equal(refused.release, "REFUSED");
  assert.deepEqual(refused.blockers.map(blocker => blocker.code), ["EXCEEDS_POLICY_MAX_FORMS"]);
  assert.equal(refused.parity.parity, true, "the forms agree; it is the configured bound that refuses");
});

/* ------------------------------------------------------------------ the language comparison */

const numericPaper = (language: AssessmentLocale, mutate?: (paper: PaperData) => void) =>
  member("A", language, paper => {
    paper.questions[2] = { ...paper.questions[2], type: "NUMERIC", numericKey: { value: 4, tolerance: 0.5 } };
    paper.blueprint.sections[1].type = "NUMERIC";
    mutate?.(paper);
  });

test("the deterministic language comparison reports a marks difference and every key-structure difference, and shows both sides", () => {
  const english = numericPaper("en");
  const arabic = numericPaper("ar", paper => {
    paper.questions[0].marks = 3;
    paper.questions[1].options = [...paper.questions[1].options, { id: "a3", text: "6" }];
    paper.questions[2].numericKey = { value: 5, tolerance: 0.25 };
  });
  const comparison = compareLanguageVersions({ language: "en", paper: english.paper }, { language: "ar", paper: arabic.paper });

  assert.deepEqual(comparison.languages, { a: "en", b: "ar" });
  assert.deepEqual(comparison.pairs.map(pair => pair.itemGroupId), ["group-q1", "group-q2", "group-q3"]);
  // R9.3: the surface shows the shared outcome mapping, marks and key structure from this comparison alone.
  assert.deepEqual(comparison.pairs[0].a.key, { type: "SINGLE_CHOICE", marks: 2, optionCount: 2, correctOptionCount: 1, numericKey: null, outcomeIds: ["outcome-1"] });
  assert.deepEqual(comparison.pairs[2].a.key.numericKey, { value: 4, tolerance: 0.5 });
  assert.deepEqual(comparison.pairs.map(pair => pair.agreed), [false, false, false]);

  const observed = comparison.observations.map(observation => [observation.code, observation.itemGroupId, observation.field, observation.a.value, observation.b.value]);
  assert.deepEqual(observed, [
    ["MARKS_MISMATCH", "group-q1", "marks", 2, 3],
    ["KEY_STRUCTURE_MISMATCH", "group-q2", "optionCount", 2, 3],
    ["KEY_STRUCTURE_MISMATCH", "group-q3", "numericKey.value", 4, 5],
    ["KEY_STRUCTURE_MISMATCH", "group-q3", "numericKey.tolerance", 0.5, 0.25],
  ]);
  assert.deepEqual(comparison.observations.map(observation => observation.a.questionId), ["q1", "q2", "q3", "q3"]);
  assert.equal(comparison.blocking.length, 4);
  assert.deepEqual(unresolvedLanguageBlockers(comparison.observations).length, 4);

  const resolved: LanguageObservation[] = comparison.observations.map((observation, index) => (index === 0 ? { ...observation, resolvedBy: { actorId: "approver-1", at: "2026-05-01T08:00:00.000Z" } } : observation));
  assert.equal(unresolvedLanguageBlockers(resolved).length, 3);
});

test("a correct-option-count difference, a missing version and an unpaired item group are each reported, and only two codes refuse a release", () => {
  const english = member("A", "en");
  const arabic = member("A", "ar", paper => {
    paper.questions[0].correctOptionId = null;
    paper.questions[2].outcomeIds = ["outcome-2"];
    paper.questions[1] = { ...paper.questions[1], type: "SHORT_TEXT", options: [], correctOptionId: null };
    paper.itemGroupIds = { q1: "group-q1", q2: "group-q2", q3: "group-q3-only-arabic" };
  });
  const comparison = compareLanguageVersions({ language: "en", paper: english.paper }, { language: "ar", paper: arabic.paper });
  const codes = comparison.observations.map(observation => observation.code);
  assert.ok(codes.includes("KEY_STRUCTURE_MISMATCH"));
  assert.ok(codes.includes("TYPE_MISMATCH"));
  assert.equal(comparison.observations.filter(observation => observation.code === "MISSING_LANGUAGE_VERSION").length, 2, "group-q3 exists only in English and group-q3-only-arabic only in Arabic");

  // R9.8 names exactly two codes, so a type or outcome difference is reported without refusing a release.
  assert.deepEqual([...LANGUAGE_RELEASE_BLOCKING_CODES], ["MARKS_MISMATCH", "KEY_STRUCTURE_MISMATCH"]);
  for (const code of LANGUAGE_OBSERVATION_CODES) assert.equal(isLanguageReleaseBlocking(code), (LANGUAGE_RELEASE_BLOCKING_CODES as readonly string[]).includes(code));
  assert.ok(comparison.blocking.every(observation => isLanguageReleaseBlocking(observation.code)));

  const identical = compareLanguageVersions({ language: "en", paper: member("A", "en").paper }, { language: "ur", paper: member("A", "ur").paper });
  assert.deepEqual(identical.observations, []);
  assert.ok(identical.pairs.every(pair => pair.agreed));
  // A written item has no choice key to compare, which is a recorded zero rather than an absence.
  assert.deepEqual(keyStructureOf(member("A").paper.questions[2]), { type: "SHORT_TEXT", marks: 3, optionCount: 0, correctOptionCount: 0, numericKey: null, outcomeIds: ["outcome-1"] });

  // An unresolved mismatch refuses the release of the whole set.
  const refusal = formSetReleaseBlockers({ formSet: formSetRecord(["A"]), members: [member("A")], languageObservations: comparison.blocking });
  assert.equal(refusal.release, "REFUSED");
  assert.ok(refusal.blockers.every(blocker => blocker.code === "KEY_STRUCTURE_MISMATCH"));
});

/* ------------------------------------------------------------------ the model comparison is a proposal */

const proposal = (overrides: Record<string, unknown> = {}) => ({
  itemGroupId: "group-q1",
  finding: "NEGATION_ADDED",
  languages: { a: "en", b: "ar" },
  excerpts: { a: "What is 2 + 2?", b: "ما هو ناتج ٢ + ٢؟" },
  explanation: "The Arabic version appears to add a negation that the English version does not carry.",
  uncertainty: { method: "Model comparison of two item versions", confidence: 0.62, knownBenignCauses: ["An idiomatic negation that does not change the question."] },
  proposedBy: { model: "synthetic-model-1", at: "2026-05-01T08:00:00.000Z" },
  ...overrides,
});

test("a model comparison is a proposal carrying its uncertainty, awaiting a human decision, and with no shape in which an edit could travel", () => {
  const parsed = modelComparisonProposalSchema.parse(proposal());
  assert.equal(parsed.decision, undefined);
  assert.equal(parsed.uncertainty.knownBenignCauses.length, 1);

  // R9.6: the uncertainty is not optional, and a stated benign cause is not optional either.
  assert.equal(modelComparisonProposalSchema.safeParse({ ...proposal(), uncertainty: undefined }).success, false);
  assert.equal(modelComparisonProposalSchema.safeParse({ ...proposal(), uncertainty: { method: "Model comparison", confidence: 0.5, knownBenignCauses: [] } }).success, false);
  assert.equal(modelComparisonProposalSchema.safeParse({ ...proposal(), finding: "LOOKS_WRONG" }).success, false);

  // R9.7: every field through which an item edit could arrive is refused by the strict object.
  for (const field of ["patch", "prompt", "marks", "options", "correctOptionId", "numericKey", "rubric", "modelAnswer", "question", "review", "apply"]) {
    assert.equal(modelComparisonProposalSchema.safeParse({ ...proposal(), [field]: "anything" }).success, false, `a proposal must not accept ${field}`);
  }
  // And no export applies one: this module returns no modified question or paper.
  assert.deepEqual(Object.keys(formSetModule).filter(name => /apply|edit|rewrite|translate|patch|mutate/i.test(name)), []);

  const decided: ModelComparisonProposal = modelComparisonProposalSchema.parse(proposal({ decision: { outcome: "DISMISSED", actorId: "approver-1", at: "2026-05-01T09:00:00.000Z", reason: "The negation is idiomatic and the question is unchanged." } }));
  assert.deepEqual(proposalsAwaitingDecision([parsed, decided]), [parsed]);

  // Advisory, not blocking: R9.8 names only the deterministic codes.
  const precondition = formSetReleaseBlockers({ formSet: formSetRecord(["A"]), members: [member("A")], proposals: [parsed, decided] });
  assert.equal(precondition.release, "PERMITTED");
  assert.deepEqual(precondition.advisories, [{ severity: "ADVISORY", code: "MODEL_COMPARISON_AWAITING_DECISION", form: null, subject: "group-q1" }]);
});

/* ------------------------------------------------------------------ allocation */

const students = (count: number) => Array.from({ length: count }, (_unused, index) => `student-${String(index + 1).padStart(3, "0")}`);

test("one candidate receives exactly one form, deterministically, and a second run moves nobody", () => {
  const cohort = students(9);
  const first = allocateForms({ formSetId: FORM_SET_ID, labels: [...FORM_LABELS], studentIds: cohort });
  assert.deepEqual(first.allocations.map(allocation => allocation.studentId), cohort);
  assert.deepEqual(first.issues, []);
  assert.equal(new Set(first.allocations.map(allocation => allocation.studentId)).size, cohort.length);
  assert.deepEqual(first.perLabel.map(entry => [entry.formLabel, entry.studentIds.length]), [["A", 3], ["B", 2], ["C", 2], ["D", 2]]);
  // Adjacent identifiers land on different forms, which is what a seating plan needs.
  for (let index = 1; index < first.allocations.length; index += 1) assert.notEqual(first.allocations[index].formLabel, first.allocations[index - 1].formLabel);

  assert.deepEqual(allocateForms({ formSetId: FORM_SET_ID, labels: [...FORM_LABELS], studentIds: [...cohort].reverse() }).allocations, first.allocations, "the allocation is a function of the cohort, not of its arrival order");

  // The frozen half: a later enrolment allocates only the new candidate.
  const second = allocateForms({ formSetId: FORM_SET_ID, labels: [...FORM_LABELS], studentIds: [...cohort, "student-010"], existing: first.allocations });
  assert.deepEqual(second.unchanged, first.allocations);
  assert.deepEqual(second.added.map(allocation => allocation.studentId), ["student-010"]);
  for (const allocation of first.allocations) assert.equal(second.allocations.find(entry => entry.studentId === allocation.studentId)?.formLabel, allocation.formLabel);

  // A single-form sitting is the same code path.
  const single = allocateForms({ formSetId: FORM_SET_ID, labels: ["A"], studentIds: cohort });
  assert.deepEqual([...new Set(single.allocations.map(allocation => allocation.formLabel))], ["A"]);
});

test("an allocation carries the assignment that delivers its form, and every way the set could break R10.8 is named", () => {
  const withAssignments = allocateForms({ formSetId: FORM_SET_ID, labels: ["A", "B"], studentIds: students(4), assignmentIdByLabel: { A: "assignment-a", B: "assignment-b" } });
  assert.deepEqual(withAssignments.issues, []);
  for (const allocation of withAssignments.allocations) assert.equal(formAllocationSchema.safeParse(allocation).success, true);
  assert.deepEqual([...new Set(withAssignments.allocations.map(allocation => allocation.assignmentId))], ["assignment-a", "assignment-b"]);
  assert.deepEqual(allocateForms({ formSetId: FORM_SET_ID, labels: ["A", "B"], studentIds: ["student-001"], assignmentIdByLabel: { B: "assignment-b" } }).issues, [{ code: "NO_ASSIGNMENT_FOR_LABEL", studentId: "student-001", formLabel: "A" }]);

  const stored: FormAllocation[] = [
    { formSetId: FORM_SET_ID, studentId: "student-001", formLabel: "A", assignmentId: "assignment-a" },
    { formSetId: FORM_SET_ID, studentId: "student-001", formLabel: "B", assignmentId: "assignment-b" },
    { formSetId: FORM_SET_ID, studentId: "student-002", formLabel: "C", assignmentId: "assignment-c" },
    { formSetId: "another-set", studentId: "student-003", formLabel: "A", assignmentId: "assignment-a" },
  ];
  assert.deepEqual(allocationIssues({ formSetId: FORM_SET_ID, labels: ["A", "B"], studentIds: ["student-001", "student-002", "student-004"], allocations: stored }), [
    { code: "DUPLICATE_CANDIDATE_ALLOCATION", studentId: "student-001", formLabel: "B" },
    { code: "LABEL_NOT_IN_SET", studentId: "student-002", formLabel: "C" },
    { code: "FORM_SET_MISMATCH", studentId: "student-003", formLabel: "A" },
    { code: "UNALLOCATED_CANDIDATE", studentId: "student-004", formLabel: null },
  ]);
  assert.ok(allocationIssues({ formSetId: FORM_SET_ID, labels: ["A", "B"], allocations: stored }).every(issue => ALLOCATION_ISSUE_CODES.includes(issue.code)));

  // A duplicate in the stored rows is reported rather than silently resolved — that choice belongs to a human.
  const resolve = (studentId: string, allocations: readonly FormAllocation[] = stored) => resolveCandidateForm({ formSetId: FORM_SET_ID, allocations, studentId });
  assert.deepEqual(resolve("student-001"), { resolved: false, code: "DUPLICATE_CANDIDATE_ALLOCATION" });
  assert.deepEqual(resolve("student-002"), { resolved: true, formLabel: "C", assignmentId: "assignment-c" });
  assert.deepEqual(resolve("student-999"), { resolved: false, code: "NO_FORM_FOR_CANDIDATE" });
  // A candidate sitting a second assessment holds one allocation in each set, which is not a duplicate.
  assert.deepEqual(resolve("student-003"), { resolved: false, code: "NO_FORM_FOR_CANDIDATE" });
  assert.deepEqual(resolveCandidateForm({ formSetId: "another-set", allocations: stored, studentId: "student-003" }), { resolved: true, formLabel: "A", assignmentId: "assignment-a" });

  // The database is what makes the single allocation an invariant, and this module says so.
  assert.match(FORM_SET_DATABASE_INVARIANTS.oneFormPerCandidate, /@@unique\(\[formSetId, studentId\]\)/);
});

test("a candidate's form cannot change while an attempt is active, whatever else is wrong with the request", () => {
  const current: FormAllocation = { formSetId: FORM_SET_ID, studentId: "student-001", formLabel: "A", assignmentId: "assignment-a" };
  const labels: FormLabel[] = ["A", "B"];
  assert.deepEqual(formChangeDecision({ formSetId: FORM_SET_ID, labels, current, requestedLabel: "B", attemptActive: true }), { allowed: false, code: "ATTEMPT_ACTIVE" });
  // The active attempt is decided first, so no other refusal reason can mask it or let it through.
  assert.deepEqual(formChangeDecision({ formSetId: FORM_SET_ID, labels, current: null, requestedLabel: "B", attemptActive: true }), { allowed: false, code: "ATTEMPT_ACTIVE" });
  assert.deepEqual(formChangeDecision({ formSetId: FORM_SET_ID, labels, current, requestedLabel: "D", attemptActive: true }), { allowed: false, code: "ATTEMPT_ACTIVE" });

  assert.deepEqual(formChangeDecision({ formSetId: FORM_SET_ID, labels, current, requestedLabel: "B", attemptActive: false }), { allowed: true, change: "REALLOCATED", formLabel: "B" });
  assert.deepEqual(formChangeDecision({ formSetId: FORM_SET_ID, labels, current, requestedLabel: "A", attemptActive: false }), { allowed: true, change: "UNCHANGED", formLabel: "A" });
  assert.deepEqual(formChangeDecision({ formSetId: FORM_SET_ID, labels, current, requestedLabel: "D", attemptActive: false }), { allowed: false, code: "LABEL_NOT_IN_SET" });
  assert.deepEqual(formChangeDecision({ formSetId: FORM_SET_ID, labels, current: null, requestedLabel: "B", attemptActive: false }), { allowed: false, code: "NO_FORM_FOR_CANDIDATE" });
  assert.deepEqual(formChangeDecision({ formSetId: FORM_SET_ID, labels, current: { ...current, formSetId: "another-set" }, requestedLabel: "B", attemptActive: false }), { allowed: false, code: "FORM_SET_MISMATCH" });
});

/* ------------------------------------------------------------------ the scope of the claim */

test("parity is reported as a structural statement and never as equal difficulty", () => {
  assert.deepEqual([...FORM_SET_CLAIM_SCOPE.asserts], ["BLUEPRINT_SECTION_TOTALS", "MARKS_TOTAL", "OUTCOME_COVERAGE", "PER_SECTION_ITEM_ALLOCATION"]);
  assert.deepEqual([...FORM_SET_CLAIM_SCOPE.doesNotAssert], ["EQUAL_DIFFICULTY", "SCORE_COMPARABILITY", "STATISTICAL_FORM_EQUATING"]);
  assert.equal(FORM_SET_CLAIM_SCOPE.difficultyEvidence, "NOT_MEASURED");
  assert.ok(STUDIO_STATUS_TOKENS.includes(FORM_SET_CLAIM_SCOPE.difficultyEvidence), "the difficulty token is part of the single status vocabulary");

  const report = compareFormSetParity({ formSet: formSetRecord([...FORM_LABELS]), members: FORM_LABELS.map(label => member(label)) });
  assert.deepEqual(report.claimScope, FORM_SET_CLAIM_SCOPE, "every report carries the scope, so no surface can render parity without it");

  // No code this module emits can be read as a difficulty, equivalence or calibration claim.
  const emitted = [...PARITY_CHECKS, ...LANGUAGE_OBSERVATION_CODES, ...ALLOCATION_ISSUE_CODES, ...report.findings.map(entry => entry.check)];
  for (const code of emitted) assert.doesNotMatch(code, /EQUAL|EQUIVALEN|DIFFICULT|CALIBRAT|FAIR|PROOF/, `${code} would read as a claim this module cannot support`);
  assert.deepEqual(scanBannedTerms(JSON.stringify({ report, invariants: FORM_SET_DATABASE_INVARIANTS, scope: FORM_SET_CLAIM_SCOPE })), []);
});
