import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { candidatePaper, paperDataSchema, type PaperData } from "../../src/lib/school-ai/assessment";
import { buildCandidatePaperHtml } from "../../src/lib/school-ai/paper-print";
import { VALIDATION_GATE_IDS, resolveDeliveryPolicy, type ResolvedDeliveryPolicy } from "../../src/lib/school-ai/delivery-policy";
import {
  CONTENT_HASH_ALGORITHM,
  CONTENT_HASH_DIGEST_ENCODING,
  CONTENT_HASH_INPUT_ENCODING,
  CONTENT_HASH_PREFIX_LENGTH,
  CONTENT_HASH_SCHEME_VERSION,
  PROJECTION_FIELD_NAMES,
  PROTECTED_KEY_FIELDS,
  RELEASE_REFUSAL_CODES,
  SOLE_FORM_LABEL,
  assertKeyFreeProjection,
  contentHash,
  contentHashInput,
  contentHashInputJson,
  contentHashPrefix,
  contentHashSchema,
  formLabelOf,
  releasePreconditions,
  releaseProtectedKey,
  verifyContentHash,
  type FormLabel,
  type ReleaseDecision,
  type ReleaseFormCandidate,
  type ReleaseRefusalCode,
  type ReleaseRequest,
} from "../../src/lib/school-ai/release";
import { FIXED_EPOCH_MS, arbitraryPaper, isoAt, xorshift } from "./exam-studio-generators";

/**
 * Task 10.1: the Content_Hash and the release preconditions, by named example.
 *
 * The four property tests over this area are owned by their own tasks and append below the marker
 * at the foot of this file, so no two tasks edit one region:
 *
 * - Property 6 (task 10.5), no candidate-facing payload carries a protected value
 * - Property 7 (task 10.6), content hash round trip
 * - Property 8 (task 10.7) lives in `exam-studio-print.browser.spec.ts`, which needs a browser
 * - Property 18 (task 10.8) lives in `exam-studio-versions.database.test.ts`
 *
 * Everything here is pure and runs under `npm run test:school-ai`.
 */

const SEED = 0x51c0408;
const RELEASER = "actor-approver-1";
const AUTHOR = "actor-author-1";
const REHEARSAL_ID = "rehearsal-7f3a";
const VERSION = 7;
const NOW = new Date(FIXED_EPOCH_MS);
const APPROVED_AT = isoAt(-600_000);
const HEX64 = "a".repeat(64);

/** One deterministic draw, reused so every example below describes the same paper. */
const draw = (seed = SEED, edgeCase: "TYPICAL" | "FOUR_FORMS_IDENTICAL_BLUEPRINT" = "TYPICAL") => arbitraryPaper(xorshift(seed), { edgeCase, language: "en" });

const parse = (paper: unknown): PaperData => paperDataSchema.parse(paper);

const basePaper = (overrides: Partial<PaperData> = {}): PaperData => parse({ ...draw().paper, ...overrides });

/** Every item approved at the revision being released, which is what R4.10 asks of a release. */
const approveItems = (paper: PaperData, itemRevision = 3): PaperData =>
  parse({
    ...paper,
    questions: paper.questions.map(question => ({
      ...question,
      review: { state: "APPROVED", itemRevision, approvedBy: { actorId: RELEASER, at: APPROVED_AT, itemRevision }, invalidated: [], history: [{ state: "APPROVED", actorId: RELEASER, at: APPROVED_AT }] },
    })),
  });

const recordRehearsal = (paper: PaperData, overrides: Partial<NonNullable<PaperData["staleness"]>> = {}): PaperData =>
  parse({ ...paper, staleness: { rehearsalValid: true, rehearsalId: REHEARSAL_ID, ...overrides } });

const withFormSet = (paper: PaperData, label: FormLabel): PaperData => parse({ ...paper, formSet: { id: "form-set-1", label, blueprintHash: HEX64 } });

/** A releasable form: approved items, a valid rehearsal recorded against the released revision. */
const releasableForm = (overrides: Partial<ReleaseFormCandidate> = {}): ReleaseFormCandidate => ({
  label: SOLE_FORM_LABEL,
  namedVersion: VERSION,
  reviewedVersion: VERSION,
  paper: recordRehearsal(approveItems(basePaper())),
  authoredBy: AUTHOR,
  rehearsal: { rehearsalId: REHEARSAL_ID, revision: VERSION, blockingChecks: [] },
  unresolvedObservations: [],
  parityFailures: [],
  ...overrides,
});

