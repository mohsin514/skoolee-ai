import { z } from "zod";
import { candidatePaper, paperDataSchema, type AssessmentLocale, type CandidatePaper, type PaperData, type Question } from "./assessment";
import { canonicalDigest, canonicalJson, normalizeForHash } from "./canonical";
import { approvalSeparationDecision, maxFormsFor, type ResolvedDeliveryPolicy } from "./delivery-policy";

/**
 * Sealed release: the Content_Hash and the preconditions a release must satisfy
 * (SKO-408, Requirement 8, R9.9, R4.10, R6.7, R10.1, R19.3).
 *
 * Pure module: no I/O, no Prisma, no service import, no `process.env` read, no clock read — the
 * authoritative instant arrives as an argument. Runnable under `npm run test:school-ai`.
 *
 * Five things are structural here rather than conventional.
 *
 * 1. **The hash is a pure function of one stored paper revision.** `contentHash(paper)` takes the
 *    language and the form label *from the paper*, so nothing out of band can disagree with what
 *    was sealed, and `buildCandidatePaperHtml(paper, version)` — which receives only the paper —
 *    can recompute it without new plumbing (R8.4). An independent verifier needs the released
 *    revision's `paperData` and nothing else (R19.3).
 * 2. **A Protected_Key value is absent by construction, and the construction is asserted.** The
 *    hash input is `candidatePaper()`'s output, an explicit allow-list. `contentHashInput` walks
 *    that output against `PROJECTION_FIELDS` and refuses to produce a hash at all if an
 *    unexpected or protected field name has appeared, so a future edit to `candidatePaper` cannot
 *    quietly seal a paper that carries a key (R8.6).
 * 3. **Whitespace normalization reaches the hash input only.** `normalizeForHash` is applied to the
 *    projection *after* it is derived, and it builds new values rather than mutating. The stored
 *    `paperData` and both rendered outputs keep their original bytes, because a figure caption and
 *    an authored prompt are evidence (R8.2).
 * 4. **A release that refuses cannot also seal.** `ReleaseDecision` is a discriminated union: the
 *    releasable branch carries a non-empty list of seals and no refusal, and the refused branch
 *    carries a non-empty list of refusals and no seal. "Released nothing" and "released despite a
 *    blocker" are not representable.
 * 5. **The five recorded fields of R8.10 travel together.** A successful decision hands back
 *    `SealedForm` values already carrying the releasing actor, the authoritative timestamp, the
 *    released revision, the Content_Hash and the rehearsal result identifier, so the write has
 *    nothing left to remember and no second way to compute the hash.
 *
 * What this module deliberately does not own:
 *
 * - **Authority.** Whether the actor may release at all is `studio-access.ts`'s `APPROVE_VERSION`,
 *   and reading a Protected_Key is its `READ_PROTECTED_KEY`. This module takes an actor identifier
 *   only to record it and to decide separation of duties.
 * - **The rehearsal itself.** `rehearsal.ts` owns the check registry, the `BLOCKING`/`ADVISORY`
 *   classification and the candidate/key separation check that fuzzes Protected_Key *values*
 *   (R7.5). This module reads the `RehearsalSummary` a release gate needs, so the two land in
 *   either order and neither restates the other.
 * - **Blueprint parity across a Form_Set.** The parity comparison belongs to the Form_Set module;
 *   its failures arrive as `parityFailures` and are reported with the failing form and check
 *   named (R10.4).
 * - **Persistence.** Creating the draft revision after a release, and leaving the Released_Form,
 *   its hash and its Protected_Key byte-identical (R8.8, R6.9), is the release service's
 *   transaction. The hash is a function of the released revision alone, so a later edit to a newer
 *   revision cannot move it.
 */

/* ------------------------------------------------------------------ the form label */

/** Derived from `paperDataSchema.formSet`, so the labels are stated in exactly one place. */
export type FormLabel = NonNullable<PaperData["formSet"]>["label"];

/**
 * A paper with no recorded Form_Set is the sole form of its sitting. The label is part of the hash
 * input, so this is a real choice: recording that paper into a Form_Set as `A` later leaves its
 * hash unchanged, and recording it as `B` changes it — correctly, because the delivered paper has
 * become a different form of a parallel set.
 */
export const SOLE_FORM_LABEL = "A" satisfies FormLabel;

