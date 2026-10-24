/**
 * Property 39 for the Commercial Evidence Register (SKO-408, task 1.8).
 *
 * `exam-studio-evidence-register.test.ts` holds the example tests over the seeded register itself.
 * This file is the property test: it generates whole evidence worlds — a gate table with open and
 * dated passes, a figure table, a claim list with and without citations, named differentiators and
 * integration contracts — and asserts the universal statements over every combination the sweep
 * draws, for each of the 100 fixed seeds in `SEEDS_100`.
 *
 * The oracle is restated from the requirements rather than copied from the module's control flow:
 * a claim with no cited artifact and no dated gate record is `NOT_STARTED` (R1.2); a claim whose
 * owning gate is open is never a passing check and always names the gate and its owner (R1.3,
 * R29.10); `BUILT` needs at least one citation (R1.1); a differentiator reads no stronger than its
 * weakest claim (R1.7); no rendered output carries an excluded term (R1.8); and one export carries
 * every claim with its state and citations (R1.9).
 *
 * Generated worlds stay inside the schemas. Invalid records are asserted as *refused* in the third
 * test, so a malformed input is a recorded refusal rather than a crash inside the property.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BANNED_CLAIM_TERMS,
  CLAIM_STATE_RANK,
  NOT_MEASURED,
  RELEASE_GATE_IDS,
  claimCitationSchema,
  claimEvidenceSchema,
  claimFigureSchema,
  commercialEvidenceRegister,
  releaseGateSchema,
  renderClaimState,
  resolveClaimState,
  scanBannedTerms,
} from "../../src/lib/school-ai/commercial-evidence";
import type { ClaimState } from "../../src/lib/school-ai/commercial-evidence";
import { PROPERTY_ITERATIONS, SEEDS_100, forEachSeed, isoAt } from "./exam-studio-generators";
import type { Rng } from "./exam-studio-generators";

// ---------------------------------------------------------------------------------------------
// The generated world
// ---------------------------------------------------------------------------------------------

type CitationInput = { path: string; test?: string; migration?: string; case?: string };
type MeasurementInput = { sampleSize: number; dateRangeStart: string; dateRangeEnd: string; method: string; source: string };
type GateInput = { gate: string; title: string; owner: string; requirements: string[]; closedBy: string; passedOn: string | null; evidence: string | null };
type FigureInput = { id: string; label: string; requirements: string[]; value: string | null; measurement: MeasurementInput | null };
type ClaimInput = { id: string; claim: string; requirements: string[]; citations: CitationInput[]; gates: string[]; remaining: string | null; figures: string[] };
type DifferentiatorInput = { id: string; differentiator: string; gap: string; requirements: string[]; claimIds: string[] };
type ContractInput = { id: string; criterion: string; owners: string[]; consumed: string; whenAbsent: string; exclusion: string; gate: string | null; claimIds: string[] };

const GATE_MODES = ["ALL_OPEN", "ALL_DATED", "MIXED"] as const;
const CLAIM_MODES = ["NO_EVIDENCE", "FULLY_CITED", "MIXED"] as const;
type GateMode = (typeof GATE_MODES)[number];
type ClaimMode = (typeof CLAIM_MODES)[number];

type EvidenceWorld = {
  gateMode: GateMode;
  claimMode: ClaimMode;
  gates: GateInput[];
  figures: FigureInput[];
  claims: ClaimInput[];
  differentiators: DifferentiatorInput[];
  contracts: ContractInput[];
};

const CLAIM_STATES = ["BUILT", "PARTIAL", "EXTERNAL_GATE_OPEN", "NOT_STARTED"] as const;
const OWNERS = ["SKO-408", "SKO-449", "SKO-451", "SKO-422", "SKO-99"] as const;
const REQUIREMENT_IDS = ["1.1", "1.2", "1.7", "1.8", "1.9", "29.10", "12.8", "30.9"] as const;
const CITED_PATHS = ["src/lib/school-ai/commercial-evidence.ts", "src/lib/school-ai/studio-access.ts", "src/lib/school-ai/assessment.ts", "tests/school-ai/exam-studio-generators.ts", "docs/school-ai/IMPLEMENTATION.md"] as const;
const TEST_PATHS = ["tests/school-ai/exam-studio-evidence.test.ts", "tests/school-ai/exam-studio-evidence-register.test.ts", "tests/school-ai/assessment.test.ts", "tests/design-system/adoption.test.ts", "tests/school-ai/exam.browser.spec.ts"] as const;
const MIGRATION_PATHS = ["prisma/migrations/20261013141000_school_ai_assistant_catalog/migration.sql", "prisma/migrations/20261014120000_school_ai_exam_studio_release/migration.sql"] as const;
const TEST_CASES = ["a generated claim derives its state from the recorded evidence", "a generated gate names its owning ticket while it stays open"] as const;

/** Every generated date is an offset from the fixture's fixed epoch, so no generated value reads the clock. */
const isoDate = (dayOffset: number) => isoAt(dayOffset * 86_400_000).slice(0, 10);

