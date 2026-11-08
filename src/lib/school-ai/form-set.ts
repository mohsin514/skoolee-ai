import { z } from "zod";
import { canonicalDigest } from "./canonical";
import { MAX_FORMS_CEILING, maxFormsFor, type ResolvedDeliveryPolicy } from "./delivery-policy";
import { assessmentLanguageSchema, type AssessmentLocale, type Blueprint, type PaperData, type Question } from "./assessment";
import type { StudioStatusToken } from "./exam-studio-copy";

/**
 * Form sets, blueprint parity, the language comparison and form allocation
 * (SKO-408, Requirements 9.2–9.7, 10.1–10.3, and the allocation side of 10.8–10.10).
 *
 * Pure module: no I/O, no Prisma, no service import, no clock and no `process.env` read, so it runs
 * under `npm run test:school-ai`. Everything a database enforces is named in
 * `FORM_SET_DATABASE_INVARIANTS` rather than re-implemented here.
 *
 * Five things are structural rather than conventional.
 *
 * 1. **Parity is byte-identity of a blueprint projection, not a judgement.** Every comparison runs
 *    over `blueprintHashFor`, which is `canonicalDigest` applied to the projection below. Nothing in
 *    this module hashes anything itself.
 * 2. **The parity key excludes authored prose, because a form set spans languages.** A set holds one
 *    `PAPER` record per (form, language) and the blueprint's `title`, `instructions` and section
 *    titles are *translated* in each of them, so a digest over the whole blueprint could never agree
 *    across an English and an Arabic version of form A. `blueprintParityProjection` therefore keeps
 *    exactly what R10.3 names — the section mapping, the per-section totals, the marks total and the
 *    assessed outcomes — and drops every translated string. Section order is preserved (a reordered
 *    paper is not the same paper) while each section's `outcomeIds` are sorted, because that field is
 *    a set. The projection is exported so an independent verifier can recompute the key (R19.3).
 * 3. **The 4-form bound is enforced twice here and once in the release transaction.**
 *    `formSetSchema.labels` is `z.array(formLabelSchema).min(1).max(MAX_FORMS_CEILING)`, so a request
 *    cannot exceed it and a stored set cannot declare more labels than its own `maxForms`;
 *    `formCountIssues` compares the declared labels against the *school's* configured bound through
 *    `maxFormsFor`. The third place is task 10.2's re-read of the approved policy inside the release
 *    transaction, which this module deliberately does not attempt — it has no transaction.
 * 4. **A model comparison cannot edit an item (R9.7).** `modelComparisonProposalSchema` is strict and
 *    carries no prompt, marks, option, key, rubric or patch field, so there is no shape through which
 *    a proposal could travel as an edit; the compile-time guard below fails if one is ever added.
 *    This module exports no function that returns a modified `Question` or `PaperData`.
 * 5. **Nothing here claims the forms are equally difficult.** Parity is a structural statement, and
 *    `FORM_SET_CLAIM_SCOPE` records in codes what it does and does not assert, with difficulty
 *    evidence pinned to the `NOT_MEASURED` token of the status vocabulary. Every report carries that
 *    token, so a surface rendering a parity result has the disclaimer in hand and cannot present
 *    parity as score comparability. Findings are closed-set codes with structural detail — never
 *    prose — so the trilingual copy modules own every word a user reads.
 */

/* ------------------------------------------------------------------ labels */

export const FORM_LABELS = ["A", "B", "C", "D"] as const;
export const formLabelSchema = z.enum(FORM_LABELS);
export type FormLabel = z.infer<typeof formLabelSchema>;

/** Deterministic ordering for a reference form and for every reported list. */
const labelOrder = (label: FormLabel) => FORM_LABELS.indexOf(label);
const LANGUAGE_ORDER: readonly AssessmentLocale[] = ["en", "ar", "ur"];
const languageOrder = (language: AssessmentLocale) => LANGUAGE_ORDER.indexOf(language);
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `paperDataSchema.formSet.label` is the same closed set. This fails if the two ever diverge. */
type PaperFormLabel = NonNullable<PaperData["formSet"]>["label"];
type LabelsAgreeWithPaperData = [FormLabel] extends [PaperFormLabel] ? ([PaperFormLabel] extends [FormLabel] ? true : never) : never;
const labelsAgreeWithPaperData: LabelsAgreeWithPaperData = true;
void labelsAgreeWithPaperData;

/** A..D is the platform ceiling, so the label list and `deliveryPolicySchema.maxForms` cannot drift apart. */
type LabelCountIsTheCeiling = (typeof FORM_LABELS)["length"] extends typeof MAX_FORMS_CEILING ? true : never;
const labelCountIsTheCeiling: LabelCountIsTheCeiling = true;
void labelCountIsTheCeiling;

/* ------------------------------------------------------------------ the parity key */

/**
 * Hashed-object scheme version. It travels *inside* the hashed object because `blueprintHash` is a
 * bare 64-character digest with no scheme column beside it, unlike `SchoolAiExamFormRelease.hashScheme`.
 */
export const BLUEPRINT_HASH_SCHEME = 1;

/** Lowercase hex sha256, matching `canonicalDigest`, `paperDataSchema.formSet.blueprintHash` and `paperFigureSchema.sha256`. */
export const blueprintHashSchema = z.string().regex(/^[a-f0-9]{64}$/u, "A blueprint hash is a lowercase hexadecimal sha256 digest.");

export type BlueprintParityProjection = {
  scheme: number;
  durationMinutes: number;
  totalMarks: number;
  sections: Array<{ id: string; questionCount: number; answerCount: number; marksPerQuestion: number; type: Question["type"]; outcomeIds: string[] }>;
};

/** Exactly what R10.3 compares, and nothing a translator would touch. */
export function blueprintParityProjection(blueprint: Blueprint): BlueprintParityProjection {
  return {
    scheme: BLUEPRINT_HASH_SCHEME,
    durationMinutes: blueprint.durationMinutes,
    totalMarks: blueprint.totalMarks,
    sections: blueprint.sections.map(section => ({
      id: section.id,
      questionCount: section.questionCount,
      answerCount: section.answerCount,
      marksPerQuestion: section.marksPerQuestion,
      type: section.type,
      outcomeIds: [...section.outcomeIds].sort(byCodeUnit),
    })),
  };
}