export function formLabelOf(paper: PaperData): FormLabel {
  return paper.formSet?.label ?? SOLE_FORM_LABEL;
}

/* ------------------------------------------------------------------ the Content_Hash (R8.1, R8.2, R9.9) */

/**
 * The scheme version inside the hash input. It is `1` because this is the first scheme; a later
 * change to the projection, the normalization or the serialization raises it, so a recomputation
 * under a new scheme cannot silently match or silently miss a hash sealed under the old one.
 */
export const CONTENT_HASH_SCHEME_VERSION = 1;
/** Stated explicitly because an independent verifier has to hash the same bytes (R19.3). */
export const CONTENT_HASH_ALGORITHM = "sha256";
export const CONTENT_HASH_INPUT_ENCODING = "utf-8";
export const CONTENT_HASH_DIGEST_ENCODING = "hex-lowercase";
/**
 * How much of the hash the staff release view and the print output show (R8.5). The same 16
 * characters the design fixes for a recorded Admission_Decision, so one prefix length is read
 * everywhere and no surface invents a second.
 */
export const CONTENT_HASH_PREFIX_LENGTH = 16;

/** Lowercase hex, which is what `canonicalDigest` produces. One spelling, so a verifier gets one answer. */
export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * The exact value that is serialized and hashed. Flat and tiny on purpose: everything a verifier
 * needs is the released revision's `paperData`, from which these four fields are derivable.
 *
 * `language` is inside the input, which is the whole of R9.9. `CandidatePaper` carries no language
 * field, so two language versions of a formula-only paper would otherwise project to identical
 * bytes and collide on one hash.
 */
export type ContentHashInput = {
  v: typeof CONTENT_HASH_SCHEME_VERSION;
  language: AssessmentLocale;
  formLabel: FormLabel;
  projection: CandidatePaper;
};

/**
 * Protected_Key is defined as answer keys, rubrics, model answers, reviewer notes and semantic
 * review output. `sourceRefs` joins them here: an approved source excerpt reaches a candidate no
 * more than a key does, and the rehearsal's candidate/key separation check names it too (R7.5).
 */
export const PROTECTED_KEY_FIELDS = Object.freeze(["correctOptionId", "correctOptionIds", "numericKey", "modelAnswer", "rubric", "review", "sourceRefs"] as const);
export type ProtectedKeyField = (typeof PROTECTED_KEY_FIELDS)[number];
const PROTECTED_KEY_FIELD_SET: ReadonlySet<string> = new Set<string>(PROTECTED_KEY_FIELDS);

/**
 * Every field name that may appear anywhere inside the hash input, exactly as `candidatePaper` and
 * `candidateFigure` produce it. An allow-list rather than a ban-list, because a ban-list only
 * refuses the leaks someone already thought of.
 *
 * Flat rather than per-node: the shape is owned by those two functions and `paperDataSchema` is
 * `.strict()`, so a name that is not in this set cannot have been projected deliberately. A new
 * candidate-facing field therefore fails the seal until it is added here — which is the review the
 * hash deserves, since adding one changes every hash computed afterwards.
 */
export const PROJECTION_FIELD_NAMES = Object.freeze([
  // the hash input itself
  "v", "language", "formLabel", "projection",
  // the paper
  "title", "instructions", "durationMinutes", "totalMarks", "sections", "resources", "questions",
  // a section
  "id", "questionCount", "answerCount", "marksPerQuestion", "type", "outcomeIds",
  // a candidate resource
  "content",
  // a question and its options
  "sectionId", "prompt", "marks", "options", "text", "figures",
  // an approved figure crop
  "width", "height", "png", "alt", "caption",
] as const);
const PROJECTION_FIELDS: ReadonlySet<string> = new Set<string>(PROJECTION_FIELD_NAMES);

/**
 * `candidatePaper` blanks the section outcome mapping rather than dropping the key, so the key is
 * expected and the value must be the empty list. A populated one would put the staff-facing outcome
 * mapping into a candidate payload.
 */
const BLANKED_PROJECTION_FIELDS: ReadonlySet<string> = new Set(["outcomeIds"]);

