import { z } from "zod";

/**
 * Commercial Evidence Register (SKO-408, Requirement 1, Requirement 29, R30.9, R30.10).
 *
 * Pure module: no I/O, no database, no filesystem. Runnable under `npm run test:school-ai`.
 *
 * Honesty is enforced in two layers, not by convention.
 *
 * 1. **Nothing declares its own state.** A recorded claim has no `state` field at all
 *    (`claimEvidenceSchema` is strict, so a `state` key is rejected). The state is *derived*
 *    from the recorded evidence by `resolveClaimState`, so `NOT_STARTED` is the fall-through
 *    for a claim with no cited repository artifact and no dated external gate record (R1.2).
 * 2. **`BUILT` is unreachable without a citation.** `CommercialClaim` is a discriminated union
 *    whose `BUILT` member types `citations` as a non-empty tuple and `openGates` as the empty
 *    tuple, so `{ state: "BUILT", citations: [] }` does not type-check; and every citation must
 *    carry a repository file path plus exactly one of a test file name or a migration file name
 *    (`claimCitationSchema`). A claim with an open gate resolves to `EXTERNAL_GATE_OPEN`
 *    regardless of what it cites, so an unverifiable claim is never a passing check (R30.9).
 *
 * R1.6 (no testimonials, named-school references, competitor comparisons or market-share figures)
 * is enforced the same way: every schema here is strict and none of them has a field in which such
 * material could be recorded. `EXCLUDED_MATERIAL_CLASSES` states that refusal for any generator
 * reading this register.
 *
 * This register is deliberately **separate from `scripts/check-commercial-contract.ts`**, which
 * validates `src/config/commercial-contract.ts` — plan entitlements, prices and the AI credit
 * reset policy. That check answers "does the sold contract match the configured plans"; this
 * module answers "does a stated capability exist in this repository". They share no record, and
 * `check-commercial-contract.ts` is unchanged by this task.
 */

/* ------------------------------------------------------------------ banned-term scan (R1.8) */

/**
 * The four terms Exam Studio excludes from interface copy, documentation and investor-facing
 * material generated from this repository. This module spells them because it is the scanner:
 * a scan over this file, or over this module's own source, is expected to match.
 */
export const BANNED_CLAIM_TERMS = ["cheat-proof", "tamper-proof", "fraud-proof", "guaranteed detection"] as const;
export type BannedClaimTerm = (typeof BANNED_CLAIM_TERMS)[number];

/** Hyphen, space, underscore, soft hyphen and the Unicode dash range all read as the same claim. */
const JOIN = "[-\\s_\\u00AD\\u2010-\\u2015]*";
const BANNED_PATTERNS: ReadonlyArray<{ term: BannedClaimTerm; pattern: RegExp }> = [
  { term: "cheat-proof", pattern: new RegExp(`cheat${JOIN}proof`, "giu") },
  { term: "tamper-proof", pattern: new RegExp(`tamper${JOIN}proof`, "giu") },
  { term: "fraud-proof", pattern: new RegExp(`fraud${JOIN}proof`, "giu") },
  { term: "guaranteed detection", pattern: new RegExp(`guarantee(?:d|s|ing)?${JOIN}detection`, "giu") },
  // The same claim written backwards is the same claim.
  { term: "guaranteed detection", pattern: new RegExp(`detection${JOIN}(?:is|are|was|were)?${JOIN}guaranteed`, "giu") },
];

export type BannedTermFinding = { term: BannedClaimTerm; index: number; excerpt: string };

/** Reports every banned-term occurrence in one body of text, with its offset and surrounding excerpt. */
export function scanBannedTerms(text: string): BannedTermFinding[] {
  const findings: BannedTermFinding[] = [];
  for (const { term, pattern } of BANNED_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      findings.push({ term, index, excerpt: text.slice(Math.max(0, index - 40), index + match[0].length + 40).replace(/\s+/gu, " ").trim() });
    }
  }
  return findings.sort((a, b) => a.index - b.index || a.term.localeCompare(b.term));
}

/** Refuses the text outright. Used at every recording boundary so a banned term cannot be stored. */
export function assertNoBannedTerms(label: string, text: string): void {
  const findings = scanBannedTerms(text);
  if (findings.length) throw new Error(`${label} uses an excluded term (${[...new Set(findings.map(row => row.term))].join(", ")}): ${findings[0].excerpt}`);
}

/* ------------------------------------------------------------------ shared field schemas */

const repoPath = z.string().trim().min(5).max(200).regex(/^(?:src|tests|scripts|prisma|docs|public)\/[A-Za-z0-9._/-]+$/u, "A citation must be a repository-relative path.");
const ticket = z.string().regex(/^SKO-\d{2,6}$/u, "An owner is a ticket identifier such as SKO-449.");
const requirementId = z.string().regex(/^\d{1,2}\.\d{1,2}(?:-\d{1,2}\.\d{1,2})?$/u, "A requirement identifier looks like 12.8 or 29.1-29.10.");
const recordId = z.string().regex(/^[A-Z][A-Z0-9_]{2,60}$/u);
const prose = (min: number, max: number) => z.string().trim().min(min).max(max).refine(value => scanBannedTerms(value).length === 0, "Recorded text may not use an excluded term.");

/* ------------------------------------------------------------------ citations (R1.1) */

/** A cited repository artifact: a file path plus exactly one of a test file or a migration file. */
export const claimCitationSchema = z
  .strictObject({
    path: repoPath,
    test: repoPath.optional(),
    migration: repoPath.optional(),
    /** The exact title of the cited test case, verbatim, so a reviewer can find it. */
    case: z.string().trim().min(8).max(200).optional(),
  })
  .refine(value => Boolean(value.test) !== Boolean(value.migration), "A citation names exactly one of a test file or a migration file.")
  .refine(value => !value.test || /\.(?:test|spec)\.ts$/u.test(value.test), "A cited test is a .test.ts or .spec.ts file.")
  .refine(value => !value.migration || /^prisma\/migrations\/[^/]+\/migration\.sql$/u.test(value.migration), "A cited migration is prisma/migrations/<name>/migration.sql.")
  .refine(value => !value.case || Boolean(value.test), "A test case title belongs with a cited test file.");
export type ClaimCitation = z.infer<typeof claimCitationSchema>;

/* ------------------------------------------------------------------ release gates (R1.3, R29.10, R30.9) */

