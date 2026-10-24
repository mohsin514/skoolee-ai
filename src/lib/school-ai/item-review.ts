import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  itemReviewSchema,
  itemReviewStateSchema,
  type ItemReview,
  type ItemReviewState,
  type PaperData,
  type Question,
} from "./assessment";

/**
 * Item review state and dependency staleness (SKO-408, Requirements 4 and 6).
 *
 * Pure module: no I/O, no Prisma, no service import, no clock read and no `process.env` read, so it
 * runs under `npm run test:school-ai`. Every timestamp is supplied by the caller, which is the only
 * way an *authoritative* timestamp (R4.5, R6.8) can reach a function that must not read the host
 * clock.
 *
 * **The two schemas live in `assessment.ts` and are re-exported here.** `questionSchema` references
 * `itemReviewSchema` at module-evaluation time while this module needs `Question` and `PaperData`
 * back, so declaring them here would turn a type-only cycle into a runtime one. `assessment.ts` is
 * their single writer; this module re-exports them so a caller has one import for the vocabulary and
 * the behaviour, and owns the behaviour: `itemStateFor`, the transition rules and `applyStaleness`.
 *
 * Four things are structural rather than conventional.
 *
 * 1. **`itemStateFor` is the single resolver of an absent `review`.** Absence is not a state — it
 *    means no review state has been recorded — and nothing else in the codebase reads it as
 *    anything. `assessment.ts` deliberately does not duplicate this.
 * 2. **`applyStaleness` never creates a review record.** An item that carries none has nothing
 *    recorded to invalidate, and `itemStateFor` already reads it as `DRAFT`, which refuses release.
 *    Manufacturing a record would drag every paper stored before the item workbench existed under
 *    the workbench on its first edit — `validatePaperApproval` requires *every* item to be approved
 *    the moment *any* item carries a state — so the migration-free claim of task 6.1 would fail.
 * 3. **`CHANGED_AFTER_APPROVAL` is in no transition target list.** It is reachable only through
 *    `applyStaleness` (R4.6), so no request can claim an item was changed after approval, and no
 *    edit can avoid saying so.
 * 4. **The input is never mutated.** `applyStaleness` returns a new paper and shares the untouched
 *    items by reference, so a Released_Form captured before the change stays byte-identical
 *    afterwards (R6.9). Nothing in this module assigns through its argument.
 *
 * Authority is not decided here. Which role may request which transition is `studio-access.ts`'s
 * frozen matrix (R2); this module decides only whether a state is reachable from the item's own
 * content and recorded history.
 */

/* ------------------------------------------------------------------ vocabulary */

export { itemReviewSchema, itemReviewStateSchema };
export type { ItemReview, ItemReviewState };

/** The six states, taken from the schema so the list cannot drift from it. */
export const ITEM_REVIEW_STATES: readonly ItemReviewState[] = Object.freeze([...itemReviewStateSchema.options]);

/** Derived from `itemReviewSchema` rather than restated, for the same reason. */
export type InvalidatedArtifact = ItemReview["invalidated"][number]["artifact"];
export type StalenessTrigger = ItemReview["invalidated"][number]["trigger"];

/** `itemReviewSchema` bounds. Exceeding either would make a produced record unstorable. */
const INVALIDATED_LIMIT = 24;
const HISTORY_LIMIT = 60;
/** `paperDataSchema.staleness.triggeredBy.change` bound. */
const CHANGE_LABEL_LIMIT = 120;

const id = z.string().trim().min(1).max(120);

/* ------------------------------------------------------------------ the dependency graph (R6.1–R6.4) */

/**
 * The facets of one item that an edit can touch. A facet is not a field: the trigger vocabulary in
 * `itemReviewSchema` names the *facet*, and R4.6 names nine fields, so `ITEM_FACET_FOR_FIELD` below
 * maps the nine onto these six. `KEY`, `RUBRIC` and `SEMANTIC_REVIEW` are deliberately absent —
 * they are downstream artifacts, not upstream facets.
 */
export const ITEM_FACETS = ["PROMPT", "OPTIONS", "MARKS", "FIGURES", "OUTCOME_MAP", "SOURCE_REFS"] as const;
export type ItemFacet = (typeof ITEM_FACETS)[number];

type FacetEffect = { readonly trigger: StalenessTrigger; readonly artifacts: readonly InvalidatedArtifact[] };