/** The single writer of a blueprint parity key. */
export function blueprintHashFor(blueprint: Blueprint): string {
  return canonicalDigest(blueprintParityProjection(blueprint));
}

/** True when a recorded key is a statement about this blueprint rather than about an earlier one. */
export function verifyBlueprintHash(blueprint: Blueprint, recorded: string): boolean {
  return blueprintHashFor(blueprint) === recorded;
}

/* ------------------------------------------------------------------ the form set record */

const id = z.string().trim().min(1).max(120);

/**
 * Each status is a token of the frozen 16-word status vocabulary (R21.1), so a form set introduces
 * no new word into the interface. The guard below fails if one stops being a vocabulary token.
 */
export const FORM_SET_STATUSES = ["DRAFT", "READY_FOR_REVIEW", "APPROVED", "SEALED"] as const;
export const formSetStatusSchema = z.enum(FORM_SET_STATUSES);
export type FormSetStatus = z.infer<typeof formSetStatusSchema>;
type FormSetStatusesAreVocabularyTokens = FormSetStatus extends StudioStatusToken ? true : never;
const formSetStatusesAreVocabularyTokens: FormSetStatusesAreVocabularyTokens = true;
void formSetStatusesAreVocabularyTokens;

/**
 * Mirrors `SchoolAiExamFormSet`, with two deliberate differences.
 *
 * - `labels` has no column. The declared forms are materialized as one `SchoolAiRecord` of kind
 *   `PAPER` per (label, language) carrying `paperData.formSet`, and sealed per (label, language) in
 *   `SchoolAiExamFormRelease`. `labels` is the request-boundary declaration, which is where the
 *   schema bound does its work.
 * - `createdAt`/`updatedAt` are omitted: the domain compares no timestamp on this record.
 *
 * `schoolId` accepts the empty string because the column carries `@default("")`.
 */
export const formSetSchema = z
  .strictObject({
    id,
    schoolId: z.string().trim().max(120),
    campusId: id,
    briefRecordId: id,
    blueprintHash: blueprintHashSchema,
    labels: z.array(formLabelSchema).min(1).max(MAX_FORMS_CEILING),
    maxForms: z.number().int().min(1).max(MAX_FORMS_CEILING),
    status: formSetStatusSchema,
    version: z.number().int().min(1),
    createdById: id,
  })
  .refine(value => new Set(value.labels).size === value.labels.length, "A form set declares each form label at most once.")
  .refine(value => value.labels.length <= value.maxForms, "A form set cannot declare more forms than its own recorded maximum.");
export type FormSet = z.infer<typeof formSetSchema>;

/** What the database enforces, so no caller mistakes a check here for the invariant. */
export const FORM_SET_DATABASE_INVARIANTS = Object.freeze({
  /** R10.8 is a database invariant, not a code convention. Arrives with the slice-2 migration `20261014121000_school_ai_exam_studio_room`. */
  oneFormPerCandidate: "SchoolAiExamFormAllocation @@unique([formSetId, studentId])",
  /** One sealed release per form per language. */
  oneReleasePerFormPerLanguage: "SchoolAiExamFormRelease @@unique([formSetId, formLabel, language])",
  /** A paper version seals once. */
  aPaperVersionSealsOnce: "SchoolAiExamFormRelease @@unique([paperId, paperVersion, language])",
  /** A released set cannot be deleted out from under the hash a verifier recomputes. */
  formSetRetainedWhileReleased: "SchoolAiExamFormRelease.formSet onDelete: Restrict",
  /** R10.9/R10.10: a `FOR UPDATE` read of the allocation row plus an attempt existence check, in `exam-service.ts` (task 8.2). */
  noFormChangeWhileAttemptActive: "SchoolAiExamFormAllocation row lock + SchoolAiExamAttempt existence check",
  /** R10.9: every delivery path keys off `assignmentId`, so reload, recovery and scanning cannot disagree about the form. */
  oneAssignmentResolvesOneForm: "SchoolAiExamAssignment.formSetId + SchoolAiExamAssignment.formLabel",
} as const);

/** What a parity result asserts and what it does not, in codes. Difficulty is `NOT_MEASURED` until a calibration records it. */
export const FORM_DIFFICULTY_EVIDENCE: Extract<StudioStatusToken, "NOT_MEASURED"> = "NOT_MEASURED";
export const FORM_SET_CLAIM_SCOPE = Object.freeze({
  asserts: Object.freeze(["BLUEPRINT_SECTION_TOTALS", "MARKS_TOTAL", "OUTCOME_COVERAGE", "PER_SECTION_ITEM_ALLOCATION"] as const),
  doesNotAssert: Object.freeze(["EQUAL_DIFFICULTY", "SCORE_COMPARABILITY", "STATISTICAL_FORM_EQUATING"] as const),
  difficultyEvidence: FORM_DIFFICULTY_EVIDENCE,
} as const);

/* ------------------------------------------------------------------ form summaries */

/**
 * One record of the set: its label, its language and its paper. The label travels beside the paper
 * because a paper authored before the workbench existed carries no `formSet`, and because the pair is
 * what the caller is asserting — a disagreement with `paper.formSet` is itself a reported finding.
 */
export type FormSetMember = { label: FormLabel; language: AssessmentLocale; paper: PaperData };
export type FormVersionKey = { label: FormLabel; language: AssessmentLocale };

/**
 * Item identity across a form set is the item group id, falling back to the question id when the
 * paper records no group. The exposure ledger keys on the same identity, so "this cohort has seen
 * this item" and "these two forms share this item" are the same question asked twice.
 */
export function itemGroupIdFor(paper: PaperData, questionId: string): string {
  return paper.itemGroupIds?.[questionId] ?? questionId;
}

export function itemGroupIdsOf(paper: PaperData): string[] {
  return paper.questions.map(question => itemGroupIdFor(paper, question.id));
}