/** The design's five release gates. Seeded open, so no later task can claim a gate it cannot close. */
export const RELEASE_GATE_IDS = [
  "MANAGED_CLIENT_DEVICE_VALIDATION",
  "EDUCATIONAL_CALIBRATION",
  "DEVICE_AND_ASSISTIVE_ACCEPTANCE",
  "STORAGE_RETENTION_AND_WORKER_OPERATIONS",
  "SUSTAINED_LOAD_AND_SCHOOL_PILOT",
] as const;
export type ReleaseGateId = (typeof RELEASE_GATE_IDS)[number];

export const releaseGateSchema = z
  .strictObject({
    gate: recordId,
    title: prose(20, 300),
    /** The accountable ticket. Where the design names no neighbouring owner, SKO-408 holds the gate. */
    owner: ticket,
    requirements: z.array(requirementId).min(1).max(20),
    closedBy: prose(20, 400),
    /** A dated pass, or null while the gate is open. An open gate carries no evidence. */
    passedOn: z.iso.date().nullable(),
    evidence: prose(10, 400).nullable(),
  })
  .refine(value => (value.passedOn === null) === (value.evidence === null), "A dated gate pass cites its evidence; an open gate carries neither.");
export type ReleaseGate = z.infer<typeof releaseGateSchema>;

type ReleaseGateInput = z.input<typeof releaseGateSchema>;

export const RELEASE_GATES = [
  {
    gate: "MANAGED_CLIENT_DEVICE_VALIDATION",
    title: "Managed client and configuration validation on real devices, the supported device matrix, the local release bound and the independent emergency exit",
    owner: "SKO-449",
    requirements: ["12.8", "12.9", "12.10", "12.11", "12.17"],
    closedBy: "A dated pass per device class, recorded by the owning ticket on real hardware. A header comparison is evidence of configuration, not a device attestation, and a synthetic test cannot close this gate.",
    passedOn: null,
    evidence: null,
  },
  {
    gate: "EDUCATIONAL_CALIBRATION",
    title: "Calibration of generation, key-blind semantic review and mark proposals against representative, authorized English, Arabic and Urdu material",
    owner: "SKO-408",
    requirements: ["5.1", "9.4", "30.9"],
    closedBy: "A recorded-result corpus run in live provider mode with human-adjudicated expectations through scripts/school-ai-calibration.ts. Synthetic replays intentionally fail this gate.",
    passedOn: null,
    evidence: null,
  },
  {
    gate: "DEVICE_AND_ASSISTIVE_ACCEPTANCE",
    title: "Camera, microphone, screen, printer, browser and assistive-technology acceptance, including the documented manual path when a device is unsupported",
    owner: "SKO-408",
    requirements: ["22.6", "23.10", "30.9"],
    closedBy: "Manual testing with real assistive technology and an expert accessibility review on the recorded device matrix. Automated accessible-name and state checks do not replace it.",
    passedOn: null,
    evidence: null,
  },
  {
    gate: "STORAGE_RETENTION_AND_WORKER_OPERATIONS",
    title: "Private storage permissions, retention and deletion, backup and restore, and worker dispatch monitoring in the intended environment",
    owner: "SKO-408",
    requirements: ["30.9"],
    closedBy: "An operated environment with monitored deletion and expiry processing, plus a restore rehearsal. Loopback database tests prove the rules, not the operation.",
    passedOn: null,
    evidence: null,
  },
  {
    gate: "SUSTAINED_LOAD_AND_SCHOOL_PILOT",
    title: "Sustained realistic exam load, and a measured school pilot for any setup, review or correction effort figure",
    owner: "SKO-451",
    requirements: ["16.14", "29.8", "30.9"],
    closedBy: "A dated sustained-load result from the owning ticket, and a school pilot with recorded sample size, date range and method. Every delivery capacity statement reads from that result.",
    passedOn: null,
    evidence: null,
  },
] as const satisfies readonly ReleaseGateInput[];

/* ------------------------------------------------------------------ numeric figures (R1.4, R1.5) */

/** The exact text displayed in place of a figure that has no recorded measurement (R1.5). */
export const NOT_MEASURED = "not measured";

export const figureMeasurementSchema = z
  .strictObject({
    sampleSize: z.number().int().min(1).max(10_000_000),
    dateRangeStart: z.iso.date(),
    dateRangeEnd: z.iso.date(),
    method: prose(20, 500),
    source: repoPath,
  })
  .refine(value => value.dateRangeStart <= value.dateRangeEnd, "A measurement date range starts on or before it ends.");
export type FigureMeasurement = z.infer<typeof figureMeasurementSchema>;

export const claimFigureSchema = z
  .strictObject({
    id: recordId,
    label: prose(10, 200),
    requirements: z.array(requirementId).min(1).max(20),
    /** A figure value exists only alongside its measurement; otherwise it is null and renders `not measured`. */
    value: z.string().trim().min(1).max(80).nullable(),
    measurement: figureMeasurementSchema.nullable(),
  })
  .refine(value => (value.value === null) === (value.measurement === null), "A figure with no recorded measurement carries no value, and a value carries its sample size, date range and method.");

type ClaimFigureInput = z.input<typeof claimFigureSchema>;
type FigureBase = { id: string; label: string; requirements: readonly string[] };
export type ClaimFigure = (FigureBase & { value: string; measurement: FigureMeasurement }) | (FigureBase & { value: null; measurement: null });

/** Renders a figure with its sample size, date range and method, or `not measured` (R1.4, R1.5). */
export function renderFigure(figure: ClaimFigure): string {
  if (figure.measurement === null) return NOT_MEASURED;
  const { sampleSize, dateRangeStart, dateRangeEnd, method } = figure.measurement;
  const range = dateRangeStart === dateRangeEnd ? dateRangeStart : `${dateRangeStart} to ${dateRangeEnd}`;
  return `${figure.value} (sample size ${sampleSize}, ${range}, ${method})`;
}

function resolveFigure(raw: unknown): ClaimFigure {
  const figure = claimFigureSchema.parse(raw);
  const base = { id: figure.id, label: figure.label, requirements: figure.requirements };
  return figure.measurement === null || figure.value === null ? { ...base, value: null, measurement: null } : { ...base, value: figure.value, measurement: figure.measurement };
}