function buildCitation(rng: Rng): CitationInput {
  const path = rng.pick(CITED_PATHS);
  if (rng.bool(1, 3)) return { path, migration: rng.pick(MIGRATION_PATHS) };
  const cited = rng.pick(TEST_PATHS);
  return rng.bool() ? { path, test: cited, case: rng.pick(TEST_CASES) } : { path, test: cited };
}

function buildGates(rng: Rng, gateMode: GateMode): GateInput[] {
  const ids: string[] = [...rng.subset(RELEASE_GATE_IDS, 1, 3)];
  if (rng.bool()) ids.push(`GATE_${rng.hex(6).toUpperCase()}`);
  return ids.map((gate, index) => {
    const dated = gateMode === "ALL_DATED" || (gateMode === "MIXED" && rng.bool());
    return {
      gate,
      title: `Generated gate ${index + 1} covering a dependency this register cannot close by itself`,
      owner: rng.pick(OWNERS),
      requirements: rng.subset(REQUIREMENT_IDS, 1, 3),
      closedBy: "A dated pass recorded by the owning ticket outside this repository, never a synthetic test run.",
      passedOn: dated ? isoDate(rng.int(0, 120)) : null,
      evidence: dated ? `A dated pass recorded against the owning ticket for gate ${index + 1}.` : null,
    };
  });
}

function buildFigures(rng: Rng): FigureInput[] {
  return Array.from({ length: rng.int(0, 3) }, (_unused, index) => {
    const measured = rng.bool();
    const start = rng.int(0, 60);
    return {
      id: `FIGURE_${index}_${rng.hex(4).toUpperCase()}`,
      label: `Generated figure ${index + 1} describing a measurement this register may not hold`,
      requirements: rng.subset(REQUIREMENT_IDS, 1, 2),
      value: measured ? `${rng.int(1, 999)} ms` : null,
      measurement: measured
        ? {
            sampleSize: rng.int(1, 5_000),
            dateRangeStart: isoDate(start),
            dateRangeEnd: isoDate(start + rng.int(0, 30)),
            method: "A named method recorded beside the figure, stated fully enough for a reviewer to repeat it.",
            source: rng.pick(CITED_PATHS),
          }
        : null,
    };
  });
}

function buildClaims(rng: Rng, gates: GateInput[], figures: FigureInput[], claimMode: ClaimMode): ClaimInput[] {
  const claims = Array.from({ length: rng.int(1, 6) }, (_unused, index): ClaimInput => {
    const cited = claimMode === "FULLY_CITED" || (claimMode === "MIXED" && rng.bool());
    return {
      id: `CLAIM_${index}_${rng.hex(4).toUpperCase()}`,
      claim: `Generated capability ${index + 1}, stated for this property sweep and for nothing else.`,
      requirements: rng.subset(REQUIREMENT_IDS, 1, 4),
      citations: cited ? Array.from({ length: rng.int(1, 3) }, () => buildCitation(rng)) : [],
      gates: rng.bool(2, 3) ? rng.subset(gates.map(gate => gate.gate), 1, Math.min(5, gates.length)) : [],
      remaining: rng.bool(1, 3) ? `Named open work inside this repository for capability ${index + 1}.` : null,
      figures: [],
    };
  });
  // The register refuses a figure no claim can display, so every generated figure gets an owner.
  figures.forEach((figure, index) => claims[index % claims.length].figures.push(figure.id));
  return claims;
}

