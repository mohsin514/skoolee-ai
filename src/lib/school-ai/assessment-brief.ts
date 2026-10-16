import { z } from "zod";
import { assessmentLanguageSchema } from "./assessment";
import { MAX_FORMS_CEILING, deliveryTierSchema } from "./delivery-policy";

/**
 * Assessment Brief (SKO-408, Requirement 3).
 *
 * Pure module: no I/O, no Prisma, no service import, no `process.env` read, no clock of its own —
 * every timestamp arrives as an argument. Runnable under `npm run test:school-ai`. The brief is
 * stored as a `SchoolAiRecord` of kind `BRIEF`, so it inherits versioning, `APPROVED` status,
 * immutable `SchoolAiRevision` snapshots, campus scoping, compare-and-set on version and audit
 * logging with no migration (R3.9, R3.13). This module owns the schema and the pure decisions only.
 *
 * Four things are structural here rather than conventional.
 *
 * 1. **A value is exactly one of three classifications, by construction.** `briefValueSchema` is a
 *    discriminated union over `classification`, so `Confirmed_Fact`, `Extracted_Suggestion` and
 *    `Open_Decision` are three disjoint shapes rather than three readings of one shape (R3.2). Each
 *    variant's evidence is required *by that variant*: a fact cannot exist without its confirming
 *    actor, authoritative timestamp and scope (R3.3), and a suggestion cannot exist without its
 *    source record, source version, page or region reference and exact excerpt (R3.4).
 * 2. **Every key in the sequence always holds a classification.** `decisions` is an exhaustive
 *    record over `BRIEF_QUESTION_SEQUENCE`, so a key cannot be silently undecided by being absent —
 *    an unanswered decision is a stored `OPEN_DECISION`, which is what `nextOpenDecision` reads
 *    (R3.1) and what the readiness summary lists (R3.8).
 * 3. **No value is derived without an explicit confirmation (R3.11).** Nothing in this module
 *    accepts conversation text as a value. The only text an unanswered decision can hold is
 *    `lastEnteredText`, which lives on the `OPEN_DECISION` variant and therefore cannot be read as
 *    a decided value; a suggestion is pinned to `reviewed: false`; and the single path from a
 *    suggestion to a fact is `acceptSuggestion`, which demands a named actor and a timestamp.
 * 4. **Accepting a suggestion cannot lose the suggestion (R3.5).** `acceptSuggestion` writes the
 *    acceptance event and the original suggestion together: `briefHistoryEntrySchema` refuses an
 *    `ACCEPTED_SUGGESTION` event that carries no `retainedSuggestion`, and refuses a
 *    `retainedSuggestion` under any other event. History is append-only here — no function in this
 *    module rewrites or drops an entry, and a brief whose history is full is refused rather than
 *    trimmed.
 *
 * The shape of the interaction — one missing decision at a time, over confirmed facts, suggestions
 * and unknowns — is the shape `./onboarding` already implements for guided setup, and this module
 * follows it rather than inventing a second one: an ordered question sequence
 * (`BRIEF_QUESTION_SEQUENCE` beside `SETUP_ANSWER_KEYS`), a cursor over the first unanswered
 * question (`nextOpenDecision` beside `setupQuestions`), a per-question validation bound
 * (`validateBriefAnswer` beside `validateSetupAnswer`) and a readiness summary over what is still
 * missing (`briefReadiness` beside `setupReadiness`). It differs in one deliberate way: guided setup
 * records confirmation as a `confirmedKeys` list beside the answers, while a brief carries the
 * classification *inside* each value, because R3.2 requires the classification to travel with the
 * value and be displayed with it.
 */

/* ------------------------------------------------------------------ identifiers */

/** The identifier bound used by the existing assessment records (`./assessment`). */
const id = z.string().trim().min(1).max(120);

/**
 * Mirrors `workspaceIdSchema` in `./schemas`, which validates the teaching scope that
 * `assertWorkspaceSubject` reads off a record body. It is declared here rather than imported
 * because `./schemas` imports *this* module to register the `BRIEF` body, and a cycle would leave
 * one of the two schemas undefined at module evaluation.
 */
const recordId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/u);

/* ------------------------------------------------------------------ the three classifications (R3.2) */

