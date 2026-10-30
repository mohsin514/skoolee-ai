import assert from "node:assert/strict";
import test from "node:test";
import { currentCycle, cycleYearProblems, isModelCurrent, isSameDraft, orderCycles } from "../../src/lib/academic/cycle-rules";
import { DEFAULT_ACADEMIC_MODEL, validateAcademicModel, type AcademicModelConfiguration } from "../../src/lib/academic/model-config";

const d = (day: string) => new Date(`${day}T00:00:00.000Z`);
const term = (id: string, startDate: string, endDate: string) => ({ id, label: id, startDate, endDate, teachingWeeks: 16, reportingPeriod: true });
const year = { label: "QA 2026-27", startDate: d("2026-08-01"), endDate: d("2027-06-30") };

test("SKAI-117 order: dated terms sort by start, undated ones keep their place after them", () => {
  const ordered = orderCycles([term("T2", "2027-01-04", "2027-06-30"), term("New", "", ""), term("T1", "2026-08-01", "2026-12-20")]);
  assert.deepEqual(ordered.map((cycle) => cycle.id), ["T1", "T2", "New"]);
});

test("SKAI-117 year bound: terms must sit inside a dated academic year", () => {
  assert.deepEqual(cycleYearProblems([term("T1", "2026-08-01", "2026-12-20"), term("T2", "2027-01-04", "2027-06-30")], year), []);
  const outside = cycleYearProblems([term("T1", "2026-07-15", "2026-12-20"), term("T2", "2027-01-04", "2027-07-10")], year);
  assert.deepEqual(outside.map((problem) => problem.code), ["period_outside_year", "period_outside_year"]);
  assert.equal(outside[0].template, "{0} falls outside {1} ({2} to {3}).");
  assert.deepEqual(outside[0].params, ["T1", "QA 2026-27", "2026-08-01", "2027-06-30"]);
  assert.equal(cycleYearProblems([], null)[0].code, "year_missing");
  assert.equal(cycleYearProblems([], { label: "Undated", startDate: null, endDate: null })[0].code, "year_undated");
});

test("SKAI-117 active cycle: the term containing today, else the next one, boundary days inclusive", () => {
  const terms = [term("T1", "2026-08-01", "2026-12-20"), term("T2", "2027-01-04", "2027-06-30")];
  assert.deepEqual(currentCycle(terms, "2026-08-01"), { cycle: terms[0], state: "current" });
  assert.deepEqual(currentCycle(terms, "2026-12-20"), { cycle: terms[0], state: "current" });
  assert.deepEqual(currentCycle(terms, "2026-12-25"), { cycle: terms[1], state: "next" });
  assert.equal(currentCycle(terms, "2027-07-01"), null);
  assert.equal(currentCycle([term("New", "", "")], "2026-09-01"), null);
});

test("SKAI-117 overlap and ordering stay enforced by the shared model validation, with catalog templates", () => {
  const config: AcademicModelConfiguration = { ...DEFAULT_ACADEMIC_MODEL, classIds: ["c1"], terms: [term("T1", "2026-08-01", "2027-01-10"), term("T2", "2027-01-04", "2027-06-30")] };
  const problems = validateAcademicModel(config, { effectiveFrom: "2026-08-01", effectiveTo: "2027-06-30", selectedClassIds: ["c1"], actualSubjects: [] });
  const conflict = problems.find((problem) => problem.code === "period_conflict");
  assert.ok(conflict);
  assert.equal(conflict.template, "{0} overlaps {1}. Change one period's dates before activation.");
  assert.deepEqual(conflict.params, ["T2", "T1"]);
});

test("SKAI-117 stale guard: a different saved updatedAt is stale; omitting it stays compatible", () => {
  const saved = d("2026-10-30");
  assert.equal(isModelCurrent(undefined, saved), true);
  assert.equal(isModelCurrent(saved.toISOString(), saved), true);
  assert.equal(isModelCurrent("2026-10-29T00:00:00.000Z", saved), false);
  assert.equal(isModelCurrent(42, saved), false);
});

test("SKAI-117 duplicate save: the same draft (any key order) is reused, a change or an active version is not", () => {
  const saved = { status: "DRAFT", title: "Grade 5 · 2026", effectiveFrom: d("2026-08-01"), effectiveTo: d("2027-06-30"), configuration: { terms: [{ label: "T1", id: "a" }], classIds: ["c1"] } };
  const next = { title: "Grade 5 · 2026", effectiveFrom: d("2026-08-01"), effectiveTo: d("2027-06-30"), configuration: { classIds: ["c1"], terms: [{ id: "a", label: "T1" }] } };
  assert.equal(isSameDraft(saved, next), true);
  assert.equal(isSameDraft({ ...saved, status: "ACTIVE" }, next), false);
  assert.equal(isSameDraft(saved, { ...next, effectiveTo: null }), false);
  assert.equal(isSameDraft(saved, { ...next, configuration: { classIds: ["c1"], terms: [{ id: "a", label: "T2" }] } }), false);
});
