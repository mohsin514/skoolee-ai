import assert from "node:assert/strict";
import test from "node:test";
import { EXPANSION_CANDIDATES, SCIENCE_CALIBRATION, evaluateExpansion, expansionAvailability, type ExpansionRecord } from "../../src/lib/school-ai/pack-expansion-gate";

// Synthetic records only. They prove the gate logic; they do not claim any pack is verified.
const signoff = { role: "Physics educator E-01", reference: "REVIEW-LINK", on: "2026-11-01" };
const physics = (): ExpansionRecord => ({
  candidateId: "AE-CAIE-0625-PHYSICS",
  source: { board: "Cambridge International", qualification: "IGCSE 0625", subject: "Physics", grade: "Year 10", edition: "2026-2028 syllabus", examYear: "2027", academicYear: "2026-27", term: "Full year", tier: "Extended", language: "en", officialUrl: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-physics-0625/", retrievedOn: "2026-10-29", rightsStatus: "SCHOOL_APPROVED", verification: "VERIFIED" },
  schoolSelection: { academicOwner: "Head of Science H-01", reference: "SELECTION-LINK", on: "2026-11-01" },
  calibration: SCIENCE_CALIBRATION.map((area) => ({ area, signoff })),
  educatorSignoff: signoff, disabledQuestionTypes: ["PRACTICAL_PAPER"],
  decision: { outcome: "ADOPT", founder: { ...signoff, role: "Founder" }, educator: signoff, rationale: "Synthetic fixture adopting a calibrated physics pack.", boundedTicket: "SKAI-9999" },
  pilotReadinessPassed: true,
});
const math = new Set(["AE-CAIE-0580-MATH"]);
const blockers = (r: ExpansionRecord, m = math) => { const res = evaluateExpansion(r, m); return res.available ? [] : res.blockers; };

test("nothing is available by default", () => {
  assert.ok(expansionAvailability([]).every((c) => !c.available));
  for (const c of EXPANSION_CANDIDATES) assert.equal(evaluateExpansion({ candidateId: c.id }).available, false);
});

test("a fully gated synthetic science record is available", () => assert.deepEqual(evaluateExpansion(physics(), math), { available: true }));

test("science waits for its verified mathematics pack and go decision", () => assert.ok(blockers(physics(), new Set()).some((b) => /0580/.test(b))));

test("each missing science calibration area blocks", () => {
  for (const area of SCIENCE_CALIBRATION) { const r = physics(); r.calibration = r.calibration!.filter((c) => c.area !== area); assert.ok(blockers(r).some((b) => b.includes(area)), area); }
  const r = physics(); delete r.disabledQuestionTypes; assert.ok(blockers(r).length > 0);
});

test("0625 cannot inherit 0580 and wrong subject/edition identity is refused", () => {
  assert.ok(blockers({ ...physics(), source: { ...physics().source, inheritsFrom: "AE-CAIE-0580-MATH" } }).length > 0);
  assert.ok(blockers({ ...physics(), source: { ...physics().source, qualification: "IGCSE 0580" } }).length > 0);
  assert.ok(blockers({ ...physics(), source: { ...physics().source, subject: "Chemistry" } }).length > 0);
  assert.ok(blockers({ ...physics(), source: { ...physics().source, verification: "UNVERIFIED" } }).length > 0);
});

test("rights, school selection, educator sign-off, bounded ticket and pilot readiness are each required", () => {
  for (const rights of ["UNKNOWN", "REQUESTED", "DENIED"] as const) assert.ok(blockers({ ...physics(), source: { ...physics().source, rightsStatus: rights } }).length > 0);
  for (const k of ["schoolSelection", "educatorSignoff", "decision"] as const) { const r = physics(); delete r[k]; assert.ok(blockers(r).length > 0, k); }
  assert.ok(blockers({ ...physics(), decision: { ...physics().decision!, boundedTicket: undefined } }).length > 0);
  assert.ok(blockers({ ...physics(), pilotReadinessPassed: false }).length > 0);
  for (const outcome of ["PENDING", "DEFER", "REJECT"] as const) assert.ok(blockers({ ...physics(), decision: { ...physics().decision!, outcome } }).length > 0);
});

const laterGrade = (id: string, board: string, qualification: string, grade: string): ExpansionRecord => ({ ...physics(), candidateId: id, calibration: [], source: { ...physics().source, board, qualification, subject: "Mathematics", grade } });

test("BSEK SSC and BIEK HSC are distinct, and other Punjab boards cannot borrow Lahore", () => {
  assert.deepEqual(evaluateExpansion(laterGrade("PK-BSEK-SSC-MATH", "BSEK", "SSC", "9")), { available: true });
  assert.equal(evaluateExpansion(laterGrade("PK-BSEK-SSC-MATH", "BIEK", "HSC", "9")).available, false);
  assert.equal(evaluateExpansion(laterGrade("PK-BISELHR-G10-MATH", "BISE Rawalpindi", "SSC Part II", "10")).available, false);
  assert.equal(evaluateExpansion(laterGrade("PK-BISELHR-G10-MATH", "BISE Lahore", "SSC Part II", "9")).available, false);
  assert.equal(evaluateExpansion({ ...laterGrade("PK-BISE-MULTAN-MATH", "BISE Multan", "SSC", "9") }).available, false);
});

test("KSA reuse needs an exact Cambridge match; US/IB equivalence is never inferred", () => {
  const ksa = { ...physics(), candidateId: "SA-MOE-SCIENCE-SCHOOL-SELECTED", source: { ...physics().source, board: "MoE national curriculum", qualification: "Intermediate", subject: "Science", language: "ar" as const } };
  const ok = { approvedPackId: "AE-CAIE-0625-PHYSICS", qualificationMatches: true, tierMatches: true, examYearMatches: true, schoolGradeMapping: "MAPPING-LINK" };
  assert.ok(blockers({ ...ksa, reuseOf: { ...ok, examYearMatches: false } }, new Set(["SA-MOE-INTERMEDIATE-MATH"])).length > 0);
  assert.ok(blockers({ ...ksa, reuseOf: { ...ok, approvedPackId: "AE-IB-MYP-MATH" } }, new Set(["SA-MOE-INTERMEDIATE-MATH"])).length > 0);
  assert.ok(blockers({ ...physics(), reuseOf: ok }).some((b) => /KSA/.test(b)));
});