export const FACT_CLASSIFICATIONS = ["CONFIRMED_FACT", "EXTRACTED_SUGGESTION", "OPEN_DECISION"] as const;
export const factClassificationSchema = z.enum(FACT_CLASSIFICATIONS);
export type FactClassification = z.infer<typeof factClassificationSchema>;

/**
 * `z.unknown()` alone also accepts an absent key, which would let a confirmed fact carry no value
 * at all. A decided value is present; its *shape* is then checked against the bound for its own
 * question key by `assessmentBriefSchema`.
 */
const decidedValue = z.unknown().refine(value => value !== undefined, "A classified brief value carries the value that was decided.");

/** The scope a confirmed fact is confirmed *for* (R3.3). `campusId` is nullable to match the record column. */
export const briefScopeSchema = z.strictObject({
  schoolId: id,
  campusId: id.nullable(),
  classId: id,
  subjectId: id,
});
export type BriefScope = z.infer<typeof briefScopeSchema>;

/** Where a suggestion came from. A school default is a suggestion labelled as one (R3.7), never a fact. */
export const SUGGESTION_ORIGINS = ["APPROVED_SOURCE", "SCHOOL_DEFAULT", "PROVIDER"] as const;
export const suggestionOriginSchema = z.enum(SUGGESTION_ORIGINS);
export type SuggestionOrigin = z.infer<typeof suggestionOriginSchema>;

/**
 * A value a named authorized human being confirmed, with actor, authoritative timestamp and scope
 * (R3.3). `acceptedFrom` is present exactly when the fact came from accepting a suggestion, and
 * points at the source version that suggestion quoted; the suggestion itself is retained in the
 * brief history (R3.5).
 */
export const confirmedFactSchema = z.strictObject({
  classification: z.literal("CONFIRMED_FACT"),
  value: decidedValue,
  actorId: id,
  at: z.iso.datetime(),
  scope: briefScopeSchema,
  acceptedFrom: z.strictObject({ sourceId: id, sourceVersion: z.number().int().positive() }).optional(),
});
export type ConfirmedFact = z.infer<typeof confirmedFactSchema>;

/**
 * A value read out of an approved source, a school default or a provider response, carrying the
 * source record identifier, the source version, the page or region reference and the exact excerpt
 * (R3.4). `reviewed` is pinned to `false`: a suggestion that claimed to be reviewed would be a fact
 * without a confirming actor, which this union has no shape for (R3.11).
 */
export const extractedSuggestionSchema = z.strictObject({
  classification: z.literal("EXTRACTED_SUGGESTION"),
  value: decidedValue,
  sourceId: id,
  sourceVersion: z.number().int().positive(),
  /** The page or region of the source the excerpt was read from. */
  reference: z.string().trim().min(1).max(200),
  /** The source text itself, quoted exactly, so the author confirms against evidence rather than a paraphrase. */
  excerpt: z.string().trim().min(1).max(3000),
  origin: suggestionOriginSchema,
  reviewed: z.literal(false),
});
export type ExtractedSuggestion = z.infer<typeof extractedSuggestionSchema>;

/**
 * A decision that has not been made. It holds no value — there is no field for one — so an
 * unanswered or skipped question cannot be read as an answer. `skipped` records that the author
 * answered `skip` or `unknown` and the assistant moved on (R3.6); `lastEnteredText` retains an
 * answer that failed its validation bound, for correction (R3.12).
 */
export const openDecisionSchema = z.strictObject({
  classification: z.literal("OPEN_DECISION"),
  skipped: z.boolean(),
  lastEnteredText: z.string().max(2000).optional(),
});
export type OpenDecision = z.infer<typeof openDecisionSchema>;

export const briefValueSchema = z.discriminatedUnion("classification", [confirmedFactSchema, extractedSuggestionSchema, openDecisionSchema]);
export type BriefValue = z.infer<typeof briefValueSchema>;

/* ------------------------------------------------------------------ the question sequence (R3.1) */

/**
 * The nine decisions of an Assessment_Brief, in the order they are asked. The order is the
 * presentation order of R3.1 and the resume order of R3.10, so it is data rather than a sequence of
 * screens: `subject` and `class` first because they scope everything after them, `taughtCoverage`
 * before the shape of the paper because coverage bounds what may be assessed, and `deliveryTier`
 * and `accommodationIntent` last because they describe the sitting rather than the paper.
 */