/** Assessed outcomes of a form, from its items rather than from its blueprint declaration. */
export function outcomeCoverageOf(paper: PaperData): string[] {
  return [...new Set(paper.questions.flatMap(question => question.outcomeIds))].sort(byCodeUnit);
}

/** Mirrors `equalMarks` in `assessment.ts`, which is private there and which this module may not edit. */
const sameNumber = (a: number, b: number) => Math.abs(a - b) < 0.00001;

export type FormSummary = {
  form: FormVersionKey;
  blueprintHash: string;
  recordedBlueprintHash: string | null;
  itemsPerSection: Array<{ sectionId: string; items: number }>;
  itemMarksTotal: number;
  itemGroupIds: string[];
  outcomeIds: string[];
};

export function summarizeForm(member: FormSetMember): FormSummary {
  const { label, language, paper } = member;
  return {
    form: { label, language },
    blueprintHash: blueprintHashFor(paper.blueprint),
    recordedBlueprintHash: paper.formSet?.blueprintHash ?? null,
    itemsPerSection: paper.blueprint.sections.map(section => ({ sectionId: section.id, items: paper.questions.filter(question => question.sectionId === section.id).length })),
    itemMarksTotal: paper.questions.reduce((sum, question) => sum + question.marks, 0),
    itemGroupIds: itemGroupIdsOf(paper),
    outcomeIds: outcomeCoverageOf(paper),
  };
}

/* ------------------------------------------------------------------ parity (R10.1–R10.4) */

export const PARITY_CHECKS = [
  "BLUEPRINT_HASH_MISMATCH",
  "BLUEPRINT_HASH_NOT_RECOMPUTABLE",
  "SECTION_SET_MISMATCH",
  "SECTION_TOTALS_MISMATCH",
  "MARKS_TOTAL_MISMATCH",
  "ITEM_MARKS_TOTAL_MISMATCH",
  "ITEM_ALLOCATION_MISMATCH",
  "OUTCOME_COVERAGE_MISMATCH",
  "MISSING_FORM_FOR_LABEL",
  "LABEL_NOT_IN_SET",
  "DUPLICATE_FORM_VERSION",
  "FORM_SET_ID_MISMATCH",
  "FORM_LABEL_MISMATCH",
  "LANGUAGE_MISMATCH",
] as const;
export type ParityCheck = (typeof PARITY_CHECKS)[number];

/**
 * One failing check against one form. `subject` names the section, outcome or label the check is
 * about; `expected` and `actual` carry the reference value and this form's value. Identifiers and
 * numbers only — the interface copy supplies every word.
 */
export type ParityFinding = {
  check: ParityCheck;
  form: { label: FormLabel; language: AssessmentLocale | null };
  subject: string | null;
  expected: string | number | null;
  actual: string | number | null;
};

export type FormParityReport = {
  /** True only when every declared label is present and every form satisfies every check. */
  parity: boolean;
  reference: FormVersionKey | null;
  /** The reference parity key: the form set's recorded hash when a set is supplied, otherwise the reference form's recomputed hash. */
  blueprintHash: string | null;
  findings: ParityFinding[];
  forms: Array<{ form: FormVersionKey; parity: boolean; findings: ParityFinding[]; summary: FormSummary }>;
  /** Item groups present in every declared label. */
  sharedItemGroupIds: string[];
  /** Item groups present in some declared labels but not all — the items that actually differ between forms. */
  changedItemGroupIds: string[];
  coverage: { sharedOutcomeIds: string[]; differingOutcomeIds: string[] };
  /** Carried on every report so no surface can render parity without the scope of the claim. */
  claimScope: typeof FORM_SET_CLAIM_SCOPE;
};

const finding = (check: ParityCheck, form: { label: FormLabel; language: AssessmentLocale | null }, subject: string | null = null, expected: string | number | null = null, actual: string | number | null = null): ParityFinding => ({ check, form, subject, expected, actual });

/**
 * Compares every form in a set against one reference form over the parity key, the section mapping,
 * the per-section item allocation, both marks totals and the assessed outcomes (R10.2, R10.3), and
 * reports which form fails which check (R10.4). Shared and changed item groups and the coverage
 * difference are reported alongside, because those are what an author needs to see about a set.
 *
 * Deterministic: the reference is the lowest declared label present, and within it the earliest of
 * en, ar, ur. Pure — it reads the members and nothing else.
 */