/**
 * The fixed, shallow dependency graph. One pass over the items is enough because no artifact in a
 * value here is itself a key of it: nothing downstream is upstream of anything.
 *
 * - prompt, options, marks → key, rubric, semantic observation, item approval (R6.1)
 * - figures → figure completeness check, item approval (R6.2)
 * - outcome mapping → the form's coverage check, item approval (R4.6 names outcome mapping)
 * - the item's own source references → semantic observation, item approval (R4.6 names source
 *   references; the observation was made against the evidence that was cited)
 */
export const ITEM_FACET_EFFECTS: Readonly<Record<ItemFacet, FacetEffect>> = Object.freeze({
  PROMPT: { trigger: "PROMPT", artifacts: Object.freeze(["KEY", "RUBRIC", "SEMANTIC_REVIEW", "ITEM_APPROVAL"] as const) },
  OPTIONS: { trigger: "OPTIONS", artifacts: Object.freeze(["KEY", "RUBRIC", "SEMANTIC_REVIEW", "ITEM_APPROVAL"] as const) },
  MARKS: { trigger: "MARKS", artifacts: Object.freeze(["KEY", "RUBRIC", "SEMANTIC_REVIEW", "ITEM_APPROVAL"] as const) },
  FIGURES: { trigger: "FIGURES", artifacts: Object.freeze(["FIGURE_CHECK", "ITEM_APPROVAL"] as const) },
  OUTCOME_MAP: { trigger: "OUTCOME_MAP", artifacts: Object.freeze(["COVERAGE_CHECK", "ITEM_APPROVAL"] as const) },
  SOURCE_REFS: { trigger: "SOURCE_VERSION", artifacts: Object.freeze(["SEMANTIC_REVIEW", "ITEM_APPROVAL"] as const) },
});

/**
 * R4.6's nine fields, mapped onto the six facets. `correctOptionId`, `correctOptionIds` and
 * `numericKey` are the answer key, which is part of the item's option set; `rubric` is its mark
 * allocation; `modelAnswer` is authored prose alongside the prompt. The mapping is explicit here so
 * "any of the nine fields" is one list a test can iterate rather than a claim spread over branches.
 */
export const ITEM_FACET_FOR_FIELD = Object.freeze({
  prompt: "PROMPT",
  modelAnswer: "PROMPT",
  options: "OPTIONS",
  correctOptionId: "OPTIONS",
  correctOptionIds: "OPTIONS",
  numericKey: "OPTIONS",
  marks: "MARKS",
  rubric: "MARKS",
  figures: "FIGURES",
  outcomeIds: "OUTCOME_MAP",
  sourceRefs: "SOURCE_REFS",
} as const);
export type ComparedItemField = keyof typeof ITEM_FACET_FOR_FIELD;
export const COMPARED_ITEM_FIELDS: readonly ComparedItemField[] = Object.freeze(Object.keys(ITEM_FACET_FOR_FIELD) as ComparedItemField[]);

/** Compile-time guards: every compared field is a real question field, and every facet a real trigger. */
type ComparedFieldsExist = ComparedItemField extends keyof Question ? true : never;
type FacetTriggersExist = (typeof ITEM_FACET_EFFECTS)[ItemFacet]["trigger"] extends StalenessTrigger ? true : never;
const graphIsWellFormed: [ComparedFieldsExist, FacetTriggersExist] = [true, true];
void graphIsWellFormed;

/**
 * The facets that differ between two versions of one item, in `COMPARED_ITEM_FIELDS` order.
 *
 * Deep structural comparison, so a reordered object key is not a change and a reordered option list
 * is. An absent optional field and an explicit `undefined` compare unequal, which over-reports
 * rather than under-reports: a spurious invalidation costs a re-review, a missed one costs a wrong
 * approval.
 */
export function itemFacetsChanged(previous: Question, next: Question): ItemFacet[] {
  const facets: ItemFacet[] = [];
  for (const field of COMPARED_ITEM_FIELDS) {
    if (isDeepStrictEqual(previous[field], next[field])) continue;
    const facet = ITEM_FACET_FOR_FIELD[field];
    if (!facets.includes(facet)) facets.push(facet);
  }
  return facets;
}

/* ------------------------------------------------------------------ the change (R6.1–R6.4) */

