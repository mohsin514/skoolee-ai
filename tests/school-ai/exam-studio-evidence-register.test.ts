import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  BANNED_CLAIM_TERMS,
  CLAIM_EVIDENCE,
  CLAIM_FIGURES,
  CLAIM_STATE_RANK,
  INTEGRATION_CONTRACTS,
  NAMED_DIFFERENTIATORS,
  NOT_MEASURED,
  RELEASE_GATES,
  RELEASE_GATE_IDS,
  assertNoBannedTerms,
  claimCitationSchema,
  claimEvidenceSchema,
  claimFigureSchema,
  commercialEvidenceRegister,
  renderClaimState,
  renderFigure,
  resolveClaimState,
  scanBannedTerms,
} from "../../src/lib/school-ai/commercial-evidence";

const gate = (overrides: Record<string, unknown> = {}) => ({
  gate: "TEST_GATE",
  title: "A hypothetical gate used only by this test file to exercise the register",
  owner: "SKO-449",
  requirements: ["12.8"],
  closedBy: "A dated pass recorded by the owning ticket on real hardware, never a synthetic test run.",
  passedOn: null,
  evidence: null,
  ...overrides,
});
const citation = { path: "src/lib/school-ai/commercial-evidence.ts", test: "tests/school-ai/exam-studio-evidence-register.test.ts" };
const claim = (overrides: Record<string, unknown> = {}) => ({ id: "HYPOTHETICAL", claim: "A hypothetical capability used by this test file.", requirements: ["1.1"], ...overrides });

// The EVIDENCE_REGISTER claim cites this test by name. Renaming it breaks its own citation.
test("a claim with no cited artifact and no dated gate record is recorded as not started", () => {
  const bare = resolveClaimState(claim());
  assert.equal(bare.state, "NOT_STARTED");
  assert.deepEqual(bare.citations, []);
  assert.match(renderClaimState(bare), /no cited artifact and no dated external gate record/);
  // An open gate is not evidence: without a citation the claim stays not started, and still names the gate.
  const gated = resolveClaimState(claim({ gates: ["TEST_GATE"] }), [gate()]);
  assert.equal(gated.state, "NOT_STARTED");
  assert.match(renderClaimState(gated), /TEST_GATE \(owner SKO-449\)/);
  // Not started is the fall-through for the seeded register too, never a special case.
  const register = commercialEvidenceRegister();
  for (const row of register.claims) if (!row.citations.length && !row.openGates.some(open => open.passedOn !== null)) assert.equal(row.state, "NOT_STARTED", row.id);
  assert.equal(register.counts.NOT_STARTED, CLAIM_EVIDENCE.filter(row => !("citations" in row)).length);
});

test("a built state is unreachable without a repository citation naming a test or a migration", () => {
  assert.equal(resolveClaimState(claim({ citations: [citation] })).state, "BUILT");
  // Named open work, or evidence that is only an external pass, can never read as built.
  assert.equal(resolveClaimState(claim({ citations: [citation], remaining: "The remaining half of this capability is unwritten." })).state, "PARTIAL");
  assert.equal(resolveClaimState(claim({ gates: ["TEST_GATE"] }), [gate({ passedOn: "2026-10-13", evidence: "A dated pass recorded by the owning ticket." })]).state, "PARTIAL");
  // An open gate outranks a citation: an unverifiable claim is never a passing check.
  const gated = resolveClaimState(claim({ citations: [citation], gates: ["TEST_GATE"] }), [gate()]);
  assert.equal(gated.state, "EXTERNAL_GATE_OPEN");
  assert.match(renderClaimState(gated), /gate open — .*\(TEST_GATE, owner SKO-449\)/);
  // The citation shape itself is validated, not trusted.
  assert.equal(claimCitationSchema.safeParse({ path: citation.path }).success, false);
  assert.equal(claimCitationSchema.safeParse({ ...citation, migration: "prisma/migrations/20261012090000_school_ai_workspace/migration.sql" }).success, false);
  assert.equal(claimCitationSchema.safeParse({ path: citation.path, test: "tests/school-ai/helpers.ts" }).success, false);
  assert.equal(claimCitationSchema.safeParse({ path: citation.path, migration: "prisma/schema.prisma" }).success, false);
  assert.equal(claimCitationSchema.safeParse({ path: citation.path, case: "a case with no cited test file" }).success, false);
  assert.equal(claimCitationSchema.safeParse({ path: "/etc/passwd", test: citation.test }).success, false);
  assert.equal(claimCitationSchema.safeParse({ path: citation.path, migration: "prisma/migrations/20261012090000_school_ai_workspace/migration.sql" }).success, true);
  // A claim cannot name a gate or a figure the register does not record.
  assert.throws(() => resolveClaimState(claim({ gates: ["ABSENT_GATE"] })), /does not record/);
  assert.throws(() => resolveClaimState(claim({ figures: ["ABSENT_FIGURE"] })), /does not record/);
  // A state cannot be declared: the field does not exist.
  assert.equal(claimEvidenceSchema.safeParse({ ...claim(), state: "BUILT" }).success, false);
});