export function compareFormSetParity(input: { formSet?: FormSet | null; members: readonly FormSetMember[] }): FormParityReport {
  const { formSet } = input;
  const members = [...input.members].sort((a, b) => labelOrder(a.label) - labelOrder(b.label) || languageOrder(a.language) - languageOrder(b.language));
  const declared: FormLabel[] = formSet ? [...formSet.labels].sort((a, b) => labelOrder(a) - labelOrder(b)) : [...new Set(members.map(member => member.label))].sort((a, b) => labelOrder(a) - labelOrder(b));
  const summaries = new Map<FormSetMember, FormSummary>(members.map(member => [member, summarizeForm(member)]));
  const perForm = new Map<FormSetMember, ParityFinding[]>(members.map(member => [member, []]));
  const setFindings: ParityFinding[] = [];
  const add = (member: FormSetMember | null, value: ParityFinding) => (member ? perForm.get(member)!.push(value) : setFindings.push(value));

  // Membership first: a set whose labels and records disagree is not yet a set to compare.
  const seen = new Set<string>();
  for (const member of members) {
    const key = `${member.label}:${member.language}`;
    if (seen.has(key)) add(member, finding("DUPLICATE_FORM_VERSION", member, key));
    seen.add(key);
    if (!declared.includes(member.label)) add(member, finding("LABEL_NOT_IN_SET", member, member.label, declared.join(","), member.label));
    const recorded = member.paper.formSet;
    if (formSet && recorded && recorded.id !== formSet.id) add(member, finding("FORM_SET_ID_MISMATCH", member, null, formSet.id, recorded.id));
    if (recorded && recorded.label !== member.label) add(member, finding("FORM_LABEL_MISMATCH", member, null, member.label, recorded.label));
    if (member.paper.language !== member.language) add(member, finding("LANGUAGE_MISMATCH", member, null, member.language, member.paper.language));
    const summary = summaries.get(member)!;
    if (summary.recordedBlueprintHash !== null && summary.recordedBlueprintHash !== summary.blueprintHash) add(member, finding("BLUEPRINT_HASH_NOT_RECOMPUTABLE", member, null, summary.blueprintHash, summary.recordedBlueprintHash));
  }
  for (const label of declared) if (!members.some(member => member.label === label)) setFindings.push(finding("MISSING_FORM_FOR_LABEL", { label, language: null }, label));

  const reference = members.find(member => declared.includes(member.label)) ?? members[0] ?? null;
  const referenceSummary = reference ? summaries.get(reference)! : null;
  // A supplied set record is the authority on the key, so a whole set of forms sharing a wrong
  // blueprint is reported rather than treated as parity.
  const referenceHash = formSet?.blueprintHash ?? referenceSummary?.blueprintHash ?? null;

  if (reference && referenceSummary && referenceHash) {
    const referenceSections = new Map(reference.paper.blueprint.sections.map(section => [section.id, section]));
    for (const member of members) {
      if (member === reference && !formSet) continue;
      const summary = summaries.get(member)!;
      if (summary.blueprintHash !== referenceHash) add(member, finding("BLUEPRINT_HASH_MISMATCH", member, null, referenceHash, summary.blueprintHash));
      if (member === reference) continue;
      const sections = new Map(member.paper.blueprint.sections.map(section => [section.id, section]));
      for (const sectionId of [...new Set([...referenceSections.keys(), ...sections.keys()])].sort(byCodeUnit)) {
        const expected = referenceSections.get(sectionId);
        const actual = sections.get(sectionId);
        if (!expected || !actual) {
          add(member, finding("SECTION_SET_MISMATCH", member, sectionId, expected ? sectionId : null, actual ? sectionId : null));
          continue;
        }
        for (const field of ["questionCount", "answerCount", "marksPerQuestion"] as const) if (!sameNumber(expected[field], actual[field])) add(member, finding("SECTION_TOTALS_MISMATCH", member, `${sectionId}.${field}`, expected[field], actual[field]));
        if (expected.type !== actual.type) add(member, finding("SECTION_TOTALS_MISMATCH", member, `${sectionId}.type`, expected.type, actual.type));
        const expectedOutcomes = [...expected.outcomeIds].sort(byCodeUnit).join(",");
        const actualOutcomes = [...actual.outcomeIds].sort(byCodeUnit).join(",");
        if (expectedOutcomes !== actualOutcomes) add(member, finding("SECTION_TOTALS_MISMATCH", member, `${sectionId}.outcomeIds`, expectedOutcomes, actualOutcomes));
        const expectedItems = referenceSummary.itemsPerSection.find(row => row.sectionId === sectionId)?.items ?? 0;
        const actualItems = summary.itemsPerSection.find(row => row.sectionId === sectionId)?.items ?? 0;
        if (expectedItems !== actualItems) add(member, finding("ITEM_ALLOCATION_MISMATCH", member, sectionId, expectedItems, actualItems));
      }
      if (!sameNumber(reference.paper.blueprint.totalMarks, member.paper.blueprint.totalMarks)) add(member, finding("MARKS_TOTAL_MISMATCH", member, null, reference.paper.blueprint.totalMarks, member.paper.blueprint.totalMarks));
      if (!sameNumber(referenceSummary.itemMarksTotal, summary.itemMarksTotal)) add(member, finding("ITEM_MARKS_TOTAL_MISMATCH", member, null, referenceSummary.itemMarksTotal, summary.itemMarksTotal));
      for (const outcomeId of [...new Set([...referenceSummary.outcomeIds, ...summary.outcomeIds])].sort(byCodeUnit)) {
        const inReference = referenceSummary.outcomeIds.includes(outcomeId);
        const inMember = summary.outcomeIds.includes(outcomeId);
        if (inReference !== inMember) add(member, finding("OUTCOME_COVERAGE_MISMATCH", member, outcomeId, inReference ? outcomeId : null, inMember ? outcomeId : null));
      }
    }
  }

  // Shared and changed items are a statement about forms, not about language versions, so a label's
  // identities are the union over its language versions.
  const identitiesByLabel = declared.map(label => ({ label, identities: new Set(members.filter(member => member.label === label).flatMap(member => summaries.get(member)!.itemGroupIds)) })).filter(entry => entry.identities.size > 0);
  const allIdentities = [...new Set(identitiesByLabel.flatMap(entry => [...entry.identities]))].sort(byCodeUnit);
  const sharedItemGroupIds = allIdentities.filter(identity => identitiesByLabel.every(entry => entry.identities.has(identity)));
  const outcomesByLabel = declared.map(label => ({ label, outcomeIds: new Set(members.filter(member => member.label === label).flatMap(member => summaries.get(member)!.outcomeIds)) })).filter(entry => entry.outcomeIds.size > 0);
  const allOutcomes = [...new Set(outcomesByLabel.flatMap(entry => [...entry.outcomeIds]))].sort(byCodeUnit);
  const sharedOutcomeIds = allOutcomes.filter(outcomeId => outcomesByLabel.every(entry => entry.outcomeIds.has(outcomeId)));

  const forms = members.map(member => ({ form: { label: member.label, language: member.language }, parity: perForm.get(member)!.length === 0, findings: perForm.get(member)!, summary: summaries.get(member)! }));
  const findings = [...setFindings, ...forms.flatMap(entry => entry.findings)];
  return {
    parity: findings.length === 0 && members.length > 0,
    reference: reference ? { label: reference.label, language: reference.language } : null,
    blueprintHash: referenceHash,
    findings,
    forms,
    sharedItemGroupIds,
    changedItemGroupIds: allIdentities.filter(identity => !sharedItemGroupIds.includes(identity)),
    coverage: { sharedOutcomeIds, differingOutcomeIds: allOutcomes.filter(outcomeId => !sharedOutcomeIds.includes(outcomeId)) },
    claimScope: FORM_SET_CLAIM_SCOPE,
  };
}

/* ------------------------------------------------------------------ the configured form bound (R10.1) */