export const BRIEF_QUESTION_SEQUENCE = [
  "subject", "class", "taughtCoverage", "durationMinutes", "totalMarks",
  "languages", "formCount", "deliveryTier", "accommodationIntent",
] as const;
export const briefQuestionKeySchema = z.enum(BRIEF_QUESTION_SEQUENCE);
export type BriefQuestionKey = z.infer<typeof briefQuestionKeySchema>;

/** The assistance kinds a brief may declare it must accommodate. */
export const ACCOMMODATION_ASSISTANCE_KINDS = ["READER", "SCRIBE", "LARGE_TEXT", "EXTRA_TIME", "SUPERVISED_BREAK"] as const;
export const accommodationAssistanceSchema = z.enum(ACCOMMODATION_ASSISTANCE_KINDS);

const distinct = (values: readonly string[]) => new Set(values).size === values.length;

/**
 * The validation bound for each decision, which is also what a failed answer reports (R3.12).
 *
 * Each bound is the bound of the record the decision feeds, named once: `durationMinutes` and
 * `totalMarks` are `blueprintSchema`'s bounds, `languages` is `assessmentLanguageSchema`'s set,
 * `formCount` is the `maxForms` ceiling of R10.1 shared with `./delivery-policy`, `deliveryTier` is
 * that module's tier enum, and `taughtCoverage` mirrors `curriculumDataSchema.sectionCoverage`
 * minus the taught date and confirmation flag, which the curriculum record owns. A brief that
 * passes these bounds therefore cannot produce a blueprint that fails them.
 *
 * `accommodationIntent` is an *intent*: which assistance the paper must accommodate. It grants
 * nothing. Per-candidate accommodation records stay with SKO-410's `examAccommodationSchema`
 * (R29.2), so no extra time can be conjured out of a brief.
 */
export const BRIEF_DECISION_SCHEMAS = {
  subject: recordId,
  class: recordId,
  taughtCoverage: z.strictObject({ section: id, outcomeIds: z.array(id).min(1).max(200) }).refine(value => distinct(value.outcomeIds), "Select distinct taught outcomes."),
  durationMinutes: z.number().int().min(1).max(480),
  totalMarks: z.number().min(1).max(1000),
  languages: z.array(assessmentLanguageSchema).min(1).max(3).refine(distinct, "Each language appears once."),
  formCount: z.number().int().min(1).max(MAX_FORMS_CEILING),
  deliveryTier: deliveryTierSchema,
  accommodationIntent: z.strictObject({ expected: z.boolean(), assistance: z.array(accommodationAssistanceSchema).max(ACCOMMODATION_ASSISTANCE_KINDS.length) })
    .refine(value => distinct(value.assistance), "Each assistance kind appears once.")
    .refine(value => value.expected === value.assistance.length > 0, "Name the assistance that is expected, or record that none is."),
} as const satisfies Record<BriefQuestionKey, z.ZodType>;

/** The bound stated in words, for the failed-bound message of R3.12. The localized copy is `exam-studio-copy-brief.ts`. */
export const BRIEF_DECISION_BOUNDS: Readonly<Record<BriefQuestionKey, string>> = Object.freeze({
  subject: "Choose one of your assigned subjects.",
  class: "Choose the class that subject is taught to.",
  taughtCoverage: "Choose a taught coverage section and at least one distinct outcome within it.",
  durationMinutes: "Enter a whole number of minutes between 1 and 480.",
  totalMarks: "Enter total marks between 1 and 1000.",
  languages: "Choose between one and three of English, Arabic and Urdu, each once.",
  formCount: `Enter a form count between 1 and ${MAX_FORMS_CEILING}.`,
  deliveryTier: "Choose the standard or the managed delivery tier.",
  accommodationIntent: "Name the assistance the paper must accommodate, or record that none is expected.",
});

/** The typed value of each decision, so a caller cannot confirm a duration where a language set belongs. */
export type BriefDecisionValues = { [K in BriefQuestionKey]: z.infer<(typeof BRIEF_DECISION_SCHEMAS)[K]> };

/**
 * The bound check of R3.12, pure and per decision. A failure reports the bound that failed — the
 * named bound for this key, plus whatever the schema said about this input — so the interface can
 * state it and retain the entered text rather than discarding the answer.
 */