/**
 * The three change kinds the graph has triggers for, each carrying the triggering actor and the
 * authoritative timestamp that R6.8 displays. A change cannot be recorded without them.
 *
 * `SOURCE_VERSION` matches by source identity because `questionSchema.sourceRefs` carries a
 * `sourceId` and no version: when any version of a source is superseded, every item citing that
 * source has to be re-evidenced, so matching by identity is the only sound match available and is
 * also the conservative one.
 */
export const stalenessChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ITEM_CONTENT"), questionId: id, facet: z.enum(ITEM_FACETS), actorId: id, at: z.iso.datetime() }),
  z.strictObject({ kind: z.literal("SOURCE_VERSION"), sourceId: id, actorId: id, at: z.iso.datetime() }),
  z.strictObject({ kind: z.literal("COVERAGE"), section: id, actorId: id, at: z.iso.datetime() }),
]);
export type StalenessChange = z.infer<typeof stalenessChangeSchema>;

/** Bounded to `paperDataSchema.staleness.triggeredBy.change`, so the form-level record always stores. */
export function changeLabel(change: StalenessChange): string {
  const text = change.kind === "ITEM_CONTENT"
    ? `ITEM_CONTENT ${change.facet} ${change.questionId}`
    : change.kind === "SOURCE_VERSION"
      ? `SOURCE_VERSION ${change.sourceId}`
      : `COVERAGE ${change.section}`;
  return text.slice(0, CHANGE_LABEL_LIMIT);
}

/* ------------------------------------------------------------------ state resolution (R4.1, R4.2) */

/**
 * The item's review state, derived from the item alone (Property 16).
 *
 * Two resolutions happen here and nowhere else:
 *
 * - **No `sourceRefs` at all is `NEEDS_SOURCE`,** whatever is recorded. An item with no cited
 *   evidence cannot be further along than that, so the structural reading wins over a stale record
 *   and R4.2 holds unconditionally instead of only for a fresh item.
 * - **No recorded `review` is `DRAFT`.** Absence means nothing has been reviewed yet, and `DRAFT`
 *   refuses release (R4.10), so a paper stored before the workbench existed is refused rather than
 *   silently releasable.
 *
 * R4.2's other half — a `sourceRefs` entry that does not reference an *approved* source version —
 * needs the curriculum, which this function does not take, precisely so the state stays a property
 * of the item. `validatePaperApproval` owns the approved-source check against the curriculum, and
 * `applyStaleness` with a `SOURCE_VERSION` change owns the superseded case (R6.3).
 */
export function itemStateFor(question: Question): ItemReviewState {
  if (question.sourceRefs.length === 0) return "NEEDS_SOURCE";
  return question.review?.state ?? "DRAFT";
}

/** R4.9: the count of items in each state for one form. Every state is present, including zeroes. */
export function itemStateCounts(paper: PaperData): Record<ItemReviewState, number> {
  const counts = Object.fromEntries(ITEM_REVIEW_STATES.map(state => [state, 0])) as Record<ItemReviewState, number>;
  for (const question of paper.questions) counts[itemStateFor(question)] += 1;
  return counts;
}

/* ------------------------------------------------------------------ transition rules (R4.3–R4.5) */

/**
 * The requestable transitions. Two absences carry the rules rather than a branch doing it:
 *
 * - `APPROVED` is a target of `READY_FOR_REVIEW` only, so an item cannot be approved until an author
 *   has marked it complete with its deterministic checks passing (R4.4 before R4.5).
 * - `CHANGED_AFTER_APPROVAL` is a target of nothing. It belongs to `applyStaleness` alone (R4.6).
 *
 * No state lists itself: re-requesting the current state is refused rather than appending a second
 * identical history entry.
 */
export const ITEM_REVIEW_TRANSITIONS: Readonly<Record<ItemReviewState, readonly ItemReviewState[]>> = Object.freeze({
  DRAFT: Object.freeze(["NEEDS_SOURCE", "NEEDS_CORRECTION", "READY_FOR_REVIEW"] as const),
  NEEDS_SOURCE: Object.freeze(["DRAFT", "NEEDS_CORRECTION", "READY_FOR_REVIEW"] as const),
  NEEDS_CORRECTION: Object.freeze(["DRAFT", "READY_FOR_REVIEW"] as const),
  READY_FOR_REVIEW: Object.freeze(["DRAFT", "NEEDS_CORRECTION", "APPROVED"] as const),
  APPROVED: Object.freeze(["NEEDS_CORRECTION"] as const),
  CHANGED_AFTER_APPROVAL: Object.freeze(["DRAFT", "NEEDS_CORRECTION", "READY_FOR_REVIEW"] as const),
});