export const CLAIM_FIGURES = [
  {
    id: "LOAD_HARNESS_P95_RESPONSE",
    label: "Attempt save and submit p95 response time under the local exam load harness",
    requirements: ["1.4", "29.8"],
    value: "632.96 ms",
    measurement: {
      sampleSize: 366,
      dateRangeStart: "2026-10-13",
      dateRangeEnd: "2026-10-13",
      method: "32 synthetic candidates with real HTTP sign-in, at most eight concurrent requests and paced autosaves against a local development server, recorded by scripts/school-ai-exam-load.ts. A development-server sample, not production capacity.",
      source: "docs/school-ai/IMPLEMENTATION.md",
    },
  },
  { id: "CONCURRENT_CANDIDATE_CAPACITY", label: "Concurrent candidates supported in a school deployment", requirements: ["1.5", "16.14", "29.8"], value: null, measurement: null },
  { id: "MARKING_AGREEMENT", label: "Agreement between proposed marks and moderated staff marks", requirements: ["1.4", "1.5"], value: null, measurement: null },
  { id: "INTEGRITY_DETECTION_ACCURACY", label: "Accuracy of integrity signal detection", requirements: ["1.5", "14.7"], value: null, measurement: null },
  { id: "TEACHER_TIME_SAVING", label: "Teacher time saved across authoring, review and release", requirements: ["1.4", "1.5"], value: null, measurement: null },
  { id: "REVIEW_EFFORT", label: "Review effort per approved paper", requirements: ["1.4", "1.5"], value: null, measurement: null },
] as const satisfies readonly ClaimFigureInput[];

/* ------------------------------------------------------------------ claims (R1.1, R1.2, R1.9) */

export type ClaimState = "BUILT" | "PARTIAL" | "EXTERNAL_GATE_OPEN" | "NOT_STARTED";

/**
 * Display rank, weakest first. `EXTERNAL_GATE_OPEN` ranks below `PARTIAL` deliberately: a
 * gate-open capability may not be presented as available, while a partial one does something.
 */
export const CLAIM_STATE_RANK: Readonly<Record<ClaimState, number>> = Object.freeze({ NOT_STARTED: 0, EXTERNAL_GATE_OPEN: 1, PARTIAL: 2, BUILT: 3 });

/** What is recorded about a claim. There is no `state` field: the state is derived, never declared. */
export const claimEvidenceSchema = z.strictObject({
  id: recordId,
  claim: prose(12, 400),
  requirements: z.array(requirementId).min(1).max(40),
  citations: z.array(claimCitationSchema).max(8).default([]),
  gates: z.array(recordId).max(5).default([]),
  /** Named open work inside this repository. Present means the claim is at most `PARTIAL`. */
  remaining: prose(12, 400).nullable().default(null),
  figures: z.array(recordId).max(6).default([]),
});
export type ClaimEvidence = z.infer<typeof claimEvidenceSchema>;
type ClaimEvidenceInput = z.input<typeof claimEvidenceSchema>;

type ClaimBase = { id: string; claim: string; requirements: readonly string[]; figures: readonly ClaimFigure[] };
export type CommercialClaim =
  | (ClaimBase & { state: "BUILT"; citations: readonly [ClaimCitation, ...ClaimCitation[]]; openGates: readonly []; remaining: null })
  | (ClaimBase & { state: "PARTIAL"; citations: readonly ClaimCitation[]; openGates: readonly []; remaining: string | null })
  | (ClaimBase & { state: "EXTERNAL_GATE_OPEN"; citations: readonly ClaimCitation[]; openGates: readonly [ReleaseGate, ...ReleaseGate[]]; remaining: string | null })
  | (ClaimBase & { state: "NOT_STARTED"; citations: readonly []; openGates: readonly ReleaseGate[]; remaining: string | null });

/**
 * Derives one claim's state from its recorded evidence.
 *
 * - no cited artifact and no dated gate record -> `NOT_STARTED` (R1.2, the default)
 * - any named gate still open -> `EXTERNAL_GATE_OPEN` with the gate and its owner (R1.3, R29.10, R30.9)
 * - cited artifact with named open work, or a dated gate pass with nothing cited -> `PARTIAL`
 * - cited artifact, no open gate, no open work -> `BUILT`
 */
export function resolveClaimState(rawEvidence: unknown, rawGates: readonly unknown[] = RELEASE_GATES, rawFigures: readonly unknown[] = CLAIM_FIGURES): CommercialClaim {
  const evidence = claimEvidenceSchema.parse(rawEvidence);
  const gates = rawGates.map(gate => releaseGateSchema.parse(gate));
  const figures = rawFigures.map(resolveFigure);
  const named = evidence.gates.map(id => {
    const gate = gates.find(row => row.gate === id);
    if (!gate) throw new Error(`Claim ${evidence.id} names gate ${id}, which the register does not record.`);
    return gate;
  });
  const resolvedFigures = evidence.figures.map(id => {
    const figure = figures.find(row => row.id === id);
    if (!figure) throw new Error(`Claim ${evidence.id} names figure ${id}, which the register does not record.`);
    return figure;
  });
  const base = { id: evidence.id, claim: evidence.claim, requirements: evidence.requirements, figures: resolvedFigures };
  const openGates = named.filter(gate => gate.passedOn === null);
  const datedGates = named.filter(gate => gate.passedOn !== null);
  const [first, ...rest] = evidence.citations;
  if (first === undefined && datedGates.length === 0) return { ...base, state: "NOT_STARTED", citations: [], openGates, remaining: evidence.remaining };
  const [openFirst, ...openRest] = openGates;
  if (openFirst !== undefined) return { ...base, state: "EXTERNAL_GATE_OPEN", citations: evidence.citations, openGates: [openFirst, ...openRest], remaining: evidence.remaining };
  if (first === undefined || evidence.remaining !== null) return { ...base, state: "PARTIAL", citations: evidence.citations, openGates: [], remaining: evidence.remaining };
  return { ...base, state: "BUILT", citations: [first, ...rest], openGates: [], remaining: null };
}

/** One line per claim state. A gate-open claim always names the open gate and its owner (R1.3). */
export function renderClaimState(claim: CommercialClaim): string {
  switch (claim.state) {
    case "BUILT":
      return `built — ${claim.citations.map(citation => `${citation.path} (${citation.test ?? citation.migration})`).join(", ")}`;
    case "PARTIAL":
      return `partial — remaining: ${claim.remaining ?? "no repository artifact cited; evidence is an external gate pass only"}`;
    case "EXTERNAL_GATE_OPEN":
      return `gate open — ${claim.openGates.map(gate => `${gate.title} (${gate.gate}, owner ${gate.owner})`).join("; ")}`;
    case "NOT_STARTED":
      return claim.openGates.length ? `not started — gate ${claim.openGates.map(gate => `${gate.gate} (owner ${gate.owner})`).join("; ")} and no cited artifact` : "not started — no cited artifact and no dated external gate record";
  }
}