export function validateBriefAnswer<K extends BriefQuestionKey>(key: K, value: unknown): { ok: true; value: BriefDecisionValues[K] } | { ok: false; bound: string } {
  const parsed = (BRIEF_DECISION_SCHEMAS[key] as z.ZodType).safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data as BriefDecisionValues[K] };
  const detail = [...new Set(parsed.error.issues.map(issue => issue.message))].join(" ");
  return { ok: false, bound: `${BRIEF_DECISION_BOUNDS[key]}${detail ? ` ${detail}` : ""}` };
}

/* ------------------------------------------------------------------ the brief history (R3.5, R3.13) */

/**
 * What happened to one decision. `SUGGESTED` offers a suggestion, `CONFIRMED` records an explicit
 * confirmation, `ACCEPTED_SUGGESTION` converts a suggestion to a fact and `SKIPPED` records
 * `skip`/`unknown` on an open decision.
 *
 * A superseded confirmed value is not retained here; R3.13 keeps it in the record's immutable
 * revision chain, which is the same place the rest of this workspace keeps a previous version.
 * `retainedSuggestion` exists because R3.5 asks for more than that: the accepted suggestion must
 * survive *inside* the brief, beside the acceptance event.
 */
export const BRIEF_EVENTS = ["SUGGESTED", "CONFIRMED", "ACCEPTED_SUGGESTION", "SKIPPED"] as const;
export const briefEventSchema = z.enum(BRIEF_EVENTS);
export type BriefEvent = z.infer<typeof briefEventSchema>;

export const briefHistoryEntrySchema = z.strictObject({
  key: briefQuestionKeySchema,
  event: briefEventSchema,
  actorId: id,
  at: z.iso.datetime(),
  from: factClassificationSchema,
  to: factClassificationSchema,
  /** The suggestion as it stood when it was accepted, retained verbatim (R3.5). */
  retainedSuggestion: extractedSuggestionSchema.optional(),
}).superRefine((value, ctx) => {
  // R3.5 made structural: the acceptance event and the original suggestion exist together or not at all.
  if (value.event === "ACCEPTED_SUGGESTION") {
    if (!value.retainedSuggestion) ctx.addIssue({ code: "custom", path: ["retainedSuggestion"], message: "Accepting a suggestion retains the original suggestion beside the acceptance event." });
    if (value.from !== "EXTRACTED_SUGGESTION" || value.to !== "CONFIRMED_FACT") ctx.addIssue({ code: "custom", path: ["event"], message: "An acceptance converts an extracted suggestion into a confirmed fact." });
  } else if (value.retainedSuggestion) ctx.addIssue({ code: "custom", path: ["retainedSuggestion"], message: "Only an acceptance retains a suggestion." });
  if (value.event === "CONFIRMED" && value.to !== "CONFIRMED_FACT") ctx.addIssue({ code: "custom", path: ["to"], message: "A confirmation produces a confirmed fact." });
  if (value.event === "SKIPPED" && (value.from !== "OPEN_DECISION" || value.to !== "OPEN_DECISION")) ctx.addIssue({ code: "custom", path: ["event"], message: "A skipped decision stays open." });
  if (value.event === "SUGGESTED" && value.to !== "EXTRACTED_SUGGESTION") ctx.addIssue({ code: "custom", path: ["to"], message: "A suggestion produces an extracted suggestion." });
});
export type BriefHistoryEntry = z.infer<typeof briefHistoryEntrySchema>;

export const MAX_BRIEF_HISTORY = 200;

/* ------------------------------------------------------------------ the brief record (R3.9, R3.13) */

/**
 * `subjectId` and `classId` are the teaching scope `assertWorkspaceSubject` reads off the record
 * body, kept paired and optional exactly as the registered placeholder had them: a teacher must
 * supply both, which `./access` enforces against their assignments, and a manager may hold a brief
 * with neither.
 *
 * `decisions` is exhaustive over the question sequence, so every key always carries one of the
 * three classifications and an unanswered decision is a stored `OPEN_DECISION` rather than an
 * absent key. The final refinement is what keeps `value: unknown` honest: a decided value must
 * satisfy the bound of its own question (R3.12), a fact's scope must be the brief's own scope
 * (R3.3), and a confirmed `subject` or `class` must be the subject and class the brief is for.
 */