export const ITEM_REVIEW_REFUSALS = ["STATE_NOT_REQUESTABLE", "UNREACHABLE_STATE", "MISSING_SOURCE_EVIDENCE", "UNRESOLVED_OBSERVATIONS", "ITEM_REVISION_MISMATCH"] as const;
export type ItemReviewRefusal = (typeof ITEM_REVIEW_REFUSALS)[number];

export type ItemReviewRequest = {
  target: ItemReviewState;
  actorId: string;
  /** The authoritative timestamp, supplied by the caller (R4.5). */
  at: string;
  /** The item revision the actor states they reviewed. Required to approve; checked whenever given. */
  itemRevision?: number;
  /** Unresolved deterministic validation issues and semantic review observations for this item (R4.3). */
  unresolved?: readonly string[];
  note?: string;
};

/**
 * A refusal cannot carry a review record and an acceptance cannot carry a refusal code, so the two
 * halves of a decision cannot disagree. `ITEM_REVISION_MISMATCH` is the 409 the review-state route
 * returns; the rest are 409 or 422 at the boundary's discretion.
 */
export type ItemReviewDecision =
  | { allowed: true; state: ItemReviewState; review: ItemReview }
  | { allowed: false; refusal: ItemReviewRefusal; detail: string };

const refuse = (refusal: ItemReviewRefusal, detail: string): ItemReviewDecision => ({ allowed: false, refusal, detail });

/** The recorded review, or the implied one for an item that carries none. Never written back by itself. */
function baseReview(question: Question): ItemReview {
  return question.review ?? { state: itemStateFor(question), itemRevision: 1, invalidated: [], history: [] };
}

/** The item revision an approval has to state: the recorded one, or 1 for an item with no record. */
export function itemRevisionOf(question: Question): number {
  return question.review?.itemRevision ?? 1;
}

/**
 * Decides one requested transition for one item. Pure, and authority-free: whether this actor may
 * ask is `assertStudioAction`'s answer, not this function's.
 *
 * `invalidated` is cleared on `READY_FOR_REVIEW` and `APPROVED` because both assert that the
 * recorded checks were redone against the item as it now stands — and only against that revision,
 * which is why the stated `itemRevision` is checked first. The entries are not lost: the paper
 * version that carried them is an immutable `SchoolAiRevision` snapshot (R6.6), and `history`
 * retains the transition that cleared them.
 *
 * `approvedBy` survives a move out of `APPROVED` as historical evidence. `validatePaperApproval`
 * reads it only while the state is `APPROVED`, where it catches an approval that belongs to an
 * earlier item revision.
 */
export function itemReviewTransition(question: Question, request: ItemReviewRequest): ItemReviewDecision {
  const { target } = request;
  if (target === "CHANGED_AFTER_APPROVAL") return refuse("STATE_NOT_REQUESTABLE", "An item is changed after approval by an edit, never by request.");
  const current = itemStateFor(question);
  if (!ITEM_REVIEW_TRANSITIONS[current].includes(target)) return refuse("UNREACHABLE_STATE", `An item in ${current} cannot move to ${target}.`);

  const review = baseReview(question);
  const stated = request.itemRevision;
  const revision = itemRevisionOf(question);
  if (target === "APPROVED" && stated === undefined) return refuse("ITEM_REVISION_MISMATCH", `Approving item ${question.id} has to state the item revision being approved.`);
  if (stated !== undefined && stated !== revision) return refuse("ITEM_REVISION_MISMATCH", `Item ${question.id} is at revision ${revision}; the request states ${stated}.`);

  const forward = target === "READY_FOR_REVIEW" || target === "APPROVED";
  if (forward) {
    if (question.sourceRefs.length === 0) return refuse("MISSING_SOURCE_EVIDENCE", `Item ${question.id} cites no source evidence.`);
    const unresolved = request.unresolved ?? [];
    if (unresolved.length) return refuse("UNRESOLVED_OBSERVATIONS", `Item ${question.id} has ${unresolved.length} unresolved observation(s): ${unresolved.slice(0, 3).join("; ")}`);
    if (review.invalidated.length) return refuse("UNRESOLVED_OBSERVATIONS", `Item ${question.id} has ${review.invalidated.length} invalidated check(s) to redo: ${review.invalidated.map(entry => entry.artifact).join(", ")}`);
  }

  return {
    allowed: true,
    state: target,
    review: {
      ...review,
      state: target,
      ...(target === "APPROVED" ? { approvedBy: { actorId: request.actorId, at: request.at, itemRevision: revision } } : {}),
      history: [...review.history, { state: target, actorId: request.actorId, at: request.at, ...(request.note ? { note: request.note } : {}) }].slice(-HISTORY_LIMIT),
    },
  };
}