export const CLAIM_EVIDENCE = [
  {
    id: "EVIDENCE_REGISTER",
    claim: "Every stated Exam Studio capability carries either a cited repository artifact or a named open gate, and the complete list exports in one call.",
    requirements: ["1.1", "1.2", "1.6", "1.7", "1.9", "30.9", "30.10"],
    citations: [{ path: "src/lib/school-ai/commercial-evidence.ts", test: "tests/school-ai/exam-studio-evidence-register.test.ts", case: "a claim with no cited artifact and no dated gate record is recorded as not started" }],
  },
  {
    id: "AUTHORING_RECORD_CHAIN",
    claim: "Every Exam Studio authoring record is versioned, approved against the exact reviewed version and preserved as an immutable revision with an audit row.",
    requirements: ["25.4", "25.5", "25.6"],
    citations: [
      { path: "src/lib/school-ai/repository.ts", test: "tests/school-ai/workspace.database.test.ts" },
      { path: "src/lib/school-ai/transaction.ts", test: "tests/school-ai/transaction.test.ts", case: "pure database transactions retry exact serialization/deadlock rollbacks from normal and raw queries" },
    ],
  },
  {
    id: "KEY_FREE_CANDIDATE_PROJECTION",
    claim: "A candidate-facing payload carries no answer key, rubric, source excerpt, reviewer note or generation detail.",
    requirements: ["4.11", "8.6", "15.6", "19.5"],
    citations: [{ path: "src/lib/school-ai/assessment.ts", test: "tests/school-ai/assessment.test.ts", case: "candidate projection excludes every key, rubric, source excerpt and generation detail" }],
  },
  {
    id: "TENANT_AND_SUBJECT_ISOLATION",
    claim: "Every read, write and execution is bounded to the acting school, campus and assigned subjects, re-checked against a permission snapshot loaded in the same request.",
    requirements: ["27.1", "27.2", "27.4", "27.9"],
    citations: [{ path: "src/lib/school-ai/access.ts", test: "tests/school-ai/workspace.database.test.ts" }],
  },
  {
    id: "GENERATED_ITEMS_ARE_REVIEWED",
    claim: "Generated items pass deterministic validation and require human approval; the educational quality of generated material is not claimed.",
    requirements: ["5.1", "5.10", "26.8"],
    citations: [
      { path: "src/lib/school-ai/assessment.ts", test: "tests/school-ai/assessment.test.ts", case: "approval rejects invented evidence, duplicate prompts, missing answer keys and invalid rubric totals" },
      { path: "src/lib/school-ai/calibration.ts", test: "tests/school-ai/calibration.test.ts", case: "perfect synthetic multilingual scores never claim representative provider calibration" },
    ],
    gates: ["EDUCATIONAL_CALIBRATION"],
  },
  {
    id: "MARK_PROPOSALS_REQUIRE_HUMAN_REVIEW",
    claim: "Objective scoring is deterministic and written mark proposals quote exact candidate text, carry bounded marks and require a staff decision before a result version exists.",
    requirements: ["25.4", "25.5"],
    citations: [
      { path: "src/lib/school-ai/assessment.ts", test: "tests/school-ai/assessment.test.ts", case: "objective scoring preserves written review, missing answers and evidence-based zero" },
      { path: "src/lib/school-ai/exam-results.ts", test: "tests/school-ai/exam-gradebook.database.test.ts", case: "reviewed publication inserts exact previewed marks, keeps non-starters unentered and replays one receipt" },
    ],
    gates: ["EDUCATIONAL_CALIBRATION"],
    figures: ["MARKING_AGREEMENT"],
  },
  {
    id: "PRINT_AND_BROWSER_PROJECTION",
    claim: "Authenticated print rechecks the current approved version and shares the key-free candidate projection with the browser surface, with author text escaped.",
    requirements: ["8.3", "8.4", "22.6"],
    citations: [{ path: "src/lib/school-ai/paper-print.ts", test: "tests/school-ai/paper-print.test.ts", case: "print uses the candidate projection and excludes every restricted answer/provenance field" }],
    gates: ["DEVICE_AND_ASSISTIVE_ACCEPTANCE"],
  },
  {
    id: "MANAGED_MODE_FAILS_CLOSED",
    claim: "A delivery mode other than the standard browser is refused by default, and is admitted only when an approved policy revision carries a dated pass for every named validation gate.",
    requirements: ["12.5", "12.6", "12.8", "12.9", "12.10", "12.17", "12.18"],
    citations: [{ path: "src/lib/school-ai/exam.ts", test: "tests/school-ai/assessment.test.ts", case: "unsupported proctored mode fails closed; secure browser needs an approved profile at assignment (SKO-449)" }],
    gates: ["MANAGED_CLIENT_DEVICE_VALIDATION"],
    remaining: "The delivery policy record, the admission decision with reason codes and the local release recording are not written yet; today the blanket refusal stands.",
  },
  {
    id: "CONSENTED_CAPTURE_IS_OUTCOME_NEUTRAL",
    claim: "Declining camera or screen capture never blocks an attempt and never changes a mark; clips stay private to the current scope and expire on the recorded retention bound.",
    requirements: ["13.2", "13.3"],
    citations: [
      { path: "src/lib/school-ai/exam-proctor.ts", test: "tests/school-ai/exam-proctor.database.test.ts", case: "deleting consent hides clips immediately and retention durably removes private objects and notes" },
      { path: "src/lib/school-ai/exam-proctor-service.ts", test: "tests/school-ai/exam-proctor.database.test.ts", case: "one opt-in session and exact clip retries preserve private media and never alter answers" },
    ],
    gates: ["DEVICE_AND_ASSISTIVE_ACCEPTANCE", "STORAGE_RETENTION_AND_WORKER_OPERATIONS"],
  },
  {
    id: "ATTEMPT_DURABILITY",
    claim: "Attempt timing is server-authoritative, autosaves are sequenced and replay-safe, and an expired attempt is swept on the database clock without losing a saved response.",
    requirements: ["16.2", "16.3", "16.4", "16.9", "20.10"],
    citations: [
      { path: "src/lib/school-ai/exam.ts", test: "tests/school-ai/assessment.test.ts", case: "server deadlines clamp late starts and classify stale, replay, expired and final requests" },
      { path: "src/lib/school-ai/exam-expiry.ts", test: "tests/school-ai/exam-expiry.database.test.ts", case: "expiry uses saved answers and immutable paper, records one content-free audit, and replays without extra effects" },
    ],
    remaining: "Writer sessions, takeover revocation of a superseded writer and the single durable attempt receipt are not written yet.",
  },
  {
    id: "STUDIO_AUTHORITY_MATRIX",
    claim: "Every studio action is decided by one frozen role and action allow-list, so a refusal is the absence of an entry rather than a negative branch, and a revoked grant refuses the next request.",
    requirements: ["2.1-2.16", "27.9"],
    citations: [{ path: "src/lib/school-ai/studio-access.ts", test: "tests/school-ai/exam-studio-access.test.ts" }],
  },
  {
    id: "TRILINGUAL_INTERFACE",
    claim: "Interface copy is complete in English, Arabic and Urdu together, with numbered placeholders and direction handled by the shared locale provider rather than per-screen strings.",
    requirements: ["22.1", "22.8", "22.9"],
    citations: [
      { path: "src/lib/school-ai/copy.ts", test: "tests/school-ai/onboarding.test.ts", case: "all shared AI interface copy is complete in English, Arabic and Urdu" },
      { path: "src/lib/school-ai/exam-studio-copy.ts", test: "tests/school-ai/exam-studio-copy.test.ts" },
    ],
    remaining: "Only the sixteen-token status vocabulary is registered; each later surface adds its own copy area to the index.",
  },
  {
    id: "ACCESSIBLE_SURFACES",
    claim: "Controls come from the shared design system, so each exposes an accessible name, a role and its current state, and no state is conveyed by colour alone.",
    requirements: ["23.1", "23.2", "23.9"],
    citations: [{ path: "src/components/ui/button.tsx", test: "tests/design-system/adoption.test.ts", case: "application forms use shared fields; specialized native controls remain explicit" }],
    gates: ["DEVICE_AND_ASSISTIVE_ACCEPTANCE"],
  },
  {
    id: "SEALED_RELEASE_CONTENT_HASH",
    claim: "A released form is sealed with a content hash an independent verifier can recompute outside Skoolee AI to prove print and browser delivery carry identical content.",
    requirements: ["8.1", "8.2", "19.3"],
    citations: [{ path: "src/lib/school-ai/canonical.ts", test: "tests/school-ai/exam-studio-canonical.test.ts" }],
    remaining: "Canonical serialization and its digest exist; the release seal over an approved form and the recorded parity proof are not written yet.",
  },
  {
    id: "EXAM_ROOM_BOUNDARY",
    claim: "While an attempt is active the server confines the candidate to attempt surfaces, refusing every other Exam Studio request next to the data rather than at the edge.",
    requirements: ["11.1", "11.3", "11.11", "11.13"],
    remaining: "The allowlist, the attempt claim and the per-request guard are not written yet.",
  },
  {
    id: "HONEST_BOUNDARY_LABELLING",
    claim: "The interface labels the app-level boundary and managed device lockdown separately, and states that standard browser delivery cannot control other applications, other devices or screenshots.",
    requirements: ["11.11", "12.17", "12.18"],
    remaining: "The boundary labelling copy and the gate-open managed mode indicator are not written yet; the scope decision itself is recorded in docs/school-ai/IMPLEMENTATION.md.",
  },
  {
    id: "INTEGRITY_SIGNALS_WITHOUT_CONCLUSION",
    claim: "Integrity signals are factual, timestamped and uncertainty-bearing, and no code path lets a signal change a mark, a deadline, an attempt state or a release.",
    requirements: ["14.5", "14.6", "14.7", "14.8"],
    remaining: "The signal schema, severity, uncertainty and the review queue are not written yet.",
    figures: ["INTEGRITY_DETECTION_ACCURACY"],
  },
  {
    id: "ITEM_REVIEW_STATE_AND_STALENESS",
    claim: "Each item carries its own review state and staleness is transitively complete, so one unresolved item does not force a re-review of an approved paper.",
    requirements: ["6.1", "6.2", "6.3", "6.5", "6.7"],
    remaining: "Per-item review states, transitions and the staleness walk are not written yet.",
  },
  {
    id: "FORM_SETS_AND_EXPOSURE",
    claim: "Parallel forms are released together only when blueprint parity holds, each candidate receives exactly one form, and item exposure is recorded per cohort and date.",
    requirements: ["10.8", "10.9", "10.10"],
    remaining: "Form sets, the parity check and the exposure ledger are not written yet.",
  },
  {
    id: "EVIDENCE_PACK_MANIFEST",
    claim: "An evidence pack export carries a machine-verifiable manifest of file digests and record versions that an independent verifier can re-digest.",
    requirements: ["19.2", "19.3", "19.4"],
    citations: [
      { path: "src/lib/school-ai/evidence-pack.ts", test: "tests/school-ai/exam-studio-evidence-pack.test.ts", case: "an independent verifier (unzip + shasum) reproduces every digest in the manifest" },
      { path: "src/lib/school-ai/evidence-pack-service.ts", test: "tests/school-ai/exam-studio-evidence.database.test.ts", case: "a produced pack is frozen, and its download verifies with unzip and shasum alone" },
      { path: "src/lib/school-ai/evidence-pack-service.ts", test: "tests/school-ai/exam-studio-evidence.database.test.ts", case: "a pack holds the chain, names the missing source version, and leaves keys out by default" },
      { path: "src/lib/school-ai/evidence-pack-service.ts", migration: "prisma/migrations/20261019100000_exam_evidence_packs/migration.sql" },
    ],
  },
  {
    id: "SUSTAINED_DELIVERY_LOAD",
    claim: "Delivery under sustained realistic exam load is reported from the owning ticket's measurement, and Exam Studio originates no capacity figure of its own.",
    requirements: ["16.14", "29.8"],
    gates: ["SUSTAINED_LOAD_AND_SCHOOL_PILOT"],
    remaining: "The recorded 32-candidate harness run is a local development-server sample, not a capacity measurement.",
    figures: ["LOAD_HARNESS_P95_RESPONSE", "CONCURRENT_CANDIDATE_CAPACITY"],
  },
  {
    id: "MEASURED_SCHOOL_OUTCOMES",
    claim: "Setup time, review burden and correction effort are reported only from a measured school pilot with a recorded sample size, date range and method.",
    requirements: ["1.4", "1.5"],
    gates: ["SUSTAINED_LOAD_AND_SCHOOL_PILOT"],
    remaining: "Elapsed-time and saved-edit instrumentation exists for the platform, but no pilot measurement is recorded for Exam Studio.",
    figures: ["TEACHER_TIME_SAVING", "REVIEW_EFFORT"],
  },
] as const satisfies readonly ClaimEvidenceInput[];