export const FORM_COUNT_ISSUE_CODES = ["EXCEEDS_POLICY_MAX_FORMS", "EXCEEDS_PLATFORM_CEILING", "DUPLICATE_FORM_LABEL", "NO_FORM_DECLARED"] as const;
export type FormCountIssueCode = (typeof FORM_COUNT_ISSUE_CODES)[number];
export type FormCountIssue = { code: FormCountIssueCode; limit: number; declared: number; source: ResolvedDeliveryPolicy["source"] | null };

/**
 * The second of the three places the bound is enforced: the school's configured maximum, clamped by
 * `maxFormsFor` so a value above the platform ceiling cannot widen it. The first is `formSetSchema`;
 * the third is task 10.2's re-read of the approved policy inside the release transaction, which a
 * pure module cannot perform.
 */
export function formCountIssues(labels: readonly FormLabel[], resolved?: ResolvedDeliveryPolicy | null): FormCountIssue[] {
  const issues: FormCountIssue[] = [];
  const declared = new Set(labels).size;
  const source = resolved?.source ?? null;
  if (labels.length === 0) issues.push({ code: "NO_FORM_DECLARED", limit: 1, declared: 0, source });
  if (declared !== labels.length) issues.push({ code: "DUPLICATE_FORM_LABEL", limit: declared, declared: labels.length, source });
  if (declared > MAX_FORMS_CEILING) issues.push({ code: "EXCEEDS_PLATFORM_CEILING", limit: MAX_FORMS_CEILING, declared, source });
  if (resolved) {
    const limit = maxFormsFor(resolved);
    if (declared > limit) issues.push({ code: "EXCEEDS_POLICY_MAX_FORMS", limit, declared, source });
  }
  return issues;
}

/* ------------------------------------------------------------------ the language comparison (R9.2–R9.7) */

/** The R9.5 fields exactly, plus the type and marks R9.3 and R9.4 need, for one item version. */
export type KeyStructure = { type: Question["type"]; marks: number; optionCount: number; correctOptionCount: number; numericKey: { value: number; tolerance: number } | null; outcomeIds: string[] };

export function keyStructureOf(question: Question): KeyStructure {
  const correctOptionCount = question.type === "MULTIPLE_CHOICE" ? (question.correctOptionIds?.length ?? 0) : question.correctOptionId === null ? 0 : 1;
  return {
    type: question.type,
    marks: question.marks,
    optionCount: question.options.length,
    correctOptionCount,
    numericKey: question.numericKey ? { value: question.numericKey.value, tolerance: question.numericKey.tolerance } : null,
    outcomeIds: [...question.outcomeIds].sort(byCodeUnit),
  };
}

export const LANGUAGE_OBSERVATION_CODES = ["MARKS_MISMATCH", "KEY_STRUCTURE_MISMATCH", "TYPE_MISMATCH", "OUTCOME_MAP_MISMATCH", "MISSING_LANGUAGE_VERSION", "DUPLICATE_ITEM_GROUP"] as const;
export type LanguageObservationCode = (typeof LANGUAGE_OBSERVATION_CODES)[number];

/** R9.8 names these two and no others, so only these refuse a release. The rest are advisory. */
export const LANGUAGE_RELEASE_BLOCKING_CODES = ["MARKS_MISMATCH", "KEY_STRUCTURE_MISMATCH"] as const;
export type LanguageBlockingCode = (typeof LANGUAGE_RELEASE_BLOCKING_CODES)[number];
export const isLanguageReleaseBlocking = (code: LanguageObservationCode): code is LanguageBlockingCode => (LANGUAGE_RELEASE_BLOCKING_CODES as readonly LanguageObservationCode[]).includes(code);

/**
 * A deterministic difference between two language versions of one item. `field` names which of the
 * R9.5 structures differs; `a` and `b` carry each side's question identifier and value. A resolution
 * is recorded on the observation, so "unresolved" in R9.8 is a property of the observation itself.
 */
export type LanguageObservation = {
  code: LanguageObservationCode;
  itemGroupId: string;
  field: string | null;
  a: { language: AssessmentLocale; questionId: string | null; value: string | number | null };
  b: { language: AssessmentLocale; questionId: string | null; value: string | number | null };
  resolvedBy: { actorId: string; at: string } | null;
};

export type LanguagePair = { itemGroupId: string; a: { questionId: string; key: KeyStructure }; b: { questionId: string; key: KeyStructure }; agreed: boolean };
export type LanguageVersion = { language: AssessmentLocale; paper: PaperData };
export type LanguageComparison = {
  languages: { a: AssessmentLocale; b: AssessmentLocale };
  /** Both versions of each joined item, with the shared outcome mapping, marks and key structure the review surface displays (R9.3). */
  pairs: LanguagePair[];
  observations: LanguageObservation[];
  /** The R9.8 subset: deterministic mismatches that refuse a release until resolved. */
  blocking: LanguageObservation[];
};

/**
 * Joins two language versions of one form on `itemGroupIds` and compares marks (R9.4) and key
 * structure — option count, correct option count, numeric key value and tolerance (R9.5). Both are
 * deterministic comparisons of recorded values; no model is involved and no item is modified.
 *
 * An item with no recorded group id joins on its question id, so a paper authored before item groups
 * existed still pairs when the two versions share question identifiers.
 */