/* ------------------------------------------------------------------ staleness (R6.1–R6.9) */

type ItemEffect = { readonly trigger: StalenessTrigger; readonly artifacts: readonly InvalidatedArtifact[]; readonly state?: ItemReviewState; readonly bumpRevision: boolean };

/**
 * An edit to an approved item is `CHANGED_AFTER_APPROVAL` (R4.6). An edit to an item that was ready
 * for review is `NEEDS_CORRECTION`, because the key, rubric and semantic observation it was ready on
 * have just been invalidated and are therefore unresolved (R4.3). Every other state already refuses
 * release, so an edit leaves it where it is.
 */
function stateAfterContentChange(current: ItemReviewState): ItemReviewState | undefined {
  if (current === "APPROVED") return "CHANGED_AFTER_APPROVAL";
  if (current === "READY_FOR_REVIEW") return "NEEDS_CORRECTION";
  return undefined;
}

/**
 * What one change does to one item, or `null` when the change does not reach it. Called once per
 * item per change, so the whole of `applyStaleness` is one pass.
 *
 * The `SOURCE_VERSION` change and the `SOURCE_REFS` facet are deliberately different events with
 * different outcomes: a *superseded* source leaves the item's own content untouched and sends it to
 * `NEEDS_SOURCE` (R6.3), while *editing* the item's cited references is a content change that sends
 * an approved item to `CHANGED_AFTER_APPROVAL` (R4.6).
 */
function itemEffect(question: Question, change: StalenessChange, coverageApplies: boolean): ItemEffect | null {
  if (change.kind === "ITEM_CONTENT") {
    if (question.id !== change.questionId) return null;
    const { trigger, artifacts } = ITEM_FACET_EFFECTS[change.facet];
    return { trigger, artifacts, state: stateAfterContentChange(itemStateFor(question)), bumpRevision: true };
  }
  if (change.kind === "SOURCE_VERSION") {
    if (!question.sourceRefs.some(ref => ref.sourceId === change.sourceId)) return null;
    return { trigger: "SOURCE_VERSION", artifacts: ITEM_FACET_EFFECTS.SOURCE_REFS.artifacts, state: "NEEDS_SOURCE", bumpRevision: false };
  }
  // Taught coverage changed. The coverage check is a property of the form, so the item's own state
  // and revision are untouched (R6.4 names the coverage check and nothing else); the per-item entry
  // is what lets the workbench name the affected items under R6.8.
  if (!coverageApplies) return null;
  return { trigger: "COVERAGE", artifacts: Object.freeze(["COVERAGE_CHECK"] as const), bumpRevision: false };
}

type Trigger = { readonly actorId: string; readonly at: string; readonly label: string };

/**
 * The recorded entries with this trigger's artifacts marked invalid. One entry per
 * (artifact, trigger) pair, refreshed to the latest trigger, so a repeated edit cannot grow past
 * `itemReviewSchema`'s 24-entry bound: the graph above reaches 19 pairs at most — 18 from the six
 * item facets and one for the coverage check. The slice is a belt on top of that, so an unstorable
 * record is unreachable rather than merely unlikely.
 */
function invalidate(entries: ItemReview["invalidated"], effect: ItemEffect, trigger: Trigger): ItemReview["invalidated"] {
  const next = [...entries];
  for (const artifact of effect.artifacts) {
    const entry = { artifact, trigger: effect.trigger, actorId: trigger.actorId, at: trigger.at };
    const existing = next.findIndex(candidate => candidate.artifact === artifact && candidate.trigger === effect.trigger);
    if (existing === -1) next.push(entry);
    else next[existing] = entry;
  }
  return next.slice(-INVALIDATED_LIMIT);
}

/**
 * The review after every effect of one triggering change. The effects are folded, so **one edit is
 * one item revision** however many facets of the item it touched, and one history entry records the
 * resulting state. An effect that leaves the state alone appends no history: the invalidated entries
 * carry its evidence under R6.8.
 */