function buildDifferentiators(rng: Rng, claims: ClaimInput[]): DifferentiatorInput[] {
  return Array.from({ length: rng.int(1, 3) }, (_unused, index) => ({
    id: `DIFFERENTIATOR_${index}_${rng.hex(4).toUpperCase()}`,
    differentiator: `Generated differentiator ${index + 1}, stated as a capability a school needs.`,
    gap: `The named capability gap generated differentiator ${index + 1} addresses, written as a school need and never as a comparison.`,
    requirements: rng.subset(REQUIREMENT_IDS, 1, 3),
    claimIds: rng.subset(claims.map(claim => claim.id), 1, Math.min(8, claims.length)),
  }));
}

function buildContracts(rng: Rng, claims: ClaimInput[], gates: GateInput[]): ContractInput[] {
  return Array.from({ length: rng.int(0, 3) }, (_unused, index) => {
    const gate = gates.length ? rng.pick(gates) : null;
    // R29.10 is about the dependent capability of a consumed owner, so a gated contract names only
    // claims that name that gate.
    const dependents = gate ? claims.filter(claim => claim.gates.includes(gate.gate)) : [];
    const gated = gate !== null && dependents.length > 0;
    return {
      id: `CONTRACT_${index}_${rng.hex(4).toUpperCase()}`,
      criterion: rng.pick(REQUIREMENT_IDS),
      owners: rng.subset(OWNERS, 1, 3),
      consumed: `A record owned by a neighbouring ticket and consumed by generated capability ${index + 1}.`,
      whenAbsent: `With that record absent this register states the dependent capability as unavailable instead of inferring it.`,
      exclusion: `This register does not implement the neighbouring record for contract ${index + 1} a second time.`,
      gate: gated ? gate.gate : null,
      claimIds: gated ? rng.subset(dependents.map(claim => claim.id), 1, Math.min(8, dependents.length)) : rng.subset(claims.map(claim => claim.id), 0, Math.min(3, claims.length)),
    };
  });
}

/** One whole evidence world: gates with open and dated passes, figures, claims, differentiators and contracts. */
function arbitraryEvidenceWorld(rng: Rng): EvidenceWorld {
  const gateMode = rng.pick(GATE_MODES);
  const claimMode = rng.pick(CLAIM_MODES);
  const gates = buildGates(rng, gateMode);
  const figures = buildFigures(rng);
  const claims = buildClaims(rng, gates, figures, claimMode);
  return { gateMode, claimMode, gates, figures, claims, differentiators: buildDifferentiators(rng, claims), contracts: buildContracts(rng, claims, gates) };
}

// ---------------------------------------------------------------------------------------------
// Keeping a shrunk candidate a real world
// ---------------------------------------------------------------------------------------------

const uniqueBy = <T>(rows: readonly T[], key: (row: T) => string): T[] => {
  const seen = new Set<string>();
  return rows.filter(row => (seen.has(key(row)) ? false : (seen.add(key(row)), true)));
};

/**
 * The shrinker removes array elements, so a shrunk candidate can reference a claim, gate or figure
 * that is gone. Re-closing those references keeps a reported counterexample a world the register
 * accepts, instead of a cross-reference error that says nothing about the property.
 */