/* ------------------------------------------------------------------ named differentiators (R1.7) */

export const differentiatorSchema = z.strictObject({
  id: recordId,
  differentiator: prose(12, 300),
  /** The named capability gap this addresses, stated as a school need. Never a competitor comparison (R1.6). */
  gap: prose(20, 400),
  requirements: z.array(requirementId).min(1).max(20),
  claimIds: z.array(recordId).min(1).max(8),
});
type DifferentiatorInput = z.input<typeof differentiatorSchema>;

export const NAMED_DIFFERENTIATORS = [
  {
    id: "APP_LEVEL_EXAM_ROOM",
    differentiator: "An app-level exam room boundary enforced by the server on every request, labelled for what it is.",
    gap: "Schools delivering exams in an ordinary browser need a boundary that is stated and enforced inside the product, instead of an implied lockdown the browser cannot deliver.",
    requirements: ["11.1", "11.3", "11.11", "11.13", "29.3"],
    claimIds: ["EXAM_ROOM_BOUNDARY", "HONEST_BOUNDARY_LABELLING"],
  },
  {
    id: "GATED_MANAGED_DELIVERY",
    differentiator: "Managed delivery that refuses by default and admits a client only behind dated validation gates.",
    gap: "A school asked to trust a lockdown client needs the product to refuse until a named gate carries a dated pass, rather than to assume the client is configured.",
    requirements: ["12.5", "12.6", "12.8", "12.9", "12.10", "12.13", "12.14"],
    claimIds: ["MANAGED_MODE_FAILS_CLOSED"],
  },
  {
    id: "POWERLESS_INTEGRITY_SIGNALS",
    differentiator: "Integrity signals that are factual and uncertainty-bearing, with no authority over any outcome and no misconduct conclusion.",
    gap: "Staff investigating an exam incident need timestamped observations with stated false-positive causes, and a guarantee that no automated signal moved a mark.",
    requirements: ["14.5", "14.6", "14.7", "14.8", "13.2", "13.3"],
    claimIds: ["INTEGRITY_SIGNALS_WITHOUT_CONCLUSION", "CONSENTED_CAPTURE_IS_OUTCOME_NEUTRAL"],
  },
  {
    id: "PROVABLE_SEALED_RELEASE",
    differentiator: "A sealed release whose print and browser output can be proven identical by recomputing one digest.",
    gap: "A school printing a paper and delivering the same paper in a browser needs proof the two carry identical content, not an assurance.",
    requirements: ["8.1", "8.2", "8.3", "8.4", "19.3"],
    claimIds: ["SEALED_RELEASE_CONTENT_HASH", "PRINT_AND_BROWSER_PROJECTION", "KEY_FREE_CANDIDATE_PROJECTION"],
  },
  {
    id: "PER_ITEM_REVIEW",
    differentiator: "Per-item review state with transitively complete staleness, so one changed source invalidates exactly what depends on it.",
    gap: "A teacher reviewing a generated paper needs one unresolved question to cost one review, not a whole paper.",
    requirements: ["4.11", "6.1", "6.2", "6.3", "6.5", "6.7"],
    claimIds: ["ITEM_REVIEW_STATE_AND_STALENESS"],
  },
  {
    id: "PARALLEL_FORMS_WITH_EXPOSURE",
    differentiator: "Parallel forms released only on blueprint parity, with one form per candidate and a recorded exposure history.",
    gap: "A school running several sittings of one assessment needs comparable forms and a record of which item a cohort has already seen.",
    requirements: ["10.8", "10.9", "10.10"],
    claimIds: ["FORM_SETS_AND_EXPOSURE"],
  },
  {
    id: "INDEPENDENTLY_VERIFIABLE_EVIDENCE",
    differentiator: "Evidence packs with a manifest an independent verifier can re-digest outside Skoolee AI.",
    gap: "A school answering an appeal needs the record chain to verify without trusting the system that produced it.",
    requirements: ["19.2", "19.3", "19.4"],
    claimIds: ["EVIDENCE_PACK_MANIFEST"],
  },
  {
    id: "CITED_CAPABILITY_CLAIMS",
    differentiator: "Every capability claim carries its own citation, or its own named open gate and owner.",
    gap: "A technical reviewer confirming what this module does needs to read a file and run a test, rather than trust a summary.",
    requirements: ["1.1", "1.2", "1.9", "30.9", "30.10"],
    claimIds: ["EVIDENCE_REGISTER"],
  },
] as const satisfies readonly DifferentiatorInput[];