function nextReview(review: ItemReview, effects: readonly ItemEffect[], trigger: Trigger): ItemReview {
  let invalidated = review.invalidated;
  let state = review.state;
  let bump = false;
  for (const effect of effects) {
    invalidated = invalidate(invalidated, effect, trigger);
    if (effect.state) state = effect.state;
    bump = bump || effect.bumpRevision;
  }
  const history = state === review.state
    ? review.history
    : [...review.history, { state, actorId: trigger.actorId, at: trigger.at, note: trigger.label }].slice(-HISTORY_LIMIT);
  return { ...review, state, itemRevision: review.itemRevision + (bump ? 1 : 0), invalidated, history };
}

/**
 * The one pass. `effectsFor` decides each item once, so the whole sweep is `O(items)` and the
 * dependency graph is shallow enough that nothing has to be revisited: no invalidated artifact is
 * itself an upstream facet, so transitive completeness is reached in a single sweep (R6.1–R6.5).
 *
 * Items the change does not reach are carried over **by reference**, and the input is never written
 * to — this function and its callers only build new objects.
 *
 * The form's rehearsal result is invalidated whenever the change reaches this form at all, not only
 * when an item record changed (R6.5, R6.7). That matters for a paper whose items carry no review
 * record: nothing per-item is written, yet the rehearsal did exercise the superseded content, so the
 * release has to be refused. `rehearsalId` is preserved, so the invalid result is still identified.
 */
function sweep(paper: PaperData, effectsFor: (question: Question) => readonly ItemEffect[] | null, trigger: Trigger, reachesForm: boolean): PaperData {
  let reaches = reachesForm;
  let rewritten = false;
  const questions = paper.questions.map(question => {
    const effects = effectsFor(question);
    if (!effects?.length) return question;
    // The change reaches this form even when the item carries no record to invalidate.
    reaches = true;
    if (!question.review) return question;
    rewritten = true;
    return { ...question, review: nextReview(question.review, effects, trigger) };
  });
  if (!reaches) return { ...paper };
  const staleness: NonNullable<PaperData["staleness"]> = {
    ...paper.staleness,
    rehearsalValid: false,
    invalidatedAt: trigger.at,
    triggeredBy: { actorId: trigger.actorId, change: trigger.label },
  };
  return { ...paper, ...(rewritten ? { questions } : {}), staleness };
}

/**
 * Applies one change to one paper and returns a new paper. **Pure, single pass, never mutating.**
 *
 * R6.9 needs no code here. The input is never written to and a released form is a separate immutable
 * snapshot, so an upstream edit after release leaves it byte-identical; the test asserts that
 * against a deep-frozen paper and its canonical serialization.
 */
export function applyStaleness(paper: PaperData, change: StalenessChange): PaperData {
  const coverageApplies = change.kind === "COVERAGE" && paper.coverageSection === change.section;
  const trigger: Trigger = { actorId: change.actorId, at: change.at, label: changeLabel(change) };
  return sweep(paper, question => {
    const effect = itemEffect(question, change, coverageApplies);
    return effect ? [effect] : null;
  }, trigger, coverageApplies);
}

/**
 * Every facet that differs between two versions of one item, applied in one pass.
 *
 * The convenience that keeps R4.6 honest: an edit path hands over the item as it was and as it is,
 * and cannot forget one of the nine fields. An edit that changes nothing R4.6 names returns an equal
 * copy and leaves the rehearsal result alone.
 *
 * `paper` may be the version that still carries `previous` or the one that already carries `next`:
 * the invalidation is decided from the recorded review, which both carry unchanged.
 */
export function applyItemEdit(paper: PaperData, previous: Question, next: Question, actor: { actorId: string; at: string }): PaperData {
  const facets = itemFacetsChanged(previous, next);
  if (!facets.length) return { ...paper };
  const trigger: Trigger = { actorId: actor.actorId, at: actor.at, label: `ITEM_CONTENT ${facets.join("+")} ${next.id}`.slice(0, CHANGE_LABEL_LIMIT) };
  return sweep(paper, question => {
    if (question.id !== next.id) return null;
    const state = stateAfterContentChange(itemStateFor(question));
    return facets.map(facet => ({ ...ITEM_FACET_EFFECTS[facet], state, bumpRevision: true }));
  }, trigger, false);
}

export class PaperReviewWriteError extends Error {
  constructor(message: string, readonly status: 403 | 422 = 403) {
    super(message);
    this.name = "PaperReviewWriteError";
  }
}