export const assessmentBriefSchema = z.strictObject({
  subjectId: recordId.optional(),
  classId: recordId.optional(),
  decisions: z.record(briefQuestionKeySchema, briefValueSchema),
  history: z.array(briefHistoryEntrySchema).max(MAX_BRIEF_HISTORY),
}).superRefine((brief, ctx) => {
  if (Boolean(brief.subjectId) !== Boolean(brief.classId)) ctx.addIssue({ code: "custom", path: ["subjectId"], message: "Choose both the subject and its class." });
  for (const key of BRIEF_QUESTION_SEQUENCE) {
    const decision = brief.decisions[key];
    if (decision.classification === "OPEN_DECISION") continue;
    const bound = validateBriefAnswer(key, decision.value);
    if (!bound.ok) ctx.addIssue({ code: "custom", path: ["decisions", key, "value"], message: bound.bound });
    if (decision.classification !== "CONFIRMED_FACT") continue;
    if (brief.subjectId && decision.scope.subjectId !== brief.subjectId) ctx.addIssue({ code: "custom", path: ["decisions", key, "scope", "subjectId"], message: "A confirmed fact is confirmed for the subject this brief is for." });
    if (brief.classId && decision.scope.classId !== brief.classId) ctx.addIssue({ code: "custom", path: ["decisions", key, "scope", "classId"], message: "A confirmed fact is confirmed for the class this brief is for." });
  }
  const subject = brief.decisions.subject;
  const schoolClass = brief.decisions.class;
  if (brief.subjectId && subject.classification === "CONFIRMED_FACT" && subject.value !== brief.subjectId) ctx.addIssue({ code: "custom", path: ["decisions", "subject", "value"], message: "The confirmed subject is the subject this brief is for." });
  if (brief.classId && schoolClass.classification === "CONFIRMED_FACT" && schoolClass.value !== brief.classId) ctx.addIssue({ code: "custom", path: ["decisions", "class", "value"], message: "The confirmed class is the class this brief is for." });
});
export type AssessmentBrief = z.infer<typeof assessmentBriefSchema>;

/** A brief with every decision open and no history: what an author sees on the first question (R3.1). */
export function emptyAssessmentBrief(scope?: { subjectId?: string; classId?: string }): AssessmentBrief {
  const decisions = Object.fromEntries(BRIEF_QUESTION_SEQUENCE.map(key => [key, { classification: "OPEN_DECISION", skipped: false } satisfies OpenDecision])) as Record<BriefQuestionKey, BriefValue>;
  return assessmentBriefSchema.parse({ ...(scope?.subjectId ? { subjectId: scope.subjectId } : {}), ...(scope?.classId ? { classId: scope.classId } : {}), decisions, history: [] });
}

/* ------------------------------------------------------------------ reading the brief (R3.1, R3.8, R3.10) */

/** Every open decision, in the recorded sequence, skipped or not. `decisions` is exhaustive, so `brief.decisions[key]` is the value at any key. */
export function openDecisions(brief: AssessmentBrief): BriefQuestionKey[] {
  return BRIEF_QUESTION_SEQUENCE.filter(key => brief.decisions[key].classification === "OPEN_DECISION");
}

/** The open decisions the author passed over with `skip` or `unknown` (R3.6). They stay open and keep blocking release. */
export function skippedDecisions(brief: AssessmentBrief): BriefQuestionKey[] {
  return openDecisions(brief).filter(key => (brief.decisions[key] as OpenDecision).skipped);
}

/**
 * The one decision to present now: the first open decision in the recorded sequence that the author
 * has not skipped (R3.1), or `null` when the assistant has nothing left to ask. Skipping therefore
 * advances — R3.6 asks the assistant to keep the decision open *and continue to the next one*,
 * which re-presenting it would not do. A skipped decision is reached again through the readiness
 * summary, or on the author's next visit through `resumeDecision`.
 */
export function nextOpenDecision(brief: AssessmentBrief): BriefQuestionKey | null {
  return openDecisions(brief).find(key => !(brief.decisions[key] as OpenDecision).skipped) ?? null;
}