function closeReferences(world: EvidenceWorld): EvidenceWorld {
  const gates = uniqueBy(world.gates, gate => gate.gate);
  const gateIds = new Set(gates.map(gate => gate.gate));
  const figures = uniqueBy(world.figures, figure => figure.id);
  const figureIds = new Set(figures.map(figure => figure.id));
  const claims = uniqueBy(world.claims, claim => claim.id).map(claim => ({
    ...claim,
    gates: [...new Set(claim.gates.filter(id => gateIds.has(id)))],
    figures: [...new Set(claim.figures.filter(id => figureIds.has(id)))],
  }));
  const claimById = new Map(claims.map(claim => [claim.id, claim]));
  const displayed = new Set(claims.flatMap(claim => claim.figures));
  const differentiators = world.differentiators
    .map(row => ({ ...row, claimIds: [...new Set(row.claimIds.filter(id => claimById.has(id)))] }))
    .filter(row => row.claimIds.length > 0);
  const contracts = world.contracts.map(row => {
    const gate = row.gate !== null && gateIds.has(row.gate) ? row.gate : null;
    const named = [...new Set(row.claimIds.filter(id => claimById.has(id)))];
    return { ...row, gate, claimIds: gate === null ? named : named.filter(id => claimById.get(id)!.gates.includes(gate)) };
  });
  return { ...world, gates, figures: figures.filter(figure => displayed.has(figure.id)), claims, differentiators, contracts };
}

const registerInput = (world: EvidenceWorld) => ({ claims: world.claims, gates: world.gates, figures: world.figures, differentiators: world.differentiators, contracts: world.contracts });

/** True while every record in the world still parses. A shrunk candidate that breaks a schema is not a counterexample to this property; the refusal test owns malformed input. */
function insideSchemas(world: EvidenceWorld): boolean {
  return (
    world.claims.length > 0 &&
    world.gates.every(gate => releaseGateSchema.safeParse(gate).success) &&
    world.figures.every(figure => claimFigureSchema.safeParse(figure).success) &&
    world.claims.every(claim => claimEvidenceSchema.safeParse(claim).success)
  );
}

/** The state R1.1, R1.2 and R1.3 require, restated from the acceptance criteria rather than from the module. */
function requiredState(claim: ClaimInput, gates: readonly GateInput[]): ClaimState {
  const named = claim.gates.map(id => gates.find(gate => gate.gate === id)!);
  const open = named.filter(gate => gate.passedOn === null);
  const dated = named.filter(gate => gate.passedOn !== null);
  if (claim.citations.length === 0 && dated.length === 0) return "NOT_STARTED";
  if (open.length > 0) return "EXTERNAL_GATE_OPEN";
  if (claim.citations.length === 0 || claim.remaining !== null) return "PARTIAL";
  return "BUILT";
}

const citationShape = (citation: { path: string; test?: string; migration?: string; case?: string }) => ({ path: citation.path, test: citation.test ?? null, migration: citation.migration ?? null, case: citation.case ?? null });

/**
 * `forEachSeed` appends the failing seed and the shrunk input to the error's message, but a Node
 * `AssertionError` captured its stack when it was constructed and the test reporter prints that
 * stack. Rethrowing the annotated message as a fresh error puts the seed and the shrunk input in
 * the printed failure, with the original assertion kept as the cause.
 */
function sweep<T>(build: (rng: Rng, seed: number) => T, check: (value: T, seed: number) => void): void {
  try {
    forEachSeed(build, check);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
  }
}

// ---------------------------------------------------------------------------------------------
// The property
// ---------------------------------------------------------------------------------------------