const releasableRequest = (overrides: Partial<ReleaseRequest> = {}): ReleaseRequest => ({
  rehearsalId: REHEARSAL_ID,
  releasedBy: RELEASER,
  now: NOW,
  policy: resolveDeliveryPolicy(null),
  forms: [releasableForm()],
  ...overrides,
});

/** A stored, approved school policy. Asserted to have parsed, because an unreadable one would degrade to the platform default and pass vacuously. */
function schoolPolicy(overrides: Record<string, unknown> = {}): ResolvedDeliveryPolicy {
  const resolved = resolveDeliveryPolicy({
    recordId: "policy-1",
    version: 2,
    data: {
      tier: "STANDARD",
      requiredClient: "NONE",
      requiredConfigKeyId: null,
      supportedDevices: [],
      gates: VALIDATION_GATE_IDS.map(gate => ({ gate, passedOn: null, owner: "SKO-449", evidence: "Awaiting a dated pass on real devices from SKO-449." })),
      localReleaseSeconds: 120,
      emergencyExitPath: "The managed client quit path, documented for invigilators.",
      permittedFallbackTier: null,
      attemptSupportPaths: [],
      captureRequired: false,
      separationOfDuties: "NOT_REQUIRED",
      maxForms: 4,
      expiresOn: null,
      ...overrides,
    },
  });
  assert.equal(resolved.source, "SCHOOL_POLICY", "the test policy must parse, or the refusal under test would never be reached");
  return resolved;
}

const codes = (decision: ReleaseDecision): ReleaseRefusalCode[] => decision.refusals.map(entry => entry.code);
const refuse = (request: ReleaseRequest) => {
  const decision = releasePreconditions(request);
  assert.equal(decision.canRelease, false, `expected a refusal, got ${JSON.stringify(decision)}`);
  return decision;
};
const seal = (request: ReleaseRequest) => {
  const decision = releasePreconditions(request);
  assert.equal(decision.canRelease, true, `expected a release, refused with ${JSON.stringify(decision.refusals)}`);
  return decision;
};

/** Every field name reachable in a value, so a projection can be compared against an allow-list. */
function fieldNames(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) fieldNames(item, into);
    return into;
  }
  if (typeof value !== "object" || value === null) return into;
  for (const [key, item] of Object.entries(value)) {
    into.add(key);
    fieldNames(item, into);
  }
  return into;
}

// ---------------------------------------------------------------------------------------------
// An independent verifier (R19.3)
// ---------------------------------------------------------------------------------------------

/**
 * A second implementation of the published recipe, written without importing `canonical.ts`: sort
 * object keys by code unit, serialize, hash the UTF-8 bytes with sha256. This is the part R19.3
 * turns on — a collated key order or a host-dependent encoding would make an outside recomputation
 * impossible — so it is re-implemented rather than reused. The projection itself comes from
 * `candidatePaper`, whose allow-list is published alongside the recipe.
 */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function independentJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(independentJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => byCodeUnit(a, b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${independentJson(item)}`).join(",")}}`;
}

const independentNormalize = (value: unknown): unknown => {
  if (typeof value === "string") return value.replace(/\r\n?/gu, "\n").replace(/[ \t]+$/gmu, "").normalize("NFC");
  if (Array.isArray(value)) return value.map(independentNormalize);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, independentNormalize(item)]));
  return value;
};

const independentContentHash = (paper: PaperData): string =>
  createHash("sha256")
    .update(Buffer.from(independentJson({ v: 1, language: paper.language, formLabel: paper.formSet?.label ?? "A", projection: independentNormalize(candidatePaper(paper)) }), "utf8"))
    .digest("hex");

// ---------------------------------------------------------------------------------------------
// The Content_Hash
// ---------------------------------------------------------------------------------------------

test("the content hash is recomputable by an independent implementation of the published recipe", () => {
  assert.equal(CONTENT_HASH_SCHEME_VERSION, 1);
  assert.equal(CONTENT_HASH_ALGORITHM, "sha256");
  assert.equal(CONTENT_HASH_INPUT_ENCODING, "utf-8");
  assert.equal(CONTENT_HASH_DIGEST_ENCODING, "hex-lowercase");
  for (const paper of [basePaper(), basePaper({ language: "ar" }), withFormSet(basePaper(), "C"), basePaper({ resources: [{ id: "r1", title: "Formula sheet", content: "Addition combines numbers.", approved: true }] })]) {
    const hash = contentHash(paper);
    assert.ok(contentHashSchema.safeParse(hash).success, `${hash} is not lowercase hex`);
    assert.equal(hash, independentContentHash(paper));
    // The stated recipe and the exported text agree byte for byte.
    assert.equal(hash, createHash(CONTENT_HASH_ALGORITHM).update(Buffer.from(contentHashInputJson(paper), "utf8")).digest("hex"));
  }
});