/**
 * Where a returning author resumes: the first open decision in the sequence, including one skipped
 * in an earlier session (R3.10). The answered values are the brief itself, which the surface
 * displays alongside.
 */
export function resumeDecision(brief: AssessmentBrief): BriefQuestionKey | null {
  return openDecisions(brief)[0] ?? null;
}

/**
 * The readiness summary of R3.8.
 *
 * `blocking` is every decision that is not a confirmed fact, which is a superset of the open ones:
 * an unaccepted suggestion is evidence, not a decision, and releasing on it would be deriving a
 * value the author never confirmed (R3.11). `open` and `awaitingAcceptance` name the two groups
 * separately so the summary can say what each decision is waiting for, and `skipped` names the ones
 * the author passed over.
 */
export function briefReadiness(brief: AssessmentBrief): {
  blocking: BriefQuestionKey[];
  open: BriefQuestionKey[];
  skipped: BriefQuestionKey[];
  awaitingAcceptance: BriefQuestionKey[];
  ready: boolean;
} {
  const blocking = BRIEF_QUESTION_SEQUENCE.filter(key => brief.decisions[key].classification !== "CONFIRMED_FACT");
  const open = openDecisions(brief);
  return {
    blocking,
    open,
    skipped: skippedDecisions(brief),
    awaitingAcceptance: blocking.filter(key => brief.decisions[key].classification === "EXTRACTED_SUGGESTION"),
    ready: blocking.length === 0,
  };
}

/** The approval readiness of a stored `BRIEF` record, in the shape `workspaceApprovalIssues` returns. */
export function briefApprovalIssues(brief: AssessmentBrief): string[] {
  return briefReadiness(brief).blocking.map(key => `Confirm ${key} before approving the assessment brief.`);
}

/* ------------------------------------------------------------------ writing the brief */

/**
 * Why a write was refused. Each is a refusal this module can state; none of them is a thrown error,
 * because the brief route answers a failed bound with the bound and the entered text rather than
 * with a stack (R3.12).
 */
export const BRIEF_REFUSALS = ["FAILED_BOUND", "MISSING_ACTOR", "INVALID_TIMESTAMP", "NOT_OPEN", "NOT_A_SUGGESTION", "ALREADY_CONFIRMED", "SCOPE_MISMATCH", "HISTORY_FULL"] as const;
export type BriefRefusal = (typeof BRIEF_REFUSALS)[number];

/**
 * The result of a write. A refusal still carries a brief, so the caller never has to reconstruct
 * one: on a failed bound that brief is the brief with the entered text retained against the open
 * decision (R3.12); on every other refusal it is the brief unchanged.
 */
export type BriefWriteResult =
  | { ok: true; brief: AssessmentBrief; next: BriefQuestionKey | null }
  | { ok: false; reason: BriefRefusal; detail: string; brief: AssessmentBrief };

const ok = (brief: AssessmentBrief): BriefWriteResult => ({ ok: true, brief, next: nextOpenDecision(brief) });
const refuse = (brief: AssessmentBrief, reason: BriefRefusal, detail: string): BriefWriteResult => ({ ok: false, reason, detail, brief });

/** An authoritative timestamp, or `null` when the clock handed in is not a usable instant. */
const instant = (at: Date): string | null => (Number.isFinite(at.getTime()) ? at.toISOString() : null);

/**
 * Appends one history entry and replaces one decision. The only writer of `decisions` and `history`
 * in this module, so "history is append-only" and "the brief still parses" are checked in one place
 * rather than in each caller. A full history refuses the write; trimming it would drop the
 * acceptance events R3.5 requires the brief to retain.
 */
function write(brief: AssessmentBrief, key: BriefQuestionKey, value: BriefValue, entry: Omit<BriefHistoryEntry, "key" | "from" | "to">): BriefWriteResult {
  if (brief.history.length >= MAX_BRIEF_HISTORY) return refuse(brief, "HISTORY_FULL", `This brief has recorded ${MAX_BRIEF_HISTORY} decision events. Start a new brief for this subject and class; this one stays readable.`);
  const parsed = assessmentBriefSchema.safeParse({
    ...brief,
    decisions: { ...brief.decisions, [key]: value },
    history: [...brief.history, { ...entry, key, from: brief.decisions[key].classification, to: value.classification }],
  });
  if (!parsed.success) return refuse(brief, "FAILED_BOUND", [...new Set(parsed.error.issues.map(issue => issue.message))].join(" "));
  return ok(parsed.data);
}

