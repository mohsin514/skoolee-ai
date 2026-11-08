import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateGoNoGo, numericState, type GoNoGoInputs } from "../../src/lib/pilots/go-no-go";
import { GO_NO_GO_CRITERIA, VERDICT_RULE } from "../../src/lib/pilots/go-no-go-config";

// SKAI-1102 verdict logic: thresholds from the config module, unknown is amber, red vetoes, GO is fail-closed.
const passing = (over: Partial<GoNoGoInputs> = {}): GoNoGoInputs => ({
  gate: { allowed: true }, decision: "GO", commercialStage: "CONSENTED_PILOT",
  teacherUsage: { value: 55, withheld: null }, paperAcceptance: { value: 70, withheld: null }, taskTimeChange: { value: -30, withheld: null },
  ...over,
});
const state = (r: ReturnType<typeof evaluateGoNoGo>, key: string) => r.criteria.find((c) => c.key === key)!.state;

test("numeric thresholds honour direction and boundaries", () => {
  const usage = GO_NO_GO_CRITERIA.TEACHER_USAGE.threshold, time = GO_NO_GO_CRITERIA.TASK_TIME_CHANGE.threshold;
  assert.equal(numericState(usage.green, usage), "GREEN");
  assert.equal(numericState(usage.green - 0.1, usage), "AMBER");
  assert.equal(numericState(usage.red, usage), "AMBER");
  assert.equal(numericState(usage.red - 0.1, usage), "RED");
  assert.equal(numericState(time.green, time), "GREEN");
  assert.equal(numericState(time.red, time), "AMBER");
  assert.equal(numericState(time.red + 1, time), "RED");
  assert.equal(numericState(null, usage), "AMBER");
  assert.equal(numericState(Number.NaN, usage), "AMBER");
});

test("all green criteria give GO", () => {
  const r = evaluateGoNoGo(passing());
  assert.equal(r.verdict, "GO");
  assert.ok(r.criteria.every((c) => c.state === "GREEN"));
  assert.deepEqual(r.reasons, []);
});

test("a red veto criterion gives NO_GO even when everything else passes", () => {
  for (const over of [{ decision: "STOP" }, { commercialStage: "DECLINED_PAYMENT" }, { teacherUsage: { value: 10, withheld: null } }, { paperAcceptance: { value: 20, withheld: null } }, { taskTimeChange: { value: 15, withheld: null } }] as Partial<GoNoGoInputs>[]) {
    const r = evaluateGoNoGo(passing(over));
    assert.equal(r.verdict, "NO_GO", JSON.stringify(over));
    assert.match(r.reasons[0], /^Red on /);
  }
});

test("GO is fail-closed on the readiness gate and the signed decision", () => {
  const blocked = evaluateGoNoGo(passing({ gate: { allowed: false, blockers: [{ item: "AI05_STATUS", reason: "Missing" }] } }));
  assert.equal(blocked.verdict, "HOLD");
  assert.equal(state(blocked, "READINESS_GATE"), "AMBER");
  assert.match(blocked.criteria[0].note ?? "", /AI05_STATUS/);
  assert.equal(evaluateGoNoGo(passing({ gate: null })).verdict, "HOLD");
  for (const decision of ["NARROW", "DEFER", null]) assert.equal(evaluateGoNoGo(passing({ decision })).verdict, "HOLD");
});

test("unknown or withheld metrics are amber, never green, and hold the pilot below the green minimum", () => {
  const withheld = { value: null, withheld: "Too few paired observations for a percentage (2 of 5 needed)." };
  const r = evaluateGoNoGo(passing({ teacherUsage: withheld, paperAcceptance: withheld, taskTimeChange: withheld }));
  assert.equal(state(r, "TEACHER_USAGE"), "AMBER");
  assert.equal(r.criteria.find((c) => c.key === "TASK_TIME_CHANGE")!.note, withheld.withheld);
  assert.equal(r.verdict, "HOLD");
  assert.ok(r.reasons.some((x) => x.includes(`of ${VERDICT_RULE.minGreen}`)));
});

test("the green minimum allows amber on non-required criteria", () => {
  const r = evaluateGoNoGo(passing({ commercialStage: "DEMO_INTEREST", taskTimeChange: { value: -5, withheld: null } }));
  assert.equal(r.criteria.filter((c) => c.state === "GREEN").length, 4);
  assert.equal(r.verdict, "GO");
});

test("an empty pilot is HOLD with no red", () => {
  const none = { value: null, withheld: null };
  const r = evaluateGoNoGo({ gate: null, decision: null, commercialStage: null, teacherUsage: none, paperAcceptance: none, taskTimeChange: none });
  assert.equal(r.verdict, "HOLD");
  assert.ok(r.criteria.every((c) => c.state === "AMBER"));
});
