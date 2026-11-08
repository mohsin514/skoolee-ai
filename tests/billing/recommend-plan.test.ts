import { test } from "node:test";
import assert from "node:assert/strict";
import { fits, recommendPlan, shortfalls, usage } from "../../src/lib/billing/recommend-plan";

// Shapes mirror the approved catalogue: FREE (1 campus/50), BASIC (1/500), PRO (5/2,500), ENTERPRISE (custom, unlimited).
const plans = [
  { type: "FREE", price: 0, maxCampuses: 1, maxStudents: 50 },
  { type: "BASIC", price: 4000, maxCampuses: 1, maxStudents: 500 },
  { type: "PRO", price: 7000, maxCampuses: 5, maxStudents: 2500 },
  { type: "ENTERPRISE", price: null, maxCampuses: -1, maxStudents: -1 },
];

test("recommends the cheapest package that covers both campuses and students", () => {
  assert.equal(recommendPlan(plans, { campuses: 1, students: 40 })?.type, "FREE");
  assert.equal(recommendPlan(plans, { campuses: 1, students: 51 })?.type, "BASIC");
  assert.equal(recommendPlan(plans, { campuses: 2, students: 100 })?.type, "PRO");
  assert.equal(recommendPlan(plans, { campuses: 5, students: 2500 })?.type, "PRO");
});

test("falls back to the custom package when no priced package fits", () => {
  assert.equal(recommendPlan(plans, { campuses: 6, students: 100 })?.type, "ENTERPRISE");
  assert.equal(recommendPlan(plans, { campuses: 1, students: 9000 })?.type, "ENTERPRISE");
});

test("returns null when nothing fits and there is no custom package", () => {
  assert.equal(recommendPlan(plans.slice(0, 2), { campuses: 3, students: 10 }), null);
  assert.equal(recommendPlan([], { campuses: 1, students: 1 }), null);
});

test("usage and shortfalls treat -1 as unlimited", () => {
  assert.equal(usage(3, 5), 0.6);
  assert.equal(usage(9, 5), 1);
  assert.equal(usage(3, -1), null);
  assert.deepEqual(shortfalls(plans[1], { campuses: 2, students: 600 }), ["campuses", "students"]);
  assert.equal(fits(plans[3], { campuses: 999, students: 1e6 }), true);
});

test("an unanswered student count lets campuses alone decide", () => {
  assert.equal(recommendPlan(plans, { campuses: 1, students: null })?.type, "FREE");
  assert.equal(recommendPlan(plans, { campuses: 3, students: null })?.type, "PRO");
  assert.deepEqual(shortfalls(plans[0], { campuses: 1, students: null }), []);
});

// The judged spec's worked examples (catalogue order: FREE "Basic", BASIC "Pro", PRO "Enterprise", ENTERPRISE "Custom").
import { explainRecommendation } from "../../src/lib/billing/recommend-plan";
const explain = (campuses: number, students: number | null, current = "FREE") => explainRecommendation(plans, { campuses, students }, current);

test("explains each worked example", () => {
  const a = explain(1, null); assert.equal(a?.plan.type, "FREE"); assert.equal(a?.kind, "campusesOnly");
  const b = explain(1, 30); assert.equal(b?.plan.type, "FREE"); assert.equal(b?.kind, "current");
  const c = explain(1, 45); assert.equal(c?.plan.type, "FREE"); assert.equal(c?.kind, "tight"); assert.equal(c?.roomToGrow?.type, "BASIC");
  const d = explain(1, 420); assert.equal(d?.plan.type, "BASIC"); assert.equal(d?.kind, "roomy"); assert.deepEqual(d?.whyNot && { plan: d.whyNot.plan.type, limit: d.whyNot.limit, value: d.whyNot.value }, { plan: "FREE", limit: "students", value: 50 });
  const e = explain(1, 600); assert.equal(e?.plan.type, "PRO"); assert.equal(e?.whyNot?.plan.type, "BASIC"); assert.equal(e?.whyNot?.limit, "students");
  const f = explain(3, 420); assert.equal(f?.plan.type, "PRO"); assert.equal(f?.kind, "roomy"); assert.equal(f?.whyNot?.limit, "campuses"); assert.equal(f?.whyNot?.value, 1);
  const g = explain(8, null); assert.equal(g?.plan.type, "ENTERPRISE"); assert.equal(g?.kind, "beyond"); assert.equal(g?.whyNot?.plan.type, "PRO"); assert.equal(g?.whyNot?.value, 5);
  const h = explain(1, 30, "PRO"); assert.equal(h?.plan.type, "PRO"); assert.equal(h?.kind, "current"); assert.equal(h?.whyNot, null);
});

test("returns null for an empty catalogue", () => {
  assert.equal(explainRecommendation([], { campuses: 1, students: 1 }, "FREE"), null);
});