/**
 * Offers a value read out of an approved source, a school default or a provider response as an
 * `Extracted_Suggestion` (R3.4). It is never a confirmation: `reviewed` is `false` and the author
 * must still accept it. A suggestion cannot displace a confirmed fact, because that would be the
 * system undoing a human decision.
 */
export function suggestDecision<K extends BriefQuestionKey>(brief: AssessmentBrief, input: {
  key: K;
  value: BriefDecisionValues[K];
  actorId: string;
  at: Date;
  sourceId: string;
  sourceVersion: number;
  reference: string;
  excerpt: string;
  origin?: SuggestionOrigin;
}): BriefWriteResult {
  const at = instant(input.at);
  if (!input.actorId.trim()) return refuse(brief, "MISSING_ACTOR", "A suggestion records the actor it was offered to.");
  if (at === null) return refuse(brief, "INVALID_TIMESTAMP", "The server clock is unavailable. Try again.");
  if (brief.decisions[input.key].classification === "CONFIRMED_FACT") return refuse(brief, "ALREADY_CONFIRMED", `${input.key} is already confirmed. A suggestion cannot replace a confirmed fact.`);
  const bound = validateBriefAnswer(input.key, input.value);
  if (!bound.ok) return refuse(brief, "FAILED_BOUND", bound.bound);
  const suggestion: ExtractedSuggestion = {
    classification: "EXTRACTED_SUGGESTION", value: bound.value, sourceId: input.sourceId, sourceVersion: input.sourceVersion,
    reference: input.reference, excerpt: input.excerpt, origin: input.origin ?? "APPROVED_SOURCE", reviewed: false,
  };
  return write(brief, input.key, suggestion, { event: "SUGGESTED", actorId: input.actorId, at });
}

/**
 * The school default of R3.7: offered as an `Extracted_Suggestion` whose `origin` labels it a school
 * default, so the interface says where the value came from and the author still confirms it. The
 * source is the school's own policy record and version, so the default is as traceable as an
 * extraction from a syllabus.
 */
export function suggestSchoolDefault<K extends BriefQuestionKey>(brief: AssessmentBrief, input: {
  key: K;
  value: BriefDecisionValues[K];
  actorId: string;
  at: Date;
  sourceId: string;
  sourceVersion: number;
  reference: string;
  excerpt: string;
}): BriefWriteResult {
  return suggestDecision(brief, { ...input, origin: "SCHOOL_DEFAULT" });
}

/**
 * Records an explicit author confirmation as a `Confirmed_Fact` with its actor, authoritative
 * timestamp and scope (R3.3). This is the only way a value becomes a fact other than accepting a
 * suggestion, and it takes a value and a named actor — never conversation text — so no fact can be
 * derived from what was said (R3.11). A confirmation without a named actor is refused rather than
 * attributed to the system.
 */
export function confirmDecision<K extends BriefQuestionKey>(brief: AssessmentBrief, input: {
  key: K;
  value: BriefDecisionValues[K];
  actorId: string;
  at: Date;
  scope: BriefScope;
}): BriefWriteResult {
  const at = instant(input.at);
  if (!input.actorId.trim()) return refuse(brief, "MISSING_ACTOR", "A confirmed fact records the person who confirmed it.");
  if (at === null) return refuse(brief, "INVALID_TIMESTAMP", "The server clock is unavailable. Try confirming again.");
  const scope = briefScopeSchema.safeParse(input.scope);
  if (!scope.success) return refuse(brief, "SCOPE_MISMATCH", "A confirmed fact records the school, campus, class and subject it was confirmed for.");
  if ((brief.subjectId && scope.data.subjectId !== brief.subjectId) || (brief.classId && scope.data.classId !== brief.classId)) return refuse(brief, "SCOPE_MISMATCH", "This confirmation is scoped to another subject or class.");
  const bound = validateBriefAnswer(input.key, input.value);
  // R3.12: the answer is refused with the bound that failed, and the entered text is retained
  // against the still-open decision so the author corrects it rather than retyping it.
  if (!bound.ok) {
    const current = brief.decisions[input.key];
    if (current.classification !== "OPEN_DECISION") return refuse(brief, "FAILED_BOUND", bound.bound);
    const retained = assessmentBriefSchema.safeParse({ ...brief, decisions: { ...brief.decisions, [input.key]: { ...current, lastEnteredText: enteredText(input.value) } } });
    return { ok: false, reason: "FAILED_BOUND", detail: bound.bound, brief: retained.success ? retained.data : brief };
  }
  const fact: ConfirmedFact = { classification: "CONFIRMED_FACT", value: bound.value, actorId: input.actorId, at, scope: scope.data };
  return write(brief, input.key, fact, { event: "CONFIRMED", actorId: input.actorId, at });
}

