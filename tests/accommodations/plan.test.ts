import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveSettings, needsReview, planCovers, sensitiveInstructionIssue, type PlanRow } from "../../src/lib/accommodations/plan";

// SKO-410 pure rules: deterministic effective settings, coverage window, review and sensitive text.
const plan = (extra: Partial<PlanRow> = {}): PlanRow => ({ id: "p1", version: 2, status: "ACTIVE", validFrom: new Date("2026-09-01Z"), validUntil: new Date("2026-12-31Z"), assessmentTypes: ["EXAM"], extraMinutes: 0, extraPercent: 0, breakMinutes: 0, capabilities: { largeText: true }, instructions: "Seat near the front; read questions aloud on request.", ...extra });
const at = new Date("2026-10-20T09:00:00Z");

test("15 extra minutes on a 45-minute exam gives 60, and the calculation is shown step by step", () => {
  const effective = effectiveSettings({ baseMinutes: 45, type: "EXAM", at, plan: plan({ extraMinutes: 15 }) });
  assert.equal(effective.totalMinutes, 60);
  assert.equal(effective.source, "PLAN");
  assert.equal(effective.planVersion, 2);
  assert.deepEqual(effective.steps, [{ key: "base", minutes: 45 }, { key: "fixed", minutes: 15 }, { key: "total", minutes: 60 }]);
  assert.equal(effective.capabilities.largeText, true);
  assert.equal(effective.capabilities.reader, false, "unset capabilities default to off");
});

test("percent time rounds up, breaks add on, and the result does not depend on the device clock", () => {
  const effective = effectiveSettings({ baseMinutes: 50, type: "EXAM", at, plan: plan({ extraMinutes: 5, extraPercent: 25, breakMinutes: 10 }) });
  assert.deepEqual(effective.steps.map(step => [step.key, step.minutes]), [["base", 50], ["fixed", 5], ["percent", 13], ["break", 10], ["total", 78]]);
  assert.deepEqual(effectiveSettings({ baseMinutes: 50, type: "EXAM", at, plan: plan({ extraMinutes: 5, extraPercent: 25, breakMinutes: 10 }) }), effective, "same inputs, same result");
});

test("an exam-specific approval wins; out-of-window, other-type or ended plans give no adjustment", () => {
  assert.equal(effectiveSettings({ baseMinutes: 45, type: "EXAM", at, plan: plan({ extraMinutes: 15 }), examApproval: { extraMinutes: 20, breakMinutes: 5 } }).totalMinutes, 70);
  assert.equal(effectiveSettings({ baseMinutes: 45, type: "ASSIGNMENT", at, plan: plan({ extraMinutes: 15 }) }).source, "NONE");
  assert.equal(effectiveSettings({ baseMinutes: 45, type: "EXAM", at: new Date("2027-01-01T09:00:00Z"), plan: plan({ extraMinutes: 15 }) }).totalMinutes, 45);
  assert.equal(planCovers(plan({ status: "REVOKED" }), "EXAM", at), false);
  assert.equal(planCovers(plan(), "EXAM", new Date("2026-12-31T23:59:00Z")), true, "the last valid day is included");
});

test("plans close to expiry need review; diagnosis in operational notes is flagged", () => {
  assert.equal(needsReview(plan({ validUntil: new Date("2026-10-25Z") }), at), true);
  assert.equal(needsReview(plan(), at), false);
  assert.equal(needsReview(plan({ status: "SUPERSEDED", validUntil: new Date("2026-10-25Z") }), at), false);
  assert.match(sensitiveInstructionIssue("Learner has a dyslexia diagnosis")!, /supporting record/);
  assert.equal(sensitiveInstructionIssue("Provide a reader and a quiet room."), null);
});