export function compareLanguageVersions(a: LanguageVersion, b: LanguageVersion): LanguageComparison {
  const languages = { a: a.language, b: b.language };
  const index = (version: LanguageVersion) => {
    const map = new Map<string, Question>();
    const duplicates: string[] = [];
    for (const question of version.paper.questions) {
      const identity = itemGroupIdFor(version.paper, question.id);
      if (map.has(identity)) duplicates.push(identity);
      else map.set(identity, question);
    }
    return { map, duplicates };
  };
  const left = index(a);
  const right = index(b);
  const observations: LanguageObservation[] = [];
  const observe = (code: LanguageObservationCode, itemGroupId: string, field: string | null, aValue: string | number | null, bValue: string | number | null, aQuestionId: string | null, bQuestionId: string | null) =>
    observations.push({ code, itemGroupId, field, a: { language: a.language, questionId: aQuestionId, value: aValue }, b: { language: b.language, questionId: bQuestionId, value: bValue }, resolvedBy: null });

  for (const identity of [...new Set([...left.duplicates, ...right.duplicates])].sort(byCodeUnit)) observe("DUPLICATE_ITEM_GROUP", identity, null, left.duplicates.includes(identity) ? identity : null, right.duplicates.includes(identity) ? identity : null, null, null);

  const pairs: LanguagePair[] = [];
  for (const identity of [...new Set([...left.map.keys(), ...right.map.keys()])].sort(byCodeUnit)) {
    const first = left.map.get(identity);
    const second = right.map.get(identity);
    if (!first || !second) {
      observe("MISSING_LANGUAGE_VERSION", identity, null, first?.id ?? null, second?.id ?? null, first?.id ?? null, second?.id ?? null);
      continue;
    }
    const keyA = keyStructureOf(first);
    const keyB = keyStructureOf(second);
    const before = observations.length;
    if (!sameNumber(keyA.marks, keyB.marks)) observe("MARKS_MISMATCH", identity, "marks", keyA.marks, keyB.marks, first.id, second.id);
    if (keyA.type !== keyB.type) observe("TYPE_MISMATCH", identity, "type", keyA.type, keyB.type, first.id, second.id);
    if (keyA.optionCount !== keyB.optionCount) observe("KEY_STRUCTURE_MISMATCH", identity, "optionCount", keyA.optionCount, keyB.optionCount, first.id, second.id);
    if (keyA.correctOptionCount !== keyB.correctOptionCount) observe("KEY_STRUCTURE_MISMATCH", identity, "correctOptionCount", keyA.correctOptionCount, keyB.correctOptionCount, first.id, second.id);
    if ((keyA.numericKey === null) !== (keyB.numericKey === null)) observe("KEY_STRUCTURE_MISMATCH", identity, "numericKey", keyA.numericKey ? "PRESENT" : "ABSENT", keyB.numericKey ? "PRESENT" : "ABSENT", first.id, second.id);
    else if (keyA.numericKey && keyB.numericKey) {
      if (!sameNumber(keyA.numericKey.value, keyB.numericKey.value)) observe("KEY_STRUCTURE_MISMATCH", identity, "numericKey.value", keyA.numericKey.value, keyB.numericKey.value, first.id, second.id);
      if (!sameNumber(keyA.numericKey.tolerance, keyB.numericKey.tolerance)) observe("KEY_STRUCTURE_MISMATCH", identity, "numericKey.tolerance", keyA.numericKey.tolerance, keyB.numericKey.tolerance, first.id, second.id);
    }
    const outcomesA = keyA.outcomeIds.join(",");
    const outcomesB = keyB.outcomeIds.join(",");
    if (outcomesA !== outcomesB) observe("OUTCOME_MAP_MISMATCH", identity, "outcomeIds", outcomesA, outcomesB, first.id, second.id);
    pairs.push({ itemGroupId: identity, a: { questionId: first.id, key: keyA }, b: { questionId: second.id, key: keyB }, agreed: observations.length === before });
  }
  return { languages, pairs, observations, blocking: observations.filter(observation => isLanguageReleaseBlocking(observation.code)) };
}

/** R9.8: the deterministic mismatches still carrying no resolution. */
export function unresolvedLanguageBlockers(observations: readonly LanguageObservation[]): LanguageObservation[] {
  return observations.filter(observation => isLanguageReleaseBlocking(observation.code) && observation.resolvedBy === null);
}

/* ------------------------------------------------------------------ the model comparison is a proposal (R9.6, R9.7) */

export const MODEL_COMPARISON_FINDINGS = ["CHANGED_MEANING", "NEGATION_ADDED", "NEGATION_REMOVED", "CHANGED_UNIT", "CHANGED_NOTATION"] as const;
export const modelComparisonFindingSchema = z.enum(MODEL_COMPARISON_FINDINGS);
export type ModelComparisonFinding = z.infer<typeof modelComparisonFindingSchema>;

/** Signal_Uncertainty: the confidence bound, the detection method and the stated known benign causes. */
export const signalUncertaintySchema = z.strictObject({
  method: z.string().trim().min(3).max(160),
  confidence: z.number().min(0).max(1),
  knownBenignCauses: z.array(z.string().trim().min(3).max(240)).min(1).max(10),
});
export type SignalUncertainty = z.infer<typeof signalUncertaintySchema>;

export const LANGUAGE_DECISION_OUTCOMES = ["ACCEPTED", "DISMISSED", "CORRECTION_REQUESTED"] as const;
export const languageDecisionSchema = z.strictObject({
  outcome: z.enum(LANGUAGE_DECISION_OUTCOMES),
  actorId: id,
  at: z.iso.datetime(),
  reason: z.string().trim().min(1).max(500),
});

/**
 * A model observation over two language versions. Strict, and carrying no item content beyond the
 * excerpt it is about: there is no prompt, option, marks, key, rubric or patch field, so a proposal
 * has no shape in which an edit could travel (R9.7). It is advisory until `decision` is recorded by a
 * human (R9.6).
 */
export const modelComparisonProposalSchema = z.strictObject({
  itemGroupId: id,
  finding: modelComparisonFindingSchema,
  languages: z.strictObject({ a: assessmentLanguageSchema, b: assessmentLanguageSchema }),
  /** What the model read, quoted, so a reviewer checks the observation against the item rather than trusting it. */
  excerpts: z.strictObject({ a: z.string().max(2000), b: z.string().max(2000) }),
  explanation: z.string().trim().min(1).max(1000),
  uncertainty: signalUncertaintySchema,
  proposedBy: z.strictObject({ model: z.string().trim().min(1).max(200), at: z.iso.datetime() }),
  decision: languageDecisionSchema.optional(),
});
export type ModelComparisonProposal = z.infer<typeof modelComparisonProposalSchema>;