/* ------------------------------------------------------------------ integration contracts (R29.1-29.11) */

export const integrationContractSchema = z.strictObject({
  id: recordId,
  criterion: requirementId,
  owners: z.array(ticket).min(1).max(3),
  consumed: prose(15, 400),
  /** What Exam Studio does when the consumed record is absent (R29.9). */
  whenAbsent: prose(20, 500),
  /** What Exam Studio does not implement, so no record is built twice (R29.11). */
  exclusion: prose(15, 400),
  gate: recordId.nullable(),
  claimIds: z.array(recordId).max(8).default([]),
});
type IntegrationContractInput = z.input<typeof integrationContractSchema>;

export const INTEGRATION_CONTRACTS = [
  {
    id: "QUESTION_BANK_AND_BLUEPRINTS",
    criterion: "29.1",
    owners: ["SKO-407"],
    consumed: "Approved question bank items and blueprint records, read through the owning ticket's records.",
    whenAbsent: "Exam Studio authors and generates items inside the paper record only; reuse from the bank and exposure history are presented as unavailable rather than inferred.",
    exclusion: "Exam Studio does not reimplement bank storage or blueprint definition; it adds per-item review state, staleness and exposure records as its own concerns.",
    gate: null,
    claimIds: ["ITEM_REVIEW_STATE_AND_STALENESS", "FORM_SETS_AND_EXPOSURE"],
  },
  {
    id: "ACCOMMODATION_RECORDS",
    criterion: "29.2",
    owners: ["SKO-410"],
    consumed: "Per-candidate accommodation records.",
    whenAbsent: "An attempt runs with no accommodation and the interface states that no accommodation record exists; Exam Studio invents no default and grants no extra time of its own.",
    exclusion: "Exam Studio does not store accommodation records; it adds only the delivery policy interaction for them.",
    gate: null,
    claimIds: [],
  },
  {
    id: "FOCUSED_SESSION_BOUNDARY",
    criterion: "29.3",
    owners: ["SKO-411"],
    consumed: "The shared focused-session boundary primitive.",
    whenAbsent: "Exam Studio still decides and enforces its own exam room boundary server-side on every allowlisted surface, and labels the boundary as app-level only.",
    exclusion: "Exam Studio does not reimplement the shared session primitive; it exports its boundary decision so the owning ticket can supply it.",
    gate: null,
    claimIds: ["EXAM_ROOM_BOUNDARY", "HONEST_BOUNDARY_LABELLING"],
  },
  {
    id: "MANAGED_CLIENT_VALIDATION",
    criterion: "29.4",
    owners: ["SKO-449"],
    consumed: "Dated client and configuration validation results, the supported device matrix, the local release bound and the independent emergency exit result.",
    whenAbsent: "Managed admission refuses every client, the attempt stays unstarted with its projection withheld, and the interface shows managed mode as unavailable with the named open gate and owner.",
    exclusion: "Exam Studio does not build or certify a lockdown client; it stores the policy, decides admission, keeps the interface state honest and records release.",
    gate: "MANAGED_CLIENT_DEVICE_VALIDATION",
    claimIds: ["MANAGED_MODE_FAILS_CLOSED"],
  },
  {
    id: "SITTINGS_AND_INVIGILATION",
    criterion: "29.5",
    owners: ["SKO-413"],
    consumed: "Sitting composition, room allocation and invigilation duty records.",
    whenAbsent: "The control room falls back to the assignment's class roster and labels that scope as a class roster with no sitting record.",
    exclusion: "Exam Studio does not schedule sittings or allocate rooms; it adds the live control room view.",
    gate: null,
    claimIds: [],
  },
  {
    id: "SCANNED_SCRIPTS_AND_MARK_CAPTURE",
    criterion: "29.6",
    owners: ["SKO-412"],
    consumed: "Scanned script matching and captured mark records for paper-based evidence.",
    whenAbsent: "A paper-based attempt carries no scanned evidence, and an evidence pack records a gap entry in place of a script digest rather than omitting it silently.",
    exclusion: "Exam Studio does not reimplement script scanning or mark capture.",
    gate: null,
    claimIds: ["EVIDENCE_PACK_MANIFEST"],
  },
  {
    id: "MODERATION_AND_ITEM_REVIEW",
    criterion: "29.7",
    owners: ["SKO-424", "SKO-422"],
    consumed: "Moderation and regrade records, and item review records, for any mark change after an attempt.",
    whenAbsent: "A remedy proposal cannot be authorized; it is recorded as awaiting the owning record and the released result version stays unchanged.",
    exclusion: "Exam Studio does not store moderation, regrade or item review records; it proposes remedies that those records authorize.",
    gate: null,
    claimIds: ["MARK_PROPOSALS_REQUIRE_HUMAN_REVIEW"],
  },
  {
    id: "SUSTAINED_LOAD_VERIFICATION",
    criterion: "29.8",
    owners: ["SKO-451"],
    consumed: "The dated sustained load verification result, as the only source of a delivery capacity statement.",
    whenAbsent: "Exam Studio states no delivery capacity figure at all and the capacity figure renders as not measured.",
    exclusion: "Exam Studio does not originate a capacity claim from its own local harness run.",
    gate: "SUSTAINED_LOAD_AND_SCHOOL_PILOT",
    claimIds: ["SUSTAINED_DELIVERY_LOAD"],
  },
] as const satisfies readonly IntegrationContractInput[];