test("every cited artifact, test file and test case exists in this repository", () => {
  for (const row of commercialEvidenceRegister().claims) {
    for (const cited of row.citations) {
      assert.ok(existsSync(cited.path), `${row.id} cites a missing path ${cited.path}`);
      const evidence = cited.test ?? cited.migration!;
      assert.ok(existsSync(evidence), `${row.id} cites a missing artifact ${evidence}`);
      if (cited.case) assert.ok(readFileSync(evidence, "utf8").includes(cited.case), `${row.id} cites a test case absent from ${evidence}: ${cited.case}`);
    }
  }
});

test("a numeric figure with no recorded measurement renders not measured", () => {
  const unmeasured = { id: "UNMEASURED", label: "A figure with no measurement behind it", requirements: ["1.5"], value: null, measurement: null };
  assert.equal(renderFigure(unmeasured), NOT_MEASURED);
  assert.equal(renderFigure(unmeasured), "not measured");
  // A value cannot be stored without its sample size, date range and method, and the reverse is refused too.
  assert.equal(claimFigureSchema.safeParse({ ...unmeasured, value: "99%" }).success, false);
  const measurement = { sampleSize: 366, dateRangeStart: "2026-10-13", dateRangeEnd: "2026-10-13", method: "A named method recorded with the figure, long enough to describe itself.", source: "docs/school-ai/IMPLEMENTATION.md" };
  assert.equal(claimFigureSchema.safeParse({ ...unmeasured, value: null, measurement }).success, false);
  assert.equal(claimFigureSchema.safeParse({ ...unmeasured, value: "99%", measurement: { ...measurement, sampleSize: 0 } }).success, false);
  assert.equal(claimFigureSchema.safeParse({ ...unmeasured, value: "99%", measurement: { ...measurement, dateRangeEnd: "2026-10-12" } }).success, false);
  // The seeded register renders accuracy, detection, marking agreement, time saving and review effort honestly.
  const register = commercialEvidenceRegister();
  assert.equal(register.figures.length, CLAIM_FIGURES.length);
  const unmeasuredRows = register.figures.filter(row => row.measurement === null);
  assert.ok(unmeasuredRows.length >= 5);
  for (const row of unmeasuredRows) assert.equal(row.rendered, NOT_MEASURED);
  const measured = register.figures.find(row => row.id === "LOAD_HARNESS_P95_RESPONSE")!;
  assert.match(measured.rendered, /sample size 366/);
  assert.match(measured.rendered, /2026-10-13/);
  assert.match(measured.rendered, /development-server sample, not production capacity/);
});

test("the banned-term scan finds every excluded term and the register cannot record one", () => {
  assert.equal(BANNED_CLAIM_TERMS.length, 4);
  for (const variant of ["cheat-proof", "Cheat Proof", "cheatproof", "tamper-proof", "TAMPERPROOF", "fraud proof", "guaranteed detection", "Guarantees detection", "detection is guaranteed"]) {
    assert.equal(scanBannedTerms(`Our exams are ${variant} today.`).length, 1, variant);
  }
  assert.deepEqual(scanBannedTerms("The boundary is app-level and the interface says so. Signals are factual and a human decides."), []);
  assert.throws(() => assertNoBannedTerms("Marketing copy", "A cheat-proof exam."), /excluded term \(cheat-proof\)/);
  // The scan runs at the recording boundary, so a banned term cannot enter the register at all.
  assert.equal(claimEvidenceSchema.safeParse(claim({ claim: "Exam Studio delivers a tamper-proof exam room." })).success, false);
  assert.equal(claimEvidenceSchema.safeParse(claim({ citations: [citation], remaining: "Guaranteed detection is still outstanding." })).success, false);
  // The export is investor-facing material generated from this repository.
  const register = commercialEvidenceRegister();
  assert.deepEqual(register.bannedTermScan.findings, []);
  assert.ok(register.bannedTermScan.scannedCharacters > 2000);
  // Interface copy carries none of them either.
  for (const file of ["src/lib/school-ai/copy.ts", "src/lib/school-ai/conversation-copy.ts", "src/lib/school-ai/revision-copy.ts", "src/lib/school-ai/setup-task-copy.ts"]) {
    assert.deepEqual(scanBannedTerms(readFileSync(file, "utf8")), [], file);
  }
  // This module spells the terms because it is the scanner. That is the one expected match.
  assert.ok(scanBannedTerms(readFileSync("src/lib/school-ai/commercial-evidence.ts", "utf8")).length > 0);
});