export const CONTENT_HASH_PROTECTED_FIELD = "CONTENT_HASH_PROTECTED_FIELD";
export const CONTENT_HASH_UNEXPECTED_FIELD = "CONTENT_HASH_UNEXPECTED_FIELD";
export const CONTENT_HASH_MISMATCH = "CONTENT_HASH_MISMATCH";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function assertProjectionFields(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertProjectionFields(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const at = `${path}.${key}`;
    if (PROTECTED_KEY_FIELD_SET.has(key)) throw new Error(`${CONTENT_HASH_PROTECTED_FIELD}:${at}`);
    if (!PROJECTION_FIELDS.has(key)) throw new Error(`${CONTENT_HASH_UNEXPECTED_FIELD}:${at}`);
    if (BLANKED_PROJECTION_FIELDS.has(key) && !(Array.isArray(item) && item.length === 0)) throw new Error(`${CONTENT_HASH_PROTECTED_FIELD}:${at}`);
    assertProjectionFields(item, at);
  }
}

/**
 * Asserts the allow-list held over a candidate projection. Throws rather than returning a flag:
 * there is no useful hash of a projection that carries a key, so the seal has to be unavailable
 * rather than wrong. Exported so the browser and print renderers can assert the same thing about
 * the payload they are about to serve (R8.6), against one list rather than two.
 */
export function assertKeyFreeProjection(projection: unknown, path = "$.projection"): void {
  assertProjectionFields(projection, path);
}

/**
 * The hash input for one paper revision: the key-free projection, normalized for hashing only.
 *
 * `normalizeForHash` returns new strings, arrays and records, so `paper` and the projection stored
 * or rendered elsewhere keep their original bytes — trailing spaces, CRLF line endings and
 * decomposed Unicode included (R8.2).
 */
export function contentHashInput(paper: PaperData): ContentHashInput {
  const projection = normalizeForHash(candidatePaper(paper));
  assertKeyFreeProjection(projection);
  return { v: CONTENT_HASH_SCHEME_VERSION, language: paper.language, formLabel: formLabelOf(paper), projection };
}

/**
 * The exact UTF-8 text that is hashed, for a verifier who wants to see the bytes rather than trust
 * the digest. Object keys are in code-unit order, which is why the order is reproducible outside
 * this process at all.
 */
export function contentHashInputJson(paper: PaperData): string {
  return canonicalJson(contentHashInput(paper));
}

/** `sha256` over `contentHashInputJson(paper)` as UTF-8 bytes, lowercase hex. */
export function contentHash(paper: PaperData): string {
  return canonicalDigest(contentHashInput(paper));
}

/** The displayed prefix (R8.5). Never a credential: it is a truncation of a public digest. */
export function contentHashPrefix(hash: string): string {
  return hash.slice(0, CONTENT_HASH_PREFIX_LENGTH);
}

/**
 * The verification both renderers run before serving (R8.3, R8.4). A mismatch carries both digests
 * and both prefixes, so the release view can show the stored prefix beside the recomputed one, and
 * `storedReadable` says whether the stored column held a hash at all — an unreadable value has no
 * prefix worth displaying, so it reports `null` rather than a fragment of something else.
 */
export type ContentHashVerification =
  | { matches: true; code: null; contentHash: string; prefix: string }
  | { matches: false; code: typeof CONTENT_HASH_MISMATCH; recomputed: string; recomputedPrefix: string; stored: string; storedPrefix: string | null; storedReadable: boolean };

export function verifyContentHash(paper: PaperData, stored: string): ContentHashVerification {
  const recomputed = contentHash(paper);
  const storedReadable = contentHashSchema.safeParse(stored).success;
  if (storedReadable && stored === recomputed) return { matches: true, code: null, contentHash: recomputed, prefix: contentHashPrefix(recomputed) };
  return { matches: false, code: CONTENT_HASH_MISMATCH, recomputed, recomputedPrefix: contentHashPrefix(recomputed), stored, storedPrefix: storedReadable ? contentHashPrefix(stored) : null, storedReadable };
}

/* ------------------------------------------------------------------ the Protected_Key payload (R8.7) */

/**
 * The marking payload of one item: the complement of `candidatePaper`'s allow-list, and the second
 * explicit allow-list R8.7 asks for. Stored beside the Released_Form rather than inside the
 * Candidate_Projection, and read only by a role holding `READ_PROTECTED_KEY` in
 * `studio-access.ts` — this module separates the payload and decides no authority.
 *
 * The item review history is not copied here. It is reviewer notes, it already lives immutably in
 * the record's own `SchoolAiRevision` snapshots behind the same authority matrix, and duplicating
 * it into a release row would create a second copy to keep in step.
 */