/**
 * Ordinary content writes cannot manufacture review decisions or rehearsal receipts. A client may
 * echo their current values or omit them (older editors do not know these fields), but only the
 * saved record supplies authority. The repository calls this after parsing, inside its normal CAS
 * update. A future review/rehearsal service must authorize its own transition separately.
 *
 * Legacy papers stay legacy: no item-review records are invented, and an untracked paper does not
 * acquire a rehearsal record simply because its text changed. Existing immutable revisions and
 * issued snapshots are never mutated. All edits in this save advance a tracked item only once.
 */
export function preparePaperContentWrite(previous: PaperData | null, incoming: PaperData, actor: { actorId: string; at: string }): PaperData {
  if (new Set(incoming.questions.map(question => question.id)).size !== incoming.questions.length) {
    throw new PaperReviewWriteError("Question identifiers must be unique before saving the paper.", 422);
  }
  const saved = new Map(previous?.questions.map(question => [question.id, question]) ?? []);
  if (incoming.staleness !== undefined && !isDeepStrictEqual(incoming.staleness, previous?.staleness)) {
    throw new PaperReviewWriteError("Rehearsal evidence cannot be changed through an ordinary paper save.");
  }
  for (const question of incoming.questions) {
    if (question.review !== undefined && !isDeepStrictEqual(question.review, saved.get(question.id)?.review)) {
      throw new PaperReviewWriteError("Item review decisions cannot be changed through an ordinary paper save.");
    }
  }
  if (!previous) return incoming;

  const tracked = previous.staleness !== undefined || previous.questions.some(question => question.review !== undefined);
  const curriculumChanged = previous.curriculumId !== incoming.curriculumId || previous.curriculumVersion !== incoming.curriculumVersion || previous.subjectId !== incoming.subjectId || previous.classId !== incoming.classId;
  const languageChanged = previous.language !== incoming.language;
  let formChanged = curriculumChanged || languageChanged || !isDeepStrictEqual(previous.blueprint, incoming.blueprint)
    || previous.coverageSection !== incoming.coverageSection || !isDeepStrictEqual(previous.resources, incoming.resources)
    || !isDeepStrictEqual(previous.formSet, incoming.formSet) || !isDeepStrictEqual(previous.itemGroupIds, incoming.itemGroupIds)
    || !isDeepStrictEqual(previous.questions.map(question => question.id), incoming.questions.map(question => question.id));
  const questions = incoming.questions.map(question => {
    const before = saved.get(question.id);
    const unreviewed = () => tracked ? { ...question, review: { ...baseReview(question), history: [{ state: itemStateFor(question), ...actor, note: "Review required for this item." }] } } : question;
    if (!before) return unreviewed();
    const facets = itemFacetsChanged(before, question);
    const include = (facet: ItemFacet) => { if (!facets.includes(facet)) facets.push(facet); };
    // These context changes alter what the same authored fields mean.
    if (before.type !== question.type) include("OPTIONS");
    if (before.sectionId !== question.sectionId) include("OUTCOME_MAP");
    if (!isDeepStrictEqual(before.reusedFrom, question.reusedFrom)) include("SOURCE_REFS");
    if (languageChanged) include("PROMPT");
    if (facets.length) formChanged = true;
    if (!before.review) return unreviewed();
    const state = stateAfterContentChange(itemStateFor(before));
    const effects: ItemEffect[] = facets.map(facet => ({ ...ITEM_FACET_EFFECTS[facet], state, bumpRevision: true }));
    if (curriculumChanged) effects.push({ trigger: "SOURCE_VERSION", artifacts: ITEM_FACET_EFFECTS.SOURCE_REFS.artifacts, state: "NEEDS_SOURCE", bumpRevision: false });
    const label = `${curriculumChanged ? "SOURCE_VERSION " : ""}ITEM_CONTENT ${facets.join("+")} ${question.id}`.slice(0, CHANGE_LABEL_LIMIT);
    return { ...question, review: effects.length ? nextReview(before.review, effects, { ...actor, label }) : before.review };
  });
  const staleness = formChanged && tracked ? {
    ...previous.staleness,
    rehearsalValid: false,
    invalidatedAt: actor.at,
    triggeredBy: { actorId: actor.actorId, change: "PAPER_CONTENT_CHANGED" },
  } : previous.staleness;
  // Omission never clears a server-owned record; a content-only client remains compatible.
  const { staleness: _submittedRehearsal, ...content } = incoming;
  return { ...content, questions, ...(staleness ? { staleness } : {}) };
}