/* ------------------------------------------------------------------ verification results (R30.10) */

export const verificationRecordSchema = z.strictObject({
  check: prose(8, 200),
  command: z.string().trim().min(5).max(200),
  date: z.iso.date(),
  counts: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{2,40}$/u), z.number().int().min(0).max(1_000_000)),
  source: repoPath,
});
type VerificationRecordInput = z.input<typeof verificationRecordSchema>;

/** The dated verification results recorded in the School AI ledger, with the command that produced them. */
export const VERIFICATION_RECORDS = [
  { check: "Pure School AI domain tests", command: "npm run test:school-ai", date: "2026-10-13", counts: { passed: 173, failed: 0 }, source: "docs/school-ai/IMPLEMENTATION.md" },
  { check: "School AI database acceptance on a loopback database", command: "npm run test:school-ai:db", date: "2026-10-13", counts: { passed: 329, failed: 0 }, source: "docs/school-ai/IMPLEMENTATION.md" },
  { check: "School AI browser coverage", command: "npm run test:school-ai:e2e", date: "2026-10-13", counts: { scenarios: 192, passedInCombinedRun: 190, passedAfterCorrectedAssertion: 2 }, source: "docs/school-ai/IMPLEMENTATION.md" },
  { check: "Shared design-system adoption contracts", command: "npm run check:ui", date: "2026-10-13", counts: { passed: 3, failed: 0 }, source: "docs/school-ai/IMPLEMENTATION.md" },
  { check: "Locale contracts", command: "npm run test:locale", date: "2026-10-13", counts: { passed: 8, failed: 0 }, source: "docs/school-ai/IMPLEMENTATION.md" },
  { check: "Local exam load harness against a development server", command: "npm run test:school-ai:load", date: "2026-10-13", counts: { candidates: 32, requests: 366, candidatesPassed: 32, httpConflicts: 11, rateLimited: 0 }, source: "docs/school-ai/IMPLEMENTATION.md" },
] as const satisfies readonly VerificationRecordInput[];

/* ------------------------------------------------------------------ excluded material (R1.6) */