export type ProtectedKeyEntry = Pick<Question, "correctOptionId" | "modelAnswer" | "rubric"> &
  Partial<Pick<Question, "correctOptionIds" | "numericKey">> & { questionId: string };

export type ReleaseProtectedKey = {
  formLabel: FormLabel;
  language: AssessmentLocale;
  items: ProtectedKeyEntry[];
};

export function releaseProtectedKey(paper: PaperData): ReleaseProtectedKey {
  return {
    formLabel: formLabelOf(paper),
    language: paper.language,
    items: paper.questions.map(({ id, correctOptionId, correctOptionIds, numericKey, modelAnswer, rubric }) => ({
      questionId: id,
      correctOptionId,
      ...(correctOptionIds ? { correctOptionIds } : {}),
      ...(numericKey ? { numericKey } : {}),
      modelAnswer,
      rubric,
    })),
  };
}

/* ------------------------------------------------------------------ release preconditions */

/**
 * Every named reason a release is refused. A release never throws: a projection that could not be
 * hashed is `PROTECTED_VALUE_IN_PROJECTION`, an unparseable stored paper is `PAPER_UNREADABLE`, and
 * both are refusals a reviewer can read.
 */
export const RELEASE_REFUSAL_CODES = [
  "NO_FORM_NAMED",
  "DUPLICATE_FORM_VERSION",
  "RELEASING_ACTOR_UNKNOWN",
  "RELEASE_TIME_UNKNOWN",
  "FORM_COUNT_ABOVE_POLICY",
  "PAPER_UNREADABLE",
  "FORM_LABEL_MISMATCH",
  "FORM_HAS_NO_ITEM",
  "REVISION_MISMATCH",
  "ITEM_NOT_APPROVED",
  "LANGUAGE_OBSERVATION_UNRESOLVED",
  "FORM_PARITY_FAILED",
  "REHEARSAL_NOT_NAMED",
  "REHEARSAL_MISSING",
  "REHEARSAL_UNKNOWN",
  "REHEARSAL_STALE",
  "REHEARSAL_BLOCKING",
  "SEPARATION_OF_DUTIES",
  "PROTECTED_VALUE_IN_PROJECTION",
] as const;
export type ReleaseRefusalCode = (typeof RELEASE_REFUSAL_CODES)[number];
export const releaseRefusalCodeSchema = z.enum(RELEASE_REFUSAL_CODES);

/** How many item identifiers one refusal names before it counts the rest. A refusal is a report, not a payload. */
export const REFUSAL_NAMED_ITEM_LIMIT = 10;

/**
 * One refusal. `detail` names identifiers, check names and counts only — never an item prompt, a
 * key, a rubric criterion or a model answer, because a refusal is shown on surfaces that are not
 * entitled to a Protected_Key value.
 */
export type ReleaseRefusal = {
  code: ReleaseRefusalCode;
  /** The form the refusal belongs to, or `null` when it is about the request or the whole set. */
  formLabel: FormLabel | null;
  /** The failing check or field, so the interface can navigate to it (R7.9, R10.4). */
  check: string | null;
  itemIds: readonly string[];
  detail: string;
};

/** The exact form revision rehearsed, and its `BLOCKING` results, as `rehearsal.ts` records them (R7.3, R7.4, R7.10). */
export type RehearsalSummary = {
  rehearsalId: string;
  /** The record version the rehearsal ran against. */
  revision: number;
  /** Names of the `BLOCKING` results. Empty is the only releasable value; `ADVISORY` results never appear. */
  blockingChecks: readonly string[];
};

/** An unresolved language-version observation (R9.4, R9.5), which blocks release under R9.8. */
export type LanguageObservation = {
  kind: "MARKS_MISMATCH" | "KEY_STRUCTURE_MISMATCH";
  itemGroupId: string;
  questionIds: readonly string[];
};

/** A blueprint parity failure, decided by the Form_Set module and reported with the form and check named (R10.4). */
export type FormParityFailure = { check: string; detail: string };

/**
 * One form offered for release. Every field is required, including the three that can legitimately
 * be empty: a caller cannot forget to state that there are no unresolved observations, no parity
 * failures or no rehearsal, so no refusal is skipped by omission.
 */