/* ------------------------------------------------------------------ what the workbench displays (R6.8) */

export type StalenessNotice = {
  scope: "ITEM" | "FORM";
  questionId: string | null;
  /** `REHEARSAL_RESULT` is the form-level artifact; the rest are `itemReviewSchema`'s. */
  artifact: InvalidatedArtifact | "REHEARSAL_RESULT";
  trigger: StalenessTrigger | null;
  /** The triggering change, as recorded. */
  change: string;
  actorId: string;
  at: string;
};

/**
 * R6.8: every invalidated artifact with its triggering change, triggering actor and authoritative
 * timestamp. A projection of what is already recorded — nothing here is inferred, so an artifact
 * with no recorded trigger cannot appear.
 */
export function stalenessNotices(paper: PaperData): StalenessNotice[] {
  const notices: StalenessNotice[] = [];
  for (const question of paper.questions) {
    for (const entry of question.review?.invalidated ?? []) {
      notices.push({ scope: "ITEM", questionId: question.id, artifact: entry.artifact, trigger: entry.trigger, change: entry.trigger, actorId: entry.actorId, at: entry.at });
    }
  }
  const form = paper.staleness;
  if (form && !form.rehearsalValid && form.triggeredBy && form.invalidatedAt) {
    notices.push({ scope: "FORM", questionId: null, artifact: "REHEARSAL_RESULT", trigger: null, change: form.triggeredBy.change, actorId: form.triggeredBy.actorId, at: form.invalidatedAt });
  }
  return notices;
}

/* ------------------------------------------------------------------ release blockers (R4.10, R6.7, R7.4) */

export const RELEASE_BLOCKER_CODES = ["ITEM_NOT_APPROVED", "REHEARSAL_INVALID", "REHEARSAL_BLOCKER"] as const;
export type ReleaseBlockerCode = (typeof RELEASE_BLOCKER_CODES)[number];
export type ReleaseBlocker = { code: ReleaseBlockerCode; detail: string; questionIds: readonly string[] };

/** The severity projection of one rehearsal result. The rehearsal module owns the full record. */
export type RehearsalResultSummary = { check: string; severity: "BLOCKING" | "ADVISORY"; questionIds?: readonly string[] };

/**
 * The release blockers this module can answer for: an item not approved (R4.10), an invalid
 * rehearsal result (R6.7) and each `BLOCKING` rehearsal result (R7.4). An `ADVISORY` result is
 * reported by the rehearsal surface and blocks nothing.
 *
 * It is not the whole release precondition set. That a rehearsal exists at all, that it was recorded
 * against the exact form revision, the content hash and the sealed window belong to `release.ts`.
 */
export function releaseBlockers(paper: PaperData, rehearsal: readonly RehearsalResultSummary[] = []): ReleaseBlocker[] {
  const blockers: ReleaseBlocker[] = [];
  const unapproved = paper.questions.filter(question => itemStateFor(question) !== "APPROVED");
  if (unapproved.length) {
    const counts = itemStateCounts(paper);
    const summary = ITEM_REVIEW_STATES.filter(state => state !== "APPROVED" && counts[state] > 0).map(state => `${counts[state]} ${state}`).join(", ");
    blockers.push({ code: "ITEM_NOT_APPROVED", detail: `Approve every item before releasing this form: ${summary}.`, questionIds: unapproved.map(question => question.id) });
  }
  if (paper.staleness && !paper.staleness.rehearsalValid) {
    blockers.push({ code: "REHEARSAL_INVALID", detail: `The recorded rehearsal result is invalid${paper.staleness.triggeredBy ? ` after ${paper.staleness.triggeredBy.change}` : ""}. Rehearse this form again.`, questionIds: [] });
  }
  for (const result of rehearsal) {
    if (result.severity !== "BLOCKING") continue;
    blockers.push({ code: "REHEARSAL_BLOCKER", detail: `Rehearsal check ${result.check} is blocking.`, questionIds: result.questionIds ?? [] });
  }
  return blockers;
}

/** R4.10 and R6.7 as one answer. False is the safe direction: every refusal is an absent blocker list. */
export function canRelease(paper: PaperData, rehearsal: readonly RehearsalResultSummary[] = []): boolean {
  return releaseBlockers(paper, rehearsal).length === 0;
}