// Feature: ai-exam-studio, Property 39: Capability claims without evidence are recorded as not started
test("Property 39: capability claims without evidence are recorded as not started", () => {
  assert.ok(PROPERTY_ITERATIONS >= 100, "the sweep runs at least 100 iterations");
  sweep(arbitraryEvidenceWorld, raw => {
    const world = closeReferences(raw);
    if (!insideSchemas(world)) return;
    const register = commercialEvidenceRegister(registerInput(world));

    for (const claim of world.claims) {
      const resolved = resolveClaimState(claim, world.gates, world.figures);
      const rendered = renderClaimState(resolved);
      const named = claim.gates.map(id => world.gates.find(gate => gate.gate === id)!);
      const open = named.filter(gate => gate.passedOn === null);
      const dated = named.filter(gate => gate.passedOn !== null);

      assert.equal(resolved.state, requiredState(claim, world.gates), `${claim.id} state`);

      // R1.2 — no cited artifact and no dated gate record is recorded as not started, never as anything stronger.
      if (claim.citations.length === 0 && dated.length === 0) {
        assert.equal(resolved.state, "NOT_STARTED", `${claim.id} has no evidence at all`);
        assert.deepEqual(resolved.citations, [], `${claim.id} carries no citation`);
        assert.match(rendered, /^not started/, `${claim.id} renders as not started`);
        assert.match(rendered, /no cited artifact/, `${claim.id} says what is missing`);
      }

      // R1.3, R29.10 — an open gate is never a passing check, and the gate and its owner are always named.
      if (open.length > 0) {
        assert.notEqual(resolved.state, "BUILT", `${claim.id} names an open gate`);
        assert.ok(["EXTERNAL_GATE_OPEN", "NOT_STARTED"].includes(resolved.state), `${claim.id} state ${resolved.state} with an open gate`);
        assert.ok(CLAIM_STATE_RANK[resolved.state] <= CLAIM_STATE_RANK.EXTERNAL_GATE_OPEN, `${claim.id} reads no stronger than gate open`);
        for (const gate of open) {
          assert.ok(rendered.includes(gate.gate), `${claim.id} names open gate ${gate.gate}: ${rendered}`);
          assert.ok(rendered.includes(`owner ${gate.owner}`), `${claim.id} names the owner of ${gate.gate}: ${rendered}`);
        }
      }

      // R1.1 — built is unreachable without a cited repository artifact naming a test or a migration.
      assert.equal(claim.citations.length === 0 && resolved.state === "BUILT", false, `${claim.id} cannot be built without a citation`);
      if (resolved.state === "BUILT") {
        assert.ok(resolved.citations.length >= 1, `${claim.id} cites at least one artifact`);
        assert.equal(resolved.openGates.length, 0, `${claim.id} has no open gate`);
        assert.equal(resolved.remaining, null, `${claim.id} has no named open work`);
        for (const cited of resolved.citations) assert.ok(cited.test ?? cited.migration, `${claim.id} cites a test or a migration`);
      }

      // R1.8 — no rendered line carries an excluded term.
      assert.deepEqual(scanBannedTerms(`${resolved.claim} ${resolved.remaining ?? ""} ${rendered}`), [], `${claim.id} rendered output`);
    }

    // R1.9 — one export carries every claim with its state and its citations.
    assert.equal(register.claims.length, world.claims.length);
    assert.deepEqual(register.claims.map(row => row.id), world.claims.map(row => row.id));
    for (const [index, row] of register.claims.entries()) {
      const source = world.claims[index];
      assert.ok(CLAIM_STATES.includes(row.state), `${row.id} carries a recorded state`);
      assert.equal(row.state, requiredState(source, world.gates), `${row.id} state in the export`);
      assert.deepEqual(row.citations.map(citationShape), source.citations.map(citationShape), `${row.id} citations in the export`);
      assert.ok(row.requirements.length >= 1, `${row.id} carries a requirement identifier`);
      assert.ok(renderClaimState(row).length > 10, `${row.id} renders a state line`);
    }
    for (const state of CLAIM_STATES) assert.equal(register.counts[state], register.claims.filter(row => row.state === state).length, `${state} count`);
    assert.equal(world.claims.length, CLAIM_STATES.reduce((total, state) => total + register.counts[state], 0));

    // R1.7 — a differentiator reads no stronger than the weakest claim behind it.
    for (const row of register.differentiators) {
      assert.ok(row.claims.length >= 1, `${row.id} names at least one claim`);
      const weakest = row.claims.reduce((lowest, claim) => (CLAIM_STATE_RANK[claim.state] < CLAIM_STATE_RANK[lowest] ? claim.state : lowest), row.claims[0].state);
      assert.equal(row.state, weakest, `${row.id} reads as its weakest claim`);
      for (const claim of row.claims) assert.ok(CLAIM_STATE_RANK[row.state] <= CLAIM_STATE_RANK[claim.state], `${row.id} never reads stronger than ${claim.id}`);
      assert.ok(row.requirements.length >= 1, `${row.id} maps to a requirement identifier`);
      assert.deepEqual(scanBannedTerms(`${row.differentiator} ${row.gap}`), [], `${row.id} prose`);
    }

    // R29.10 — a consumed owner's open gate names the owning ticket on every dependent capability.
    for (const row of register.contracts) {
      const gate = row.gate === null ? null : world.gates.find(candidate => candidate.gate === row.gate)!;
      assert.equal(row.gateOpen, gate ? gate.passedOn === null : false, `${row.id} gate state`);
      assert.equal(row.gateOwner, gate ? gate.owner : null, `${row.id} gate owner`);
      if (gate && gate.passedOn === null) {
        assert.match(row.gateOwner!, /^SKO-\d{2,6}$/, `${row.id} names an owning ticket`);
        for (const dependent of row.claims) {
          assert.ok(["EXTERNAL_GATE_OPEN", "NOT_STARTED"].includes(dependent.state), `${row.id} dependent ${dependent.id} is ${dependent.state}`);
          assert.ok(renderClaimState(register.claims.find(claim => claim.id === dependent.id)!).includes(`owner ${gate.owner}`), `${row.id} dependent ${dependent.id} names ${gate.owner}`);
        }
      }
      assert.deepEqual(scanBannedTerms(`${row.consumed} ${row.whenAbsent} ${row.exclusion}`), [], `${row.id} prose`);
    }

    // R1.8 — the whole export, including every figure line, is free of excluded terms.
    for (const row of register.figures) {
      if (row.measurement === null) assert.equal(row.rendered, NOT_MEASURED, `${row.id} renders not measured`);
      assert.deepEqual(scanBannedTerms(`${row.label} ${row.rendered}`), [], `${row.id} rendered figure`);
    }
    assert.deepEqual(register.bannedTermScan.findings, [], "the export carries no excluded term");
    assert.ok(register.bannedTermScan.scannedCharacters > 0);
    assert.deepEqual(scanBannedTerms(register.notice), []);
  });
});