/** R9.7, checked by the compiler: no field of a proposal could be read as an item edit. */
type ProposalCarriesNoItemEdit = Extract<keyof ModelComparisonProposal, "patch" | "question" | "questions" | "prompt" | "marks" | "options" | "correctOptionId" | "correctOptionIds" | "numericKey" | "rubric" | "modelAnswer" | "review" | "apply"> extends never ? true : never;
const proposalCarriesNoItemEdit: ProposalCarriesNoItemEdit = true;
void proposalCarriesNoItemEdit;

/** R9.6: a model comparison takes effect only through an explicit human decision. */
export function proposalsAwaitingDecision(proposals: readonly ModelComparisonProposal[]): ModelComparisonProposal[] {
  return proposals.filter(proposal => proposal.decision === undefined);
}

/* ------------------------------------------------------------------ allocation (R10.8–R10.10) */

/**
 * Mirrors the domain columns of `SchoolAiExamFormAllocation`, which arrives with the slice-2
 * migration. `assignmentId` is nullable here and non-null in the row: an allocation is planned before
 * the per-form assignments exist, and task 8.2 writes the row once it has them.
 */
export const formAllocationSchema = z.strictObject({
  formSetId: id,
  studentId: id,
  formLabel: formLabelSchema,
  assignmentId: id.nullable(),
});
export type FormAllocation = z.infer<typeof formAllocationSchema>;

export const ALLOCATION_ISSUE_CODES = ["DUPLICATE_CANDIDATE_ALLOCATION", "LABEL_NOT_IN_SET", "FORM_SET_MISMATCH", "NO_ASSIGNMENT_FOR_LABEL", "UNALLOCATED_CANDIDATE"] as const;
export type AllocationIssueCode = (typeof ALLOCATION_ISSUE_CODES)[number];
export type AllocationIssue = { code: AllocationIssueCode; studentId: string | null; formLabel: FormLabel | null };

export type AllocationPlan = {
  allocations: FormAllocation[];
  /** Candidates allocated by this call. */
  added: FormAllocation[];
  /** Candidates whose existing allocation this call left exactly as it was — the pure half of "the form is frozen". */
  unchanged: FormAllocation[];
  perLabel: Array<{ formLabel: FormLabel; studentIds: string[] }>;
  issues: AllocationIssue[];
};

/**
 * Allocates one form to each candidate, and only to candidates who do not already have one.
 *
 * Deterministic and idempotent: candidates are sorted by identifier in code-unit order and dealt
 * round-robin across the declared labels, so the same cohort always produces the same allocation and
 * a second call over a superset of the cohort never moves an already-allocated candidate. Adjacent
 * identifiers land on different forms, which is the useful property for a seating plan.
 *
 * This function proposes; the database decides. `@@unique([formSetId, studentId])` is what makes
 * "exactly one form per candidate" an invariant (R10.8) — see `FORM_SET_DATABASE_INVARIANTS`. An
 * existing allocation for another form set is reported as `FORM_SET_MISMATCH` rather than ignored.
 */
export function allocateForms(input: { formSetId: string; labels: readonly FormLabel[]; studentIds: readonly string[]; existing?: readonly FormAllocation[]; assignmentIdByLabel?: Readonly<Partial<Record<FormLabel, string>>> }): AllocationPlan {
  const labels = [...new Set(input.labels)].sort((a, b) => labelOrder(a) - labelOrder(b));
  const issues: AllocationIssue[] = [];
  const held = new Map<string, FormAllocation>();
  for (const allocation of input.existing ?? []) {
    if (allocation.formSetId !== input.formSetId) {
      issues.push({ code: "FORM_SET_MISMATCH", studentId: allocation.studentId, formLabel: allocation.formLabel });
      continue;
    }
    if (held.has(allocation.studentId)) {
      issues.push({ code: "DUPLICATE_CANDIDATE_ALLOCATION", studentId: allocation.studentId, formLabel: allocation.formLabel });
      continue;
    }
    if (!labels.includes(allocation.formLabel)) issues.push({ code: "LABEL_NOT_IN_SET", studentId: allocation.studentId, formLabel: allocation.formLabel });
    held.set(allocation.studentId, allocation);
  }
  const unchanged: FormAllocation[] = [];
  const added: FormAllocation[] = [];
  const candidates = [...new Set(input.studentIds)].sort(byCodeUnit);
  if (!labels.length) {
    for (const studentId of candidates) if (!held.has(studentId)) issues.push({ code: "UNALLOCATED_CANDIDATE", studentId, formLabel: null });
    return { allocations: [...held.values()], added, unchanged: [...held.values()], perLabel: [], issues };
  }
  let dealt = 0;
  for (const studentId of candidates) {
    const existing = held.get(studentId);
    if (existing) {
      unchanged.push(existing);
      continue;
    }
    const formLabel = labels[dealt % labels.length];
    dealt += 1;
    const assignmentId = input.assignmentIdByLabel?.[formLabel] ?? null;
    if (input.assignmentIdByLabel && assignmentId === null) issues.push({ code: "NO_ASSIGNMENT_FOR_LABEL", studentId, formLabel });
    const allocation: FormAllocation = { formSetId: input.formSetId, studentId, formLabel, assignmentId };
    held.set(studentId, allocation);
    added.push(allocation);
  }
  const allocations = [...held.values()].sort((a, b) => byCodeUnit(a.studentId, b.studentId));
  return { allocations, added, unchanged, perLabel: labels.map(formLabel => ({ formLabel, studentIds: allocations.filter(allocation => allocation.formLabel === formLabel).map(allocation => allocation.studentId) })), issues };
}

/** Every way a stored allocation set could fail R10.8, reported rather than thrown so a surface can name each candidate. */
export function allocationIssues(input: { formSetId: string; labels: readonly FormLabel[]; studentIds?: readonly string[]; allocations: readonly FormAllocation[] }): AllocationIssue[] {
  const labels = new Set(input.labels);
  const issues: AllocationIssue[] = [];
  const seen = new Set<string>();
  for (const allocation of input.allocations) {
    if (allocation.formSetId !== input.formSetId) issues.push({ code: "FORM_SET_MISMATCH", studentId: allocation.studentId, formLabel: allocation.formLabel });
    else if (seen.has(allocation.studentId)) issues.push({ code: "DUPLICATE_CANDIDATE_ALLOCATION", studentId: allocation.studentId, formLabel: allocation.formLabel });
    if (!labels.has(allocation.formLabel)) issues.push({ code: "LABEL_NOT_IN_SET", studentId: allocation.studentId, formLabel: allocation.formLabel });
    seen.add(allocation.studentId);
  }
  for (const studentId of new Set(input.studentIds ?? [])) if (!seen.has(studentId)) issues.push({ code: "UNALLOCATED_CANDIDATE", studentId, formLabel: null });
  return issues;
}

