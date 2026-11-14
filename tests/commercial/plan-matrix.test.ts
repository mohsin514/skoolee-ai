import assert from "node:assert/strict";
import test from "node:test";
import { PLANS, PLAN_ORDER } from "@/config/plans";
import { PLAN_MATRIX_GROUPS } from "@/config/plan-matrix";

test("every pricing matrix row reads a real plan flag, once", () => {
  const rows = PLAN_MATRIX_GROUPS.flatMap((group) => group.features);
  assert.equal(new Set(rows).size, rows.length, "a capability appears in one group only");
  for (const feature of rows) {
    for (const key of PLAN_ORDER) {
      assert.equal(typeof PLANS[key][feature], "boolean", `${key}.${feature} is a boolean flag`);
    }
  }
});

test("matrix cells match the enforced flags for each plan", () => {
  const enabled = (key: keyof typeof PLANS) => PLAN_MATRIX_GROUPS.flatMap((group) => group.features).filter((feature) => PLANS[key][feature]);
  assert.deepEqual(enabled("FREE"), []);
  assert.ok(enabled("BASIC").includes("whatsappEnabled"));
  assert.ok(!enabled("BASIC").includes("aiWorkflowsEnabled"));
  assert.ok(!enabled("PRO").includes("groupConsoleEnabled"));
  assert.ok(enabled("ENTERPRISE").includes("apiAccessEnabled"));
});