test("the generated worlds stay inside the schemas and reach every recorded state", () => {
  assert.ok(SEEDS_100.length >= 100, "the fixed seed list drives at least 100 iterations");
  assert.deepEqual([...CLAIM_STATES].sort(), Object.keys(CLAIM_STATE_RANK).sort());
  const states = new Set<ClaimState>();
  const gateStates = new Set<string>();
  const claimModes = new Set<ClaimMode>();
  sweep(arbitraryEvidenceWorld, world => {
    for (const gate of world.gates) {
      assert.equal(releaseGateSchema.safeParse(gate).success, true, `${gate.gate} must parse`);
      gateStates.add(gate.passedOn === null ? "OPEN" : "DATED");
    }
    for (const figure of world.figures) assert.equal(claimFigureSchema.safeParse(figure).success, true, `${figure.id} must parse`);
    for (const claim of world.claims) {
      assert.equal(claimEvidenceSchema.safeParse(claim).success, true, `${claim.id} must parse`);
      for (const cited of claim.citations) assert.equal(claimCitationSchema.safeParse(cited).success, true, `${claim.id} citation must parse`);
      states.add(resolveClaimState(claim, world.gates, world.figures).state);
    }
    claimModes.add(world.claimMode);
    // The world itself is a legal register, so the property above exercises resolution and not a parse error.
    assert.ok(commercialEvidenceRegister(registerInput(world)).claims.length === world.claims.length);
  });
  assert.deepEqual([...states].sort(), [...CLAIM_STATES].sort(), "the sweep reaches all four recorded states");
  assert.deepEqual([...gateStates].sort(), ["DATED", "OPEN"], "the sweep draws both open and closed owning gates");
  assert.deepEqual([...claimModes].sort(), [...CLAIM_MODES].sort(), "the sweep draws claim lists with and without citations");
});