test("all five release gates are seeded open with an owning ticket", () => {
  const register = commercialEvidenceRegister();
  assert.equal(register.gates.length, 5);
  assert.deepEqual(register.gates.map(row => row.gate), [...RELEASE_GATE_IDS]);
  assert.equal(register.openGates.length, 5);
  for (const row of register.gates) {
    assert.equal(row.passedOn, null, row.gate);
    assert.equal(row.evidence, null, row.gate);
    assert.match(row.owner, /^SKO-\d{3}$/);
    assert.ok(row.requirements.length >= 1);
  }
  assert.ok(RELEASE_GATES.some(row => row.owner === "SKO-449"), "the managed client gate is owned by its ticket");
  assert.ok(RELEASE_GATES.some(row => row.owner === "SKO-451"), "the load gate is owned by its ticket");
  // Every claim that names an open gate is reported as gate open with that gate's owner.
  for (const row of register.claims.filter(item => item.citations.length && item.openGates.length)) {
    assert.equal(row.state, "EXTERNAL_GATE_OPEN", row.id);
    for (const open of row.openGates) assert.match(renderClaimState(row), new RegExp(`owner ${open.owner}`));
  }
  assert.ok(register.counts.EXTERNAL_GATE_OPEN >= 1);
  assert.equal(register.claims.length, register.counts.BUILT + register.counts.PARTIAL + register.counts.EXTERNAL_GATE_OPEN + register.counts.NOT_STARTED);
});

test("the eight integration contracts record owner, consumed record and absent behaviour", () => {
  const register = commercialEvidenceRegister();
  assert.equal(register.contracts.length, 8);
  assert.deepEqual(register.contracts.map(row => row.criterion), ["29.1", "29.2", "29.3", "29.4", "29.5", "29.6", "29.7", "29.8"]);
  assert.deepEqual(
    INTEGRATION_CONTRACTS.flatMap(row => row.owners).filter((value, index, all) => all.indexOf(value) === index).sort(),
    ["SKO-407", "SKO-410", "SKO-411", "SKO-412", "SKO-413", "SKO-422", "SKO-424", "SKO-449", "SKO-451"],
  );
  for (const row of register.contracts) {
    assert.ok(row.owners.length >= 1, row.id);
    assert.ok(row.consumed.length >= 15, row.id);
    assert.ok(row.whenAbsent.length >= 20, row.id);
    assert.ok(row.exclusion.length >= 15, row.id);
  }
  // A consumed owner's open gate names the owning ticket on the dependent claim (R29.10).
  for (const row of register.contracts.filter(item => item.gate !== null)) {
    assert.equal(row.gateOpen, true, row.id);
    assert.match(row.gateOwner!, /^SKO-\d{3}$/);
    for (const dependent of row.claims) assert.ok(["EXTERNAL_GATE_OPEN", "NOT_STARTED"].includes(dependent.state), `${row.id}/${dependent.id}`);
  }
  assert.throws(() => commercialEvidenceRegister({ contracts: [{ ...INTEGRATION_CONTRACTS[0], claimIds: ["ABSENT_CLAIM"] }] }), /does not record/);
});

test("one export carries every claim, state, citation and named differentiator", () => {
  const register = commercialEvidenceRegister();
  assert.equal(register.claims.length, CLAIM_EVIDENCE.length);
  assert.deepEqual(register.claims.map(row => row.id), CLAIM_EVIDENCE.map(row => row.id));
  for (const row of register.claims) {
    assert.ok(row.requirements.length >= 1, row.id);
    assert.ok(["BUILT", "PARTIAL", "EXTERNAL_GATE_OPEN", "NOT_STARTED"].includes(row.state), row.id);
    assert.ok(renderClaimState(row).length > 10, row.id);
  }
  assert.ok(register.counts.BUILT >= 1 && register.counts.PARTIAL >= 1);
  // Every differentiator is mapped to requirement identifiers and reads no stronger than its weakest claim.
  assert.equal(register.differentiators.length, NAMED_DIFFERENTIATORS.length);
  for (const row of register.differentiators) {
    assert.ok(row.requirements.length >= 1, row.id);
    assert.ok(row.claims.length >= 1, row.id);
    const weakest = row.claims.reduce((lowest, item) => (CLAIM_STATE_RANK[item.state] < CLAIM_STATE_RANK[lowest] ? item.state : lowest), row.claims[0].state);
    assert.equal(row.state, weakest, row.id);
    assert.deepEqual(scanBannedTerms(`${row.differentiator} ${row.gap}`), []);
  }
  assert.equal(register.differentiators.find(row => row.id === "APP_LEVEL_EXAM_ROOM")!.state, "NOT_STARTED");
  assert.equal(register.differentiators.find(row => row.id === "CITED_CAPABILITY_CLAIMS")!.state, "BUILT");
  // Recorded verification results carry the check name, the command, the date and observed counts.
  assert.ok(register.verifications.length >= 4);
  for (const row of register.verifications) {
    assert.match(row.command, /^npm run /);
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Object.keys(row.counts).length >= 1, row.check);
  }
  // There is no field in which a testimonial, named school, competitor comparison or market figure could be recorded.
  assert.deepEqual(register.excludedMaterialClasses.map(row => row.class), ["TESTIMONIAL", "NAMED_SCHOOL_REFERENCE", "COMPETITOR_COMPARISON", "MARKET_SHARE_FIGURE"]);
  assert.equal(claimEvidenceSchema.safeParse({ ...claim(), testimonial: "A named school said so." }).success, false);
});