export type ReleaseFormCandidate = {
  label: FormLabel;
  /** The revision the request names for this form. */
  namedVersion: number;
  /** The revision currently under review, read inside the release transaction (R8.9). */
  reviewedVersion: number;
  /** The paper of the named revision. Parsed here, so an unreadable row refuses instead of throwing. */
  paper: unknown;
  /** The actor who authored the named revision, for separation of duties (R2.4). */
  authoredBy: string | null;
  rehearsal: RehearsalSummary | null;
  unresolvedObservations: readonly LanguageObservation[];
  parityFailures: readonly FormParityFailure[];
};

export type ReleaseRequest = {
  /** The rehearsal result identifier the request names (R8.10). */
  rehearsalId: string | null;
  /** The releasing actor (R8.10). */
  releasedBy: string | null;
  /** The authoritative release instant (R8.10), supplied by the caller so this module reads no clock. */
  now: Date;
  /** The approved Delivery_Policy resolution, re-read inside the release transaction (R10.1, R2.4). */
  policy: ResolvedDeliveryPolicy;
  forms: readonly ReleaseFormCandidate[];
};

/** The five fields R8.10 records, plus the language identity R9.9 records with each Content_Hash. */
export type SealedForm = {
  formLabel: FormLabel;
  language: AssessmentLocale;
  releasedVersion: number;
  contentHash: string;
  rehearsalId: string;
  releasedBy: string;
  releasedAt: string;
};

/**
 * Either every named form is sealed, or none is and every blocker is named. The two branches carry
 * non-empty tuples, so a decision cannot report success with nothing released, nor a refusal with
 * no reason.
 */
export type ReleaseDecision =
  | { canRelease: true; sealed: readonly [SealedForm, ...SealedForm[]]; refusals: readonly [] }
  | { canRelease: false; sealed: readonly []; refusals: readonly [ReleaseRefusal, ...ReleaseRefusal[]] };

const refusal = (code: ReleaseRefusalCode, formLabel: FormLabel | null, check: string | null, detail: string, itemIds: readonly string[] = []): ReleaseRefusal => ({ code, formLabel, check, itemIds, detail });

/** `n identifiers, then a count`: a refusal naming a hundred items would be a payload, not a report. */
function nameItems(ids: readonly string[]): string {
  const named = ids.slice(0, REFUSAL_NAMED_ITEM_LIMIT).join(", ");
  return ids.length > REFUSAL_NAMED_ITEM_LIMIT ? `${named} and ${ids.length - REFUSAL_NAMED_ITEM_LIMIT} more` : named;
}

/**
 * An item counts as approved only when its recorded review state is `APPROVED` *and* that approval
 * was recorded against the item revision now being released. An absent review state is never
 * `APPROVED`, so this needs no fallback rule and does not restate `itemStateFor`'s resolution of
 * absence (which reads it as `DRAFT`, or `NEEDS_SOURCE` with no `sourceRefs`) — under R4.10 all
 * three of those refuse a release.
 *
 * This is deliberately stricter than `validatePaperApproval`, which ignores review state entirely
 * on a paper where no item carries one, so that rows stored before the item workbench existed stay
 * approvable without a migration. A *release* has no such history: the release tables arrive with
 * this feature, so every released item carries a recorded approval.
 */
function unapprovedItemIds(paper: PaperData): string[] {
  return paper.questions.filter(question => question.review?.state !== "APPROVED" || question.review.approvedBy?.itemRevision !== question.review.itemRevision).map(question => question.id);
}

/**
 * Pure. Decides every precondition it can from the data it is given, in a fixed order, and collects
 * every refusal rather than stopping at the first, so one rehearsal report lists all the work left
 * to do (R7.4).
 *
 * The Content_Hash of each form is computed inside this gate and handed back on the releasable
 * branch, so the caller has no second route to a hash and cannot seal a form whose preconditions
 * were checked against a different revision.
 */