test("a malformed claim, gate, citation or cross reference is refused rather than recorded", () => {
  sweep(arbitraryEvidenceWorld, raw => {
    const world = closeReferences(raw);
    if (!insideSchemas(world) || !world.gates.length || !world.differentiators.length) return;
    const claim = world.claims[0];
    const gate = world.gates[0];

    // A state is derived, never declared: there is no field to declare it in.
    assert.equal(claimEvidenceSchema.safeParse({ ...claim, state: "BUILT" }).success, false);
    assert.equal(claimEvidenceSchema.safeParse({ ...claim, testimonial: "A named school said so." }).success, false);
    assert.equal(claimEvidenceSchema.safeParse({ ...claim, id: claim.id.toLowerCase() }).success, false);

    // R1.8 — an excluded term cannot be recorded in claim text, in open work or in a gate title.
    for (const term of BANNED_CLAIM_TERMS) {
      assert.equal(claimEvidenceSchema.safeParse({ ...claim, claim: `This generated capability is ${term} on every device.` }).success, false, term);
      assert.equal(claimEvidenceSchema.safeParse({ ...claim, remaining: `The remaining work makes this ${term} everywhere.` }).success, false, term);
      assert.equal(releaseGateSchema.safeParse({ ...gate, title: `A gate proving the generated exam room is ${term} on every device.` }).success, false, term);
    }

    // A dated gate pass cites its evidence, and an open gate carries neither.
    assert.equal(releaseGateSchema.safeParse({ ...gate, passedOn: isoDate(7), evidence: null }).success, false);
    assert.equal(releaseGateSchema.safeParse({ ...gate, passedOn: null, evidence: "A pass with no date behind it." }).success, false);
    assert.equal(releaseGateSchema.safeParse({ ...gate, owner: "SKO" }).success, false);

    // A citation names exactly one of a test file or a migration file, inside this repository.
    const cited = claim.citations[0] ?? { path: "src/lib/school-ai/commercial-evidence.ts", test: "tests/school-ai/exam-studio-evidence.test.ts" };
    assert.equal(claimCitationSchema.safeParse({ path: cited.path }).success, false);
    assert.equal(claimCitationSchema.safeParse({ path: cited.path, test: TEST_PATHS[0], migration: MIGRATION_PATHS[0] }).success, false);
    assert.equal(claimCitationSchema.safeParse({ path: cited.path, test: "tests/school-ai/helpers.ts" }).success, false);
    assert.equal(claimCitationSchema.safeParse({ path: cited.path, migration: "prisma/schema.prisma" }).success, false);
    assert.equal(claimCitationSchema.safeParse({ path: "/etc/passwd", test: TEST_PATHS[0] }).success, false);
    assert.equal(claimCitationSchema.safeParse({ path: cited.path, case: TEST_CASES[0] }).success, false);

    // A claim cannot name a gate or a figure the register does not record.
    assert.throws(() => resolveClaimState({ ...claim, gates: ["ABSENT_GATE"] }, world.gates, world.figures), /does not record/);
    assert.throws(() => resolveClaimState({ ...claim, figures: ["ABSENT_FIGURE"] }, world.gates, world.figures), /does not record/);

    // The export refuses duplicate identifiers, an unowned figure and a differentiator naming an absent claim.
    const input = registerInput(world);
    assert.throws(() => commercialEvidenceRegister({ ...input, claims: [...world.claims, claim] }), /unique identifiers/);
    assert.throws(() => commercialEvidenceRegister({ ...input, gates: [...world.gates, gate] }), /unique identifiers/);
    assert.throws(
      () => commercialEvidenceRegister({ ...input, figures: [...world.figures, { id: "FIGURE_ORPHAN", label: "A generated figure no claim can display", requirements: ["1.5"], value: null, measurement: null }] }),
      /belongs to no claim/,
    );
    assert.throws(() => commercialEvidenceRegister({ ...input, differentiators: [{ ...world.differentiators[0], claimIds: ["ABSENT_CLAIM"] }] }), /does not record/);
    assert.throws(() => commercialEvidenceRegister({ ...input, claims: [{ ...claim, claim: "This generated capability is cheat-proof." }, ...world.claims.slice(1)] }), /excluded term|Recorded text/);
  });
});