test("the hash input is the four published fields and nothing else", () => {
  const paper = withFormSet(basePaper({ language: "ur" }), "B");
  const input = contentHashInput(paper);
  assert.deepEqual(Object.keys(input).sort(byCodeUnit), ["formLabel", "language", "projection", "v"]);
  assert.equal(input.v, CONTENT_HASH_SCHEME_VERSION);
  assert.equal(input.language, "ur");
  assert.equal(input.formLabel, "B");
  // Key order in the serialized text is code unit, which is what an outside verifier reproduces.
  assert.match(contentHashInputJson(paper), /^\{"formLabel":"B","language":"ur","projection":\{/u);
  assert.equal(formLabelOf(paper), "B");
  assert.equal(formLabelOf(basePaper()), SOLE_FORM_LABEL, "a paper with no recorded form set is the sole form of its sitting");
});

test("the hash is independent of key order and of insignificant whitespace", () => {
  const raw = "Line one   \r\nLine two\twith a tab\t\r\nCafe\u0301 ends here";
  const normalized = "Line one\nLine two\twith a tab\nCaf\u00e9 ends here";
  const withText = (prompt: string) => {
    const paper = basePaper();
    return parse({ ...paper, questions: [{ ...paper.questions[0], prompt }, ...paper.questions.slice(1)] });
  };
  // CRLF, trailing spaces and tabs, and Unicode decomposition all hash to one value.
  assert.equal(contentHash(withText(raw)), contentHash(withText(normalized)));
  // A significant difference still moves the hash: normalization is not erasure.
  assert.notEqual(contentHash(withText(`${normalized} `.replace(/ $/u, "!"))), contentHash(withText(normalized)));

  // Key order: the same paper rebuilt with every object's keys in reverse insertion order. Not
  // re-parsed, because Zod rebuilds an object in schema order and would undo the reordering.
  const paper = basePaper();
  const reversed = JSON.parse(JSON.stringify(paper, (_key, value) => (value !== null && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value))) as PaperData;
  assert.notDeepEqual(Object.keys(reversed), Object.keys(paper));
  assert.deepEqual(Object.keys(reversed), [...Object.keys(paper)].reverse());
  assert.equal(contentHash(reversed), contentHash(paper));
});

test("whitespace normalization reaches the hash input only, never stored or rendered content", () => {
  const raw = "Trailing spaces here   \r\nand a CRLF line";
  const paper = (() => {
    const base = basePaper();
    return parse({ ...base, questions: [{ ...base.questions[0], prompt: raw }, ...base.questions.slice(1)] });
  })();
  const before = structuredClone(paper);

  assert.ok(contentHashSchema.safeParse(contentHash(paper)).success);
  assert.deepEqual(paper, before, "computing a content hash must not touch the paper it describes");

  // The stored projection keeps the original bytes; only the hash input is normalized.
  const stored = candidatePaper(paper);
  assert.equal(stored.questions[0].prompt, raw);
  assert.ok(!contentHashInputJson(paper).includes("\\r"), "the hash input carries no carriage return");
  assert.equal(contentHashInput(paper).projection.questions[0].prompt, "Trailing spaces here\nand a CRLF line");
  assert.equal(stored.questions[0].prompt, raw, "deriving the hash input must not touch the stored projection");

  // The print renderer keeps them too, and still agrees with the hash of the un-normalized paper.
  const html = buildCandidatePaperHtml(paper, VERSION);
  assert.ok(html.includes(raw), "the print output renders the authored bytes, not the hash-normalized ones");
  assert.equal(verifyContentHash(paper, contentHash(paper)).matches, true);
});

test("each language version and each form label carries its own hash", () => {
  const english = basePaper({ language: "en" });
  const arabic = parse({ ...english, language: "ar" });
  const urdu = parse({ ...english, language: "ur" });
  // The projections are byte-identical, so the language is the only thing distinguishing them:
  // without it inside the hash input these three would collide on one hash (R9.9).
  assert.deepEqual(candidatePaper(arabic), candidatePaper(english));
  assert.deepEqual(candidatePaper(urdu), candidatePaper(english));
  const hashes = [contentHash(english), contentHash(arabic), contentHash(urdu)];
  assert.equal(new Set(hashes).size, 3, `two language versions collided: ${hashes.join(", ")}`);

  const formA = withFormSet(english, "A");
  const formB = withFormSet(english, "B");
  assert.deepEqual(candidatePaper(formB), candidatePaper(formA));
  assert.notEqual(contentHash(formB), contentHash(formA));
  // A sole form and that same paper recorded as form A of a set seal to the same hash.
  assert.equal(contentHash(formA), contentHash(english));
});

test("the hash input carries no protected field, and the allow-list refuses one that appears", () => {
  const paper = approveItems(basePaper());
  const projection = contentHashInput(paper).projection;
  const present = fieldNames(projection);
  for (const field of PROTECTED_KEY_FIELDS) assert.ok(!present.has(field), `the candidate projection carries the protected field ${field}`);
  for (const field of present) assert.ok((PROJECTION_FIELD_NAMES as readonly string[]).includes(field), `the candidate projection carries ${field}, which the hash input does not declare`);
  // The two lists cannot overlap, so no field is both candidate-facing and protected.
  for (const field of PROTECTED_KEY_FIELDS) assert.ok(!(PROJECTION_FIELD_NAMES as readonly string[]).includes(field));

  // Asserted, not assumed: a protected field smuggled into a projection refuses the seal.
  const [question, ...rest] = projection.questions;
  assert.throws(() => assertKeyFreeProjection({ ...projection, questions: [{ ...question, modelAnswer: "The answer is four." }, ...rest] }), /CONTENT_HASH_PROTECTED_FIELD:\$\.projection\.questions\[0\]\.modelAnswer/u);
  assert.throws(() => assertKeyFreeProjection({ ...projection, questions: [{ ...question, review: { state: "APPROVED" } }, ...rest] }), /CONTENT_HASH_PROTECTED_FIELD/u);
  // An undeclared field refuses too: a ban-list would only stop the leaks someone thought of.
  assert.throws(() => assertKeyFreeProjection({ ...projection, questions: [{ ...question, invigilatorNote: "see me" }, ...rest] }), /CONTENT_HASH_UNEXPECTED_FIELD:\$\.projection\.questions\[0\]\.invigilatorNote/u);
  // `candidatePaper` blanks the section outcome mapping rather than dropping the key, so a populated one is a leak.
  assert.throws(() => assertKeyFreeProjection({ ...projection, sections: projection.sections.map(section => ({ ...section, outcomeIds: ["outcome-1"] })) }), /CONTENT_HASH_PROTECTED_FIELD/u);
  assert.doesNotThrow(() => assertKeyFreeProjection(projection));
});

test("no authored key, rubric or source excerpt appears in the serialized hash input", () => {
  const paper = basePaper();
  const json = contentHashInputJson(paper);
  // Long authored strings only. A correct option identifier and a numeric key value are single
  // tokens that legitimately appear as an option identifier or option text, so the value-level
  // sweep over every protected field is Property 6's (task 10.5) and the rehearsal's R7.5 check.
  const protectedValues = paper.questions.flatMap(question => [question.modelAnswer, ...question.rubric.map(criterion => criterion.criterion), ...question.sourceRefs.map(ref => ref.excerpt)]).filter(value => value.trim().length > 12);
  assert.ok(protectedValues.length > 0, "the fixture must carry protected values for this to mean anything");
  for (const value of protectedValues) assert.ok(!json.includes(value), `the hash input carries the protected value ${JSON.stringify(value)}`);
});

test("the protected key is a separate payload from the candidate projection", () => {
  const paper = basePaper();
  const key = releaseProtectedKey(paper);
  assert.equal(key.formLabel, formLabelOf(paper));
  assert.equal(key.language, paper.language);
  assert.deepEqual(key.items.map(item => item.questionId), paper.questions.map(question => question.id));
  for (const [index, item] of key.items.entries()) {
    const question = paper.questions[index];
    assert.equal(item.modelAnswer, question.modelAnswer);
    assert.deepEqual(item.rubric, question.rubric);
    assert.equal(item.correctOptionId, question.correctOptionId);
    assert.deepEqual(item.numericKey, question.numericKey);
    assert.deepEqual(item.correctOptionIds, question.correctOptionIds);
  }
  // The key payload carries no candidate content, so neither half is a copy of the other.
  const keyFields = fieldNames(key);
  for (const field of ["prompt", "options", "text", "figures", "png", "instructions", "sections"]) assert.ok(!keyFields.has(field), `the protected key payload carries candidate content: ${field}`);
});

test("verification reports a mismatch with both prefixes, and an unreadable stored hash as unreadable", () => {
  const paper = approveItems(basePaper());
  const sealed = contentHash(paper);
  const match = verifyContentHash(paper, sealed);
  assert.equal(match.matches, true);
  assert.equal(match.matches && match.prefix, contentHashPrefix(sealed));
  assert.equal(contentHashPrefix(sealed).length, CONTENT_HASH_PREFIX_LENGTH);

  // One content byte changed: both renderers refuse rather than serve (R8.3, R8.4).
  const tampered = parse({ ...paper, questions: [{ ...paper.questions[0], prompt: `${paper.questions[0].prompt}.` }, ...paper.questions.slice(1)] });
  const mismatch = verifyContentHash(tampered, sealed);
  assert.equal(mismatch.matches, false);
  if (!mismatch.matches) {
    assert.equal(mismatch.code, "CONTENT_HASH_MISMATCH");
    assert.equal(mismatch.stored, sealed);
    assert.equal(mismatch.storedPrefix, contentHashPrefix(sealed));
    assert.equal(mismatch.recomputed, contentHash(tampered));
    assert.equal(mismatch.recomputedPrefix, contentHashPrefix(contentHash(tampered)));
    assert.notEqual(mismatch.storedPrefix, mismatch.recomputedPrefix);
    assert.equal(mismatch.storedReadable, true);
  }

  // A stored value that is not a lowercase hex digest has no prefix worth displaying.
  for (const stored of ["", "not-a-hash", sealed.toUpperCase(), sealed.slice(0, 63)]) {
    const unreadable = verifyContentHash(paper, stored);
    assert.equal(unreadable.matches, false);
    if (!unreadable.matches) {
      assert.equal(unreadable.storedReadable, false);
      assert.equal(unreadable.storedPrefix, null);
      assert.equal(unreadable.recomputed, sealed);
    }
  }
});

test("an edit after release cannot move the released revision's hash", () => {
  const released = recordRehearsal(approveItems(basePaper()));
  const sealedHash = contentHash(released);
  const edited = parse({ ...released, questions: [{ ...released.questions[0], prompt: "Edited after release." }, ...released.questions.slice(1)] });
  assert.notEqual(contentHash(edited), sealedHash);
  assert.equal(contentHash(released), sealedHash, "the hash is a function of the released revision alone");
  assert.equal(verifyContentHash(released, sealedHash).matches, true);
  assert.equal(verifyContentHash(edited, sealedHash).matches, false);
});

// ---------------------------------------------------------------------------------------------
// Release preconditions
// ---------------------------------------------------------------------------------------------

test("a request that satisfies every precondition seals each form with the five recorded fields", () => {
  const decision = seal(releasableRequest());
  assert.deepEqual(decision.refusals, []);
  assert.equal(decision.sealed.length, 1);
  const [sealed] = decision.sealed;
  assert.deepEqual(Object.keys(sealed).sort(byCodeUnit), ["contentHash", "formLabel", "language", "rehearsalId", "releasedAt", "releasedBy", "releasedVersion"]);
  assert.equal(sealed.releasedBy, RELEASER);
  assert.equal(sealed.releasedAt, NOW.toISOString());
  assert.equal(sealed.releasedVersion, VERSION);
  assert.equal(sealed.rehearsalId, REHEARSAL_ID);
  assert.equal(sealed.formLabel, SOLE_FORM_LABEL);
  assert.equal(sealed.language, "en");
  assert.equal(sealed.contentHash, contentHash(parse(releasableForm().paper)));
});

test("a form set seals one hash per form and per language, and no two collide", () => {
  const { forms } = draw(SEED, "FOUR_FORMS_IDENTICAL_BLUEPRINT");
  const candidates = forms.slice(0, 2).flatMap(form =>
    (["en", "ar"] as const).map(language =>
      releasableForm({ label: form.label, paper: recordRehearsal(approveItems(withFormSet(parse({ ...form.paper, language }), form.label))) }),
    ),
  );
  const decision = seal(releasableRequest({ forms: candidates }));
  assert.equal(decision.sealed.length, 4);
  assert.equal(new Set(decision.sealed.map(entry => entry.contentHash)).size, 4);
  assert.deepEqual(decision.sealed.map(entry => `${entry.formLabel}:${entry.language}`), ["A:en", "A:ar", "B:en", "B:ar"]);
});

test("a release naming a revision other than the reviewed revision is refused with the mismatch reported", () => {
  const decision = refuse(releasableRequest({ forms: [releasableForm({ namedVersion: VERSION, reviewedVersion: VERSION + 1 })] }));
  assert.deepEqual(codes(decision).filter(code => code === "REVISION_MISMATCH"), ["REVISION_MISMATCH"]);
  const [mismatch] = decision.refusals.filter(entry => entry.code === "REVISION_MISMATCH");
  assert.match(mismatch.detail, /revision 7/u);
  assert.match(mismatch.detail, /revision 8 is the revision under review/u);
  assert.equal(mismatch.formLabel, SOLE_FORM_LABEL);
  assert.deepEqual(decision.sealed, []);
});

test("a release is refused while any item is not approved at the released item revision", () => {
  const paper = recordRehearsal(approveItems(basePaper()));
  const states = ["DRAFT", "NEEDS_SOURCE", "NEEDS_CORRECTION", "READY_FOR_REVIEW", "CHANGED_AFTER_APPROVAL"] as const;
  for (const state of states) {
    const altered = parse({ ...paper, questions: [{ ...paper.questions[0], review: { state, itemRevision: 3, invalidated: [], history: [] } }, ...paper.questions.slice(1)] });
    const decision = refuse(releasableRequest({ forms: [releasableForm({ paper: altered })] }));
    assert.ok(codes(decision).includes("ITEM_NOT_APPROVED"), `${state} must refuse a release`);
    const [unapproved] = decision.refusals.filter(entry => entry.code === "ITEM_NOT_APPROVED");
    assert.deepEqual(unapproved.itemIds, [paper.questions[0].id]);
  }
  // An item carrying no recorded review state is never approved, so it needs no fallback rule.
  const { review: _dropped, ...unreviewed } = paper.questions[0];
  assert.ok(codes(refuse(releasableRequest({ forms: [releasableForm({ paper: parse({ ...paper, questions: [unreviewed, ...paper.questions.slice(1)] }) })] }))).includes("ITEM_NOT_APPROVED"));
  // An approval recorded against an earlier item revision is not an approval of this item.
  const stale = parse({ ...paper, questions: [{ ...paper.questions[0], review: { state: "APPROVED", itemRevision: 4, approvedBy: { actorId: RELEASER, at: APPROVED_AT, itemRevision: 3 }, invalidated: [], history: [] } }, ...paper.questions.slice(1)] });
  assert.ok(codes(refuse(releasableRequest({ forms: [releasableForm({ paper: stale })] }))).includes("ITEM_NOT_APPROVED"));
});

test("a release is refused while the rehearsal result is missing, stale, unknown or blocking", () => {
  const approved = approveItems(basePaper());

  // No rehearsal recorded on the paper and none to read.
  assert.deepEqual(codes(refuse(releasableRequest({ forms: [releasableForm({ paper: approved, rehearsal: null })] }))), ["REHEARSAL_MISSING", "REHEARSAL_MISSING"]);

  // Recorded and then invalidated by an upstream change (R6.7).
  const invalidated = recordRehearsal(approved, { rehearsalValid: false, invalidatedAt: isoAt(-60_000), triggeredBy: { actorId: AUTHOR, change: "PROMPT" } });
  const staleDecision = refuse(releasableRequest({ forms: [releasableForm({ paper: invalidated })] }));
  assert.deepEqual(codes(staleDecision), ["REHEARSAL_STALE"]);
  assert.match(staleDecision.refusals[0].detail, /invalidated at .* by a PROMPT change/u);

  // Recorded against a different revision than the one being released (R7.10, R7.11).
  assert.deepEqual(codes(refuse(releasableRequest({ forms: [releasableForm({ paper: recordRehearsal(approved), rehearsal: { rehearsalId: REHEARSAL_ID, revision: VERSION - 1, blockingChecks: [] } })] }))), ["REHEARSAL_STALE"]);

  // The request names a rehearsal that is not the recorded one.
  assert.deepEqual(codes(refuse(releasableRequest({ rehearsalId: "rehearsal-other" }))), ["REHEARSAL_STALE", "REHEARSAL_UNKNOWN"]);

  // The request names no rehearsal at all (R8.10 records the rehearsal result identifier).
  assert.ok(codes(refuse(releasableRequest({ rehearsalId: null }))).includes("REHEARSAL_NOT_NAMED"));

  // A blocking rehearsal result stands (R7.4).
  const blocking = refuse(releasableRequest({ forms: [releasableForm({ rehearsal: { rehearsalId: REHEARSAL_ID, revision: VERSION, blockingChecks: ["CANDIDATE_KEY_SEPARATION", "FIGURE_COMPLETENESS"] } })] }));
  assert.deepEqual(codes(blocking), ["REHEARSAL_BLOCKING"]);
  assert.equal(blocking.refusals[0].check, "CANDIDATE_KEY_SEPARATION");
  assert.match(blocking.refusals[0].detail, /2 blocking rehearsal results stand: CANDIDATE_KEY_SEPARATION, FIGURE_COMPLETENESS/u);
});

test("an unresolved language observation and a parity failure each refuse the whole set, with the form and check named", () => {
  const observation = refuse(releasableRequest({ forms: [releasableForm({ unresolvedObservations: [{ kind: "MARKS_MISMATCH", itemGroupId: "group-3", questionIds: ["q-A-s1-1"] }] })] }));
  assert.deepEqual(codes(observation), ["LANGUAGE_OBSERVATION_UNRESOLVED"]);
  assert.equal(observation.refusals[0].check, "MARKS_MISMATCH");
  assert.deepEqual(observation.refusals[0].itemIds, ["q-A-s1-1"]);

  const { forms } = draw(SEED, "FOUR_FORMS_IDENTICAL_BLUEPRINT");
  const candidates = forms.slice(0, 2).map((form, index) =>
    releasableForm({
      label: form.label,
      paper: recordRehearsal(approveItems(withFormSet(parse(form.paper), form.label))),
      parityFailures: index === 1 ? [{ check: "SECTION_MARKS_TOTAL", detail: "section s1 totals 12 marks against 10 in form A" }] : [],
    }),
  );
  const parity = refuse(releasableRequest({ forms: candidates }));
  assert.deepEqual(codes(parity), ["FORM_PARITY_FAILED"]);
  assert.equal(parity.refusals[0].formLabel, "B");
  assert.equal(parity.refusals[0].check, "SECTION_MARKS_TOTAL");
  assert.deepEqual(parity.sealed, [], "one form failing parity releases no form of the set");
});

test("a form set above the policy form ceiling is refused, and the ceiling comes from the approved policy", () => {
  const { forms } = draw(SEED, "FOUR_FORMS_IDENTICAL_BLUEPRINT");
  const candidates = forms.map(form => releasableForm({ label: form.label, paper: recordRehearsal(approveItems(withFormSet(parse(form.paper), form.label))) }));
  // The platform default sits at the ceiling of four, so four forms release.
  assert.equal(seal(releasableRequest({ forms: candidates })).sealed.length, 4);
  // A school that configured down to two refuses the same set and names the ceiling it applied.
  const decision = refuse(releasableRequest({ forms: candidates, policy: schoolPolicy({ maxForms: 2 }) }));
  assert.deepEqual(codes(decision), ["FORM_COUNT_ABOVE_POLICY"]);
  assert.match(decision.refusals[0].detail, /approved school delivery policy permits 2 forms; this set names 4 \(A, B, C, D\)/u);
});

test("separation of duties refuses a release of a revision the releasing actor authored, and only when the approved policy requires it", () => {
  const sameActor = releasableRequest({ forms: [releasableForm({ authoredBy: RELEASER })] });
  // The platform default degrades to always-allow, so an unconfigured school releases.
  assert.equal(seal(sameActor).sealed.length, 1);
  assert.equal(seal({ ...sameActor, policy: schoolPolicy({ separationOfDuties: "NOT_REQUIRED" }) }).sealed.length, 1);

  const decision = refuse({ ...sameActor, policy: schoolPolicy({ separationOfDuties: "REQUIRED" }) });
  assert.deepEqual(codes(decision), ["SEPARATION_OF_DUTIES"]);
  assert.match(decision.refusals[0].detail, /approved school delivery policy requires separate authoring and approval; form A was refused as SAME_ACTOR/u);
  // An unknown author cannot be shown to be a different actor.
  assert.deepEqual(codes(refuse({ ...releasableRequest({ forms: [releasableForm({ authoredBy: null })] }), policy: schoolPolicy({ separationOfDuties: "REQUIRED" }) })), ["SEPARATION_OF_DUTIES"]);
  // Distinct actors release under the same policy.
  assert.equal(seal({ ...releasableRequest(), policy: schoolPolicy({ separationOfDuties: "REQUIRED" }) }).sealed.length, 1);
});

test("a release records an actor and an authoritative timestamp, and refuses without either", () => {
  for (const releasedBy of [null, "", "   "]) assert.ok(codes(refuse(releasableRequest({ releasedBy }))).includes("RELEASING_ACTOR_UNKNOWN"));
  assert.ok(codes(refuse(releasableRequest({ now: new Date(Number.NaN) }))).includes("RELEASE_TIME_UNKNOWN"));
  assert.deepEqual(codes(refuse(releasableRequest({ forms: [] }))), ["NO_FORM_NAMED"]);
});

test("a release refuses an unreadable paper, a label the paper contradicts, a duplicate version and a paper with no item", () => {
  assert.deepEqual(codes(refuse(releasableRequest({ forms: [releasableForm({ paper: { curriculumId: "c1" } })] }))), ["PAPER_UNREADABLE"]);

  const labelled = recordRehearsal(approveItems(withFormSet(basePaper(), "B")));
  assert.ok(codes(refuse(releasableRequest({ forms: [releasableForm({ label: "A", paper: labelled })] }))).includes("FORM_LABEL_MISMATCH"));

  const same = releasableForm({ label: "A" });
  assert.ok(codes(refuse(releasableRequest({ forms: [same, same] }))).includes("DUPLICATE_FORM_VERSION"));

  const empty = parse({ ...recordRehearsal(basePaper()), questions: [] });
  assert.ok(codes(refuse(releasableRequest({ forms: [releasableForm({ paper: empty })] }))).includes("FORM_HAS_NO_ITEM"));
});

test("every refusal code is reachable, and no refusal detail carries a protected value", () => {
  const paper = parse(releasableForm().paper);
  const protectedValues = paper.questions.flatMap(question => [question.modelAnswer, ...question.rubric.map(criterion => criterion.criterion), ...question.sourceRefs.map(ref => ref.excerpt), question.prompt]);
  const seen = new Set<ReleaseRefusalCode>();
  const requests: ReleaseRequest[] = [
    releasableRequest({ forms: [] }),
    releasableRequest({ releasedBy: null, now: new Date(Number.NaN) }),
    releasableRequest({ forms: [releasableForm(), releasableForm()] }),
    releasableRequest({ forms: ["A", "B"].map(label => releasableForm({ label: label as FormLabel, paper: recordRehearsal(approveItems(withFormSet(basePaper(), label as FormLabel))) })), policy: schoolPolicy({ maxForms: 1 }) }),
    releasableRequest({ forms: [releasableForm({ paper: recordRehearsal(basePaper()) })] }),
    releasableRequest({ forms: [releasableForm({ paper: 42 })] }),
    releasableRequest({ forms: [releasableForm({ label: "C", paper: recordRehearsal(approveItems(withFormSet(basePaper(), "D"))) })] }),
    releasableRequest({ forms: [releasableForm({ paper: parse({ ...recordRehearsal(basePaper()), questions: [] }), reviewedVersion: VERSION + 2 })] }),
    releasableRequest({ forms: [releasableForm({ paper: approveItems(basePaper()), rehearsal: null, unresolvedObservations: [{ kind: "KEY_STRUCTURE_MISMATCH", itemGroupId: "g1", questionIds: [] }], parityFailures: [{ check: "OUTCOME_COVERAGE", detail: "outcome-2 is absent" }] })] }),
    releasableRequest({ rehearsalId: null }),
    releasableRequest({ rehearsalId: "rehearsal-other" }),
    releasableRequest({ forms: [releasableForm({ rehearsal: { rehearsalId: REHEARSAL_ID, revision: VERSION, blockingChecks: ["PRINT_PAGINATION"] } })] }),
    releasableRequest({ forms: [releasableForm({ paper: recordRehearsal(approveItems(basePaper()), { rehearsalValid: false }) })] }),
    releasableRequest({ forms: [releasableForm({ authoredBy: RELEASER })], policy: schoolPolicy({ separationOfDuties: "REQUIRED" }) }),
  ];
  for (const request of requests) {
    for (const entry of refuse(request).refusals) {
      seen.add(entry.code);
      for (const value of protectedValues.filter(text => text.trim().length > 12)) assert.ok(!entry.detail.includes(value), `refusal ${entry.code} leaks ${JSON.stringify(value)}`);
    }
  }
  // `PROTECTED_VALUE_IN_PROJECTION` is unreachable through a `PaperData`, which is the point: the
  // projection is an allow-list, so the refusal exists for a future edit to `candidatePaper` and is
  // covered above by `assertKeyFreeProjection` directly.
  const unreachable: ReleaseRefusalCode[] = ["PROTECTED_VALUE_IN_PROJECTION"];
  assert.deepEqual(RELEASE_REFUSAL_CODES.filter(code => !seen.has(code) && !unreachable.includes(code)), []);
});

// ---------------------------------------------------------------------------------------------
// Property tests for this area append below. Task 10.5 adds Property 6, task 10.6 adds Property 7.
// ---------------------------------------------------------------------------------------------