export function releasePreconditions(request: ReleaseRequest): ReleaseDecision {
  const refusals: ReleaseRefusal[] = [];
  /** Hashed per form as the checks run; turned into seals only once the whole request is clean. */
  const hashed: Array<{ formLabel: FormLabel; language: AssessmentLocale; releasedVersion: number; contentHash: string }> = [];

  const releasedBy = (request.releasedBy ?? "").trim();
  const releasedAt = Number.isFinite(request.now.getTime()) ? request.now.toISOString() : null;
  const namedRehearsalId = (request.rehearsalId ?? "").trim();

  if (!request.forms.length) refusals.push(refusal("NO_FORM_NAMED", null, "forms", "A release request names at least one form."));
  // R8.10 records the releasing actor and the authoritative timestamp. Neither is recoverable later,
  // so a request that cannot supply one is refused rather than sealed with a gap.
  if (!releasedBy) refusals.push(refusal("RELEASING_ACTOR_UNKNOWN", null, "releasedBy", "A release records the releasing actor."));
  if (releasedAt === null) refusals.push(refusal("RELEASE_TIME_UNKNOWN", null, "releasedAt", "A release records an authoritative timestamp."));

  const ceiling = maxFormsFor(request.policy);
  const labels = [...new Set(request.forms.map(form => form.label))];
  if (labels.length > ceiling) refusals.push(refusal("FORM_COUNT_ABOVE_POLICY", null, "maxForms", `The ${request.policy.source === "SCHOOL_POLICY" ? "approved school delivery policy" : "platform default delivery policy"} permits ${ceiling} form${ceiling === 1 ? "" : "s"}; this set names ${labels.length} (${labels.join(", ")}).`));

  const seen = new Set<string>();

  for (const form of request.forms) {
    const parsed = paperDataSchema.safeParse(form.paper);
    if (!parsed.success) {
      refusals.push(refusal("PAPER_UNREADABLE", form.label, "paperData", `Form ${form.label} revision ${form.namedVersion} did not parse as a paper, so no Content_Hash can be computed over it.`));
      continue;
    }
    const paper = parsed.data;
    const label = form.label;

    // Two forms of one set in one language would seal two rows against one identity, and the
    // (label, language) pair is what the hash input and the assignment both key on (R9.9).
    const identity = `${label}:${paper.language}`;
    if (seen.has(identity)) refusals.push(refusal("DUPLICATE_FORM_VERSION", label, "formSet", `Form ${label} in ${paper.language} is named twice in one release request.`));
    seen.add(identity);

    // The hash takes the label from the paper, so a request label that disagrees would store a hash
    // under a label it was not computed for and fail every later verification.
    if (formLabelOf(paper) !== label) refusals.push(refusal("FORM_LABEL_MISMATCH", label, "formSet.label", `The request names form ${label}; the paper records form ${formLabelOf(paper)}.`));

    if (!paper.questions.length) refusals.push(refusal("FORM_HAS_NO_ITEM", label, "questions", `Form ${label} carries no item.`));

    // R8.9: the named revision must be the revision under review.
    if (form.namedVersion !== form.reviewedVersion) refusals.push(refusal("REVISION_MISMATCH", label, "version", `The release request names form ${label} revision ${form.namedVersion}; revision ${form.reviewedVersion} is the revision under review.`));

    // R4.10
    const unapproved = unapprovedItemIds(paper);
    if (unapproved.length) refusals.push(refusal("ITEM_NOT_APPROVED", label, "itemReviewState", `Form ${label}: ${unapproved.length} item${unapproved.length === 1 ? " is" : "s are"} not approved at the released item revision: ${nameItems(unapproved)}.`, unapproved));

    // R9.8
    for (const observation of form.unresolvedObservations) {
      refusals.push(refusal("LANGUAGE_OBSERVATION_UNRESOLVED", label, observation.kind, `Form ${label}: item group ${observation.itemGroupId} carries an unresolved ${observation.kind} observation.`, observation.questionIds));
    }

    // R10.3, R10.4: one form failing parity refuses the whole set, and the failing form and check are named.
    for (const parity of form.parityFailures) {
      refusals.push(refusal("FORM_PARITY_FAILED", label, parity.check, `Form ${label} fails the ${parity.check} parity check: ${parity.detail}`));
    }

    refusals.push(...rehearsalRefusals(form, paper, namedRehearsalId));

    // R2.4, decided by the approved policy and reported with the source that decided it.
    const separation = approvalSeparationDecision({ resolved: request.policy, authorId: form.authoredBy, approverId: releasedBy });
    if (!separation.allowed) refusals.push(refusal("SEPARATION_OF_DUTIES", label, "separationOfDuties", `The ${separation.source === "SCHOOL_POLICY" ? "approved school delivery policy" : "platform default delivery policy"} requires separate authoring and approval; form ${label} was refused as ${separation.reason}.`));

    // R8.6. Run for every readable form even when that form is already refused: a projection
    // carrying a key is worth reporting beside the other blockers, not instead of them.
    try {
      hashed.push({ formLabel: label, language: paper.language, releasedVersion: form.namedVersion, contentHash: contentHash(paper) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      refusals.push(refusal("PROTECTED_VALUE_IN_PROJECTION", label, "candidateProjection", `Form ${label}: the candidate projection carries a field the Content_Hash input does not permit (${reason}).`));
    }
  }

  // A seal needs all five recorded fields of R8.10, and the three request-level ones are refusals
  // of their own above, so this branch is reachable only with every one of them present.
  if (!refusals.length && hashed.length && releasedAt !== null) {
    const [first, ...rest] = hashed.map(entry => ({ ...entry, rehearsalId: namedRehearsalId, releasedBy, releasedAt }));
    return { canRelease: true, sealed: [first, ...rest], refusals: [] };
  }
  // Totality, not a reachable branch: an empty form list, an unknown actor and an unusable instant
  // each push a refusal above. It is here so the refused branch's non-empty tuple needs no assertion.
  if (!refusals.length) refusals.push(refusal("NO_FORM_NAMED", null, "forms", "A release request names at least one form."));
  const [first, ...rest] = refusals;
  return { canRelease: false, sealed: [], refusals: [first, ...rest] };
}

/**
 * The rehearsal half of the gate (R6.7, R7.10, R7.11, R8.10). Fail-closed at every step: a form
 * with no recorded rehearsal, a rehearsal recorded against another revision and a rehearsal the
 * paper's own staleness record has invalidated are all refusals, so nothing is released on the
 * strength of a rehearsal that did not run against the bytes being sealed.
 */
function rehearsalRefusals(form: ReleaseFormCandidate, paper: PaperData, namedRehearsalId: string): ReleaseRefusal[] {
  const label = form.label;
  const out: ReleaseRefusal[] = [];
  if (!namedRehearsalId) out.push(refusal("REHEARSAL_NOT_NAMED", label, "rehearsalId", "A release request names the rehearsal result it relies on."));
  // `paperDataSchema.staleness` absent means no rehearsal result has been recorded on this paper.
  if (!paper.staleness) out.push(refusal("REHEARSAL_MISSING", label, "staleness", `Form ${label} carries no recorded rehearsal result.`));
  else if (!paper.staleness.rehearsalValid) out.push(refusal("REHEARSAL_STALE", label, "staleness", `Form ${label}: the recorded rehearsal result was invalidated${paper.staleness.invalidatedAt ? ` at ${paper.staleness.invalidatedAt}` : ""}${paper.staleness.triggeredBy ? ` by a ${paper.staleness.triggeredBy.change} change` : ""}.`));
  else if (namedRehearsalId && paper.staleness.rehearsalId && paper.staleness.rehearsalId !== namedRehearsalId) out.push(refusal("REHEARSAL_STALE", label, "staleness.rehearsalId", `Form ${label}: the request names rehearsal ${namedRehearsalId}; the paper records rehearsal ${paper.staleness.rehearsalId}.`));

  if (!form.rehearsal) {
    out.push(refusal("REHEARSAL_MISSING", label, "rehearsal", `Form ${label} has no rehearsal result to read.`));
    return out;
  }
  if (namedRehearsalId && form.rehearsal.rehearsalId !== namedRehearsalId) out.push(refusal("REHEARSAL_UNKNOWN", label, "rehearsalId", `Form ${label}: the request names rehearsal ${namedRehearsalId}; the recorded result is rehearsal ${form.rehearsal.rehearsalId}.`));
  if (form.rehearsal.revision !== form.namedVersion) out.push(refusal("REHEARSAL_STALE", label, "rehearsal.revision", `Form ${label}: the rehearsal ran against revision ${form.rehearsal.revision}; revision ${form.namedVersion} is being released.`));
  if (form.rehearsal.blockingChecks.length) out.push(refusal("REHEARSAL_BLOCKING", label, form.rehearsal.blockingChecks[0], `Form ${label}: ${form.rehearsal.blockingChecks.length} blocking rehearsal result${form.rehearsal.blockingChecks.length === 1 ? "" : "s"} stand: ${form.rehearsal.blockingChecks.join(", ")}.`));
  return out;
}