/** Material classes Exam Studio excludes. No schema in this module has a field that could hold them. */
export const EXCLUDED_MATERIAL_CLASSES = Object.freeze([
  Object.freeze({ class: "TESTIMONIAL", reason: "A quotation the register cannot cite to a dated, permitted source is excluded." }),
  Object.freeze({ class: "NAMED_SCHOOL_REFERENCE", reason: "No school is named without a dated written permission record, which this repository does not hold." }),
  Object.freeze({ class: "COMPETITOR_COMPARISON", reason: "A comparison needs a current, cited source for the other product; differentiators are stated as school needs instead." }),
  Object.freeze({ class: "MARKET_SHARE_FIGURE", reason: "A market figure needs a cited measurement with a sample and a date, which no repository artifact provides." }),
] as const);

/* ------------------------------------------------------------------ the single export (R1.9) */

export type RegisterInput = {
  claims?: readonly unknown[];
  gates?: readonly unknown[];
  figures?: readonly unknown[];
  differentiators?: readonly unknown[];
  contracts?: readonly unknown[];
  verifications?: readonly unknown[];
};

export type CommercialEvidenceSummary = ReturnType<typeof commercialEvidenceRegister>;

function assertUniqueIds(label: string, ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must carry unique identifiers.`);
}

/** Every prose field of the export, for the banned-term scan. The term vocabulary itself is excluded. */
export function registerProse(summary: { notice: string; claims: readonly CommercialClaim[]; gates: readonly ReleaseGate[]; differentiators: readonly { differentiator: string; gap: string }[]; contracts: readonly { consumed: string; whenAbsent: string; exclusion: string }[]; figures: readonly { label: string; rendered: string }[]; verifications: readonly { check: string }[] }): string {
  return [
    summary.notice,
    ...summary.claims.flatMap(claim => [claim.claim, claim.remaining ?? "", renderClaimState(claim)]),
    ...summary.gates.flatMap(gate => [gate.title, gate.closedBy, gate.evidence ?? ""]),
    ...summary.differentiators.flatMap(row => [row.differentiator, row.gap]),
    ...summary.contracts.flatMap(row => [row.consumed, row.whenAbsent, row.exclusion]),
    ...summary.figures.flatMap(row => [row.label, row.rendered]),
    ...summary.verifications.map(row => row.check),
  ].join("\n");
}

const NOTICE =
  "Every claim below is recorded with a derived state, never a declared one. A claim with no cited repository artifact and no dated external gate record is recorded as not started. A claim whose owning gate is open is recorded as gate open with the gate and its owner named, not as a passing check. A figure with no recorded measurement renders as not measured.";

/**
 * Produces the complete claim list with every state and citation, in one call (R1.9).
 * Pass overrides to resolve a different claim list against a different gate table.
 */
export function commercialEvidenceRegister(input: RegisterInput = {}) {
  const gates = (input.gates ?? RELEASE_GATES).map(gate => releaseGateSchema.parse(gate));
  const figures = (input.figures ?? CLAIM_FIGURES).map(resolveFigure);
  const claims = (input.claims ?? CLAIM_EVIDENCE).map(claim => resolveClaimState(claim, gates, figures));
  const differentiators = (input.differentiators ?? NAMED_DIFFERENTIATORS).map(row => differentiatorSchema.parse(row));
  const contracts = (input.contracts ?? INTEGRATION_CONTRACTS).map(row => integrationContractSchema.parse(row));
  const verifications = (input.verifications ?? VERIFICATION_RECORDS).map(row => verificationRecordSchema.parse(row));
  assertUniqueIds("Gates", gates.map(row => row.gate));
  assertUniqueIds("Figures", figures.map(row => row.id));
  assertUniqueIds("Claims", claims.map(row => row.id));
  assertUniqueIds("Differentiators", differentiators.map(row => row.id));
  assertUniqueIds("Integration contracts", contracts.map(row => row.id));
  const claimById = new Map(claims.map(claim => [claim.id, claim]));
  const referencedFigures = new Set(claims.flatMap(claim => claim.figures.map(figure => figure.id)));
  for (const figure of figures) if (!referencedFigures.has(figure.id)) throw new Error(`Figure ${figure.id} belongs to no claim, so nothing can display it.`);
  const resolvedDifferentiators = differentiators.map(row => {
    const named = row.claimIds.map(id => {
      const claim = claimById.get(id);
      if (!claim) throw new Error(`Differentiator ${row.id} names claim ${id}, which the register does not record.`);
      return claim;
    });
    // A differentiator reads no stronger than the weakest claim behind it.
    const state = named.reduce<ClaimState>((weakest, claim) => (CLAIM_STATE_RANK[claim.state] < CLAIM_STATE_RANK[weakest] ? claim.state : weakest), "BUILT");
    return { ...row, state, claims: named.map(claim => ({ id: claim.id, state: claim.state })) };
  });
  const resolvedContracts = contracts.map(row => {
    const gate = row.gate === null ? null : gates.find(candidate => candidate.gate === row.gate);
    if (row.gate !== null && !gate) throw new Error(`Integration contract ${row.id} names gate ${row.gate}, which the register does not record.`);
    for (const id of row.claimIds) if (!claimById.has(id)) throw new Error(`Integration contract ${row.id} names claim ${id}, which the register does not record.`);
    return { ...row, gateOpen: gate ? gate.passedOn === null : false, gateOwner: gate?.owner ?? null, claims: row.claimIds.map(id => ({ id, state: claimById.get(id)!.state })) };
  });
  const resolvedFigures = figures.map(figure => ({ ...figure, rendered: renderFigure(figure) }));
  const counts = claims.reduce<Record<ClaimState, number>>((totals, claim) => ({ ...totals, [claim.state]: totals[claim.state] + 1 }), { BUILT: 0, PARTIAL: 0, EXTERNAL_GATE_OPEN: 0, NOT_STARTED: 0 });
  const summary = {
    version: 1 as const,
    feature: "SKO-408",
    notice: NOTICE,
    claims,
    counts,
    differentiators: resolvedDifferentiators,
    contracts: resolvedContracts,
    gates,
    openGates: gates.filter(gate => gate.passedOn === null),
    figures: resolvedFigures,
    verifications,
    excludedMaterialClasses: EXCLUDED_MATERIAL_CLASSES,
    bannedTerms: BANNED_CLAIM_TERMS,
  };
  const scanned = registerProse(summary);
  assertNoBannedTerms("The evidence register export", scanned);
  return { ...summary, bannedTermScan: { scannedCharacters: scanned.length, findings: scanBannedTerms(scanned) } };
}