/**
 * Accepts the suggestion standing at one key (R3.5): the value becomes a `Confirmed_Fact` carrying
 * the accepting actor, the authoritative timestamp, the scope and `acceptedFrom` — the source and
 * version the suggestion quoted, copied from the suggestion rather than supplied by the caller —
 * while the acceptance event and the original suggestion are both retained in the history.
 *
 * Accepting what is not a suggestion is refused, so this cannot be used to confirm an open decision
 * without a value or to re-confirm a fact.
 */
export function acceptSuggestion(brief: AssessmentBrief, input: { key: BriefQuestionKey; actorId: string; at: Date; scope: BriefScope }): BriefWriteResult {
  const current = brief.decisions[input.key];
  const at = instant(input.at);
  if (!input.actorId.trim()) return refuse(brief, "MISSING_ACTOR", "Accepting a suggestion records the person who accepted it.");
  if (at === null) return refuse(brief, "INVALID_TIMESTAMP", "The server clock is unavailable. Try accepting again.");
  if (current.classification !== "EXTRACTED_SUGGESTION") return refuse(brief, "NOT_A_SUGGESTION", `${input.key} holds no suggestion to accept.`);
  const scope = briefScopeSchema.safeParse(input.scope);
  if (!scope.success) return refuse(brief, "SCOPE_MISMATCH", "A confirmed fact records the school, campus, class and subject it was confirmed for.");
  if ((brief.subjectId && scope.data.subjectId !== brief.subjectId) || (brief.classId && scope.data.classId !== brief.classId)) return refuse(brief, "SCOPE_MISMATCH", "This acceptance is scoped to another subject or class.");
  const fact: ConfirmedFact = {
    classification: "CONFIRMED_FACT", value: current.value, actorId: input.actorId, at, scope: scope.data,
    acceptedFrom: { sourceId: current.sourceId, sourceVersion: current.sourceVersion },
  };
  return write(brief, input.key, fact, { event: "ACCEPTED_SUGGESTION", actorId: input.actorId, at, retainedSuggestion: current });
}

/**
 * The `skip`/`unknown` answer of R3.6: the decision stays an `Open_Decision`, keeps blocking
 * release, and the assistant continues to the next one. Skipping a decision that is not open is
 * refused — a skip that could erase a confirmed fact would make "skip" a destructive answer.
 */
export function skipDecision(brief: AssessmentBrief, input: { key: BriefQuestionKey; actorId: string; at: Date; enteredText?: string }): BriefWriteResult {
  const current = brief.decisions[input.key];
  const at = instant(input.at);
  if (!input.actorId.trim()) return refuse(brief, "MISSING_ACTOR", "A skipped decision records who skipped it.");
  if (at === null) return refuse(brief, "INVALID_TIMESTAMP", "The server clock is unavailable. Try again.");
  if (current.classification !== "OPEN_DECISION") return refuse(brief, "NOT_OPEN", `${input.key} is already answered. Change the answer instead of skipping it.`);
  const text = input.enteredText ?? current.lastEnteredText;
  const open: OpenDecision = { classification: "OPEN_DECISION", skipped: true, ...(text ? { lastEnteredText: text.slice(0, 2000) } : {}) };
  return write(brief, input.key, open, { event: "SKIPPED", actorId: input.actorId, at });
}

/** The entered text retained for correction (R3.12). A value the author typed is retained as they typed it; a composite answer is retained as its JSON form. */
function enteredText(value: unknown): string {
  const text = typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : safeJson(value);
  return text.slice(0, 2000);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