export const FORM_RESOLUTION_REFUSALS = ["NO_FORM_FOR_CANDIDATE", "DUPLICATE_CANDIDATE_ALLOCATION"] as const;
export type FormResolution = { resolved: true; formLabel: FormLabel; assignmentId: string | null } | { resolved: false; code: (typeof FORM_RESOLUTION_REFUSALS)[number] };

/**
 * The one form a candidate sits in one form set. Reload, reconnect, session takeover, expiry and
 * paper-script scanning all reach a form through the candidate's single assignment, so none of them
 * ever chooses one; this is the pure counterpart of that lookup.
 *
 * Scoped by `formSetId`, because a candidate sitting two different assessments holds one allocation
 * in each. Within one set, more than one row is exactly what `@@unique([formSetId, studentId])`
 * forbids, so it is refused rather than resolved — picking one would hide a broken invariant.
 */
export function resolveCandidateForm(input: { formSetId: string; allocations: readonly FormAllocation[]; studentId: string }): FormResolution {
  const matches = input.allocations.filter(allocation => allocation.studentId === input.studentId && allocation.formSetId === input.formSetId);
  if (matches.length === 0) return { resolved: false, code: "NO_FORM_FOR_CANDIDATE" };
  if (matches.length > 1) return { resolved: false, code: "DUPLICATE_CANDIDATE_ALLOCATION" };
  return { resolved: true, formLabel: matches[0].formLabel, assignmentId: matches[0].assignmentId };
}

export const FORM_CHANGE_REFUSALS = ["ATTEMPT_ACTIVE", "LABEL_NOT_IN_SET", "NO_FORM_FOR_CANDIDATE", "FORM_SET_MISMATCH"] as const;
export type FormChangeDecision = { allowed: true; change: "UNCHANGED" | "REALLOCATED"; formLabel: FormLabel } | { allowed: false; code: (typeof FORM_CHANGE_REFUSALS)[number] };

/**
 * R10.10. An active attempt refuses the change first, before any other reason, so no ordering of
 * checks can let a candidate's form move under them mid-attempt. `attemptActive` is the caller's
 * observation inside the same transaction as its row lock — this module has neither.
 */
export function formChangeDecision(input: { formSetId: string; labels: readonly FormLabel[]; current: FormAllocation | null; requestedLabel: FormLabel; attemptActive: boolean }): FormChangeDecision {
  if (input.attemptActive) return { allowed: false, code: "ATTEMPT_ACTIVE" };
  if (!input.current) return { allowed: false, code: "NO_FORM_FOR_CANDIDATE" };
  if (input.current.formSetId !== input.formSetId) return { allowed: false, code: "FORM_SET_MISMATCH" };
  if (!input.labels.includes(input.requestedLabel)) return { allowed: false, code: "LABEL_NOT_IN_SET" };
  return { allowed: true, change: input.current.formLabel === input.requestedLabel ? "UNCHANGED" : "REALLOCATED", formLabel: input.requestedLabel };
}

/* ------------------------------------------------------------------ the whole-set release precondition (R10.4, R9.8) */

export type FormSetReleaseBlocker = {
  severity: Extract<StudioStatusToken, "BLOCKING" | "ADVISORY">;
  code: ParityCheck | FormCountIssueCode | LanguageObservationCode | "MODEL_COMPARISON_AWAITING_DECISION";
  form: { label: FormLabel; language: AssessmentLocale | null } | null;
  subject: string | null;
};

export type FormSetReleasePrecondition = {
  /** R10.4: a failing form refuses the whole set, never just itself. */
  release: "PERMITTED" | "REFUSED";
  blockers: FormSetReleaseBlocker[];
  advisories: FormSetReleaseBlocker[];
  parity: FormParityReport;
};

/**
 * The form-set half of the release preconditions: blueprint parity across the set (R10.3, R10.4), the
 * configured form bound (R10.1) and the unresolved deterministic language mismatches (R9.8). The
 * release service composes this with its own checks and re-reads the approved policy inside its
 * transaction; a refusal here applies to the whole set, which is what R10.4 requires.
 *
 * Model comparison proposals awaiting a decision are advisory, because R9.8 names only the two
 * deterministic codes. They are reported so the approver sees them, and they never block by default.
 */
export function formSetReleaseBlockers(input: { formSet?: FormSet | null; members: readonly FormSetMember[]; resolved?: ResolvedDeliveryPolicy | null; languageObservations?: readonly LanguageObservation[]; proposals?: readonly ModelComparisonProposal[] }): FormSetReleasePrecondition {
  const parity = compareFormSetParity({ formSet: input.formSet, members: input.members });
  const labels = input.formSet?.labels ?? [...new Set(input.members.map(member => member.label))];
  const blockers: FormSetReleaseBlocker[] = [
    ...parity.findings.map(entry => ({ severity: "BLOCKING" as const, code: entry.check, form: entry.form, subject: entry.subject })),
    ...formCountIssues(labels, input.resolved).map(entry => ({ severity: "BLOCKING" as const, code: entry.code, form: null, subject: `${entry.declared}/${entry.limit}` })),
    ...unresolvedLanguageBlockers(input.languageObservations ?? []).map(entry => ({ severity: "BLOCKING" as const, code: entry.code, form: null, subject: entry.itemGroupId })),
  ];
  const advisories: FormSetReleaseBlocker[] = proposalsAwaitingDecision(input.proposals ?? []).map(proposal => ({ severity: "ADVISORY" as const, code: "MODEL_COMPARISON_AWAITING_DECISION" as const, form: null, subject: proposal.itemGroupId }));
  return { release: blockers.length ? "REFUSED" : "PERMITTED", blockers, advisories, parity };
}
