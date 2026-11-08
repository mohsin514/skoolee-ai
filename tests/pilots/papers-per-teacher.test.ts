import { test } from "node:test";
import assert from "node:assert/strict";
import { papersPerTeacher, papersWindow } from "../../src/lib/pilots/papers-per-teacher";
import { evaluateGoNoGo } from "../../src/lib/pilots/go-no-go";
import { GO_NO_GO_CRITERIA } from "../../src/lib/pilots/go-no-go-config";

// SKAI-1174 "teachers generating ≥ 2 papers in 4 weeks": real PAPER records per active teacher.
const at = (d: string) => new Date(`${d}T09:00:00Z`);
const window = papersWindow(at("2026-09-01"), at("2026-12-01"));
const paper = (createdById: string, d = "2026-09-10") => ({ createdById, createdAt: at(d) });

test("the window is the first four weeks of the pilot, cut at now", () => {
  assert.equal(GO_NO_GO_CRITERIA.TEACHER_USAGE.minPapers, 2);
  assert.equal(window.end.toISOString(), at("2026-09-29").toISOString());
  assert.equal(papersWindow(at("2026-09-01"), at("2026-09-08")).end.toISOString(), at("2026-09-08").toISOString());
});

test("counts teachers with at least two papers over all active teachers", () => {
  const r = papersPerTeacher(["a", "b", "c", "d"], [paper("a"), paper("a"), paper("b"), paper("b"), paper("b"), paper("c")], window);
  assert.deepEqual(r, { value: 50, withheld: null, teachers: 4, qualifying: 2, papers: 6 });
});

test("papers outside the window or by non-teachers do not count", () => {
  const r = papersPerTeacher(["a", "b"], [paper("a", "2026-08-31"), paper("a", "2026-09-29"), paper("a"), paper("x"), paper("x")], window);
  assert.deepEqual([r.value, r.qualifying, r.papers], [0, 0, 1]);
});

test("withheld, never zero, before the pilot starts or with no teachers", () => {
  const before = papersPerTeacher(["a"], [], papersWindow(at("2026-09-01"), at("2026-08-20")));
  assert.equal(before.value, null);
  assert.match(before.withheld ?? "", /not started/);
  const none = papersPerTeacher([], [paper("a"), paper("a")], window);
  assert.equal(none.value, null);
  assert.match(none.withheld ?? "", /No active teachers/);
});

test("feeds the TEACHER_USAGE criterion against the SKAI-1005 thresholds", () => {
  const base = { gate: { allowed: true } as const, decision: "GO", commercialStage: "CONSENTED_PILOT", paperAcceptance: { value: 70, withheld: null }, taskTimeChange: { value: -30, withheld: null } };
  const crit = (teacherUsage: { value: number | null; withheld: string | null }) => evaluateGoNoGo({ ...base, teacherUsage }).criteria.find((c) => c.key === "TEACHER_USAGE")!;
  const ids = ["a", "b", "c", "d", "e"];
  assert.equal(crit(papersPerTeacher(ids, ids.slice(0, 3).flatMap((id) => [paper(id), paper(id)]), window)).state, "GREEN");
  assert.equal(crit(papersPerTeacher(ids, [paper("a"), paper("a")], window)).state, "AMBER");
  const red = crit(papersPerTeacher(ids, [paper("a")], window));
  assert.equal(red.state, "RED");
  assert.equal(red.metric, "Teachers with ≥ 2 papers in 4 weeks");
});
