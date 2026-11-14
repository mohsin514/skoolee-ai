/**
 * SKAI-1941 — on a plan without group policy, `/api/group-policy?view=library` answers 403 PLAN_FEATURE. The
 * Approvals › Policy and Standards › Group policy tabs must say it is a plan limit (no Retry), and keep the
 * generic retryable error for every other failure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { arabicP4Ui, urduP4Ui } from "../../src/lib/locale/role-ux/p4-messages";
import { arabicP1Ui, urduP1Ui } from "../../src/lib/locale/role-ux/p1-messages";

const source = readFileSync(join(process.cwd(), "src", "components", "group-policy", "group-policy.tsx"), "utf8");

test("a PLAN_FEATURE error is a plan limit; anything else stays a retryable failure", async () => {
  const { loadFailureKind } = await import("../../src/components/group-policy/load-failure");
  assert.equal(loadFailureKind(Object.assign(new Error("x"), { code: "PLAN_FEATURE" })), "plan");
  assert.equal(loadFailureKind(Object.assign(new Error("x"), { code: "FORBIDDEN" })), "error");
  assert.equal(loadFailureKind(new Error("network")), "error");
  assert.equal(loadFailureKind(null), "error");
});

test("the loader keeps the API error code and both focused tabs render the plan notice before the retry state", () => {
  assert.match(source, /code: readApiErrorCode\(json\)/);
  assert.match(source, /if \(failure === "plan"\) return planNotice;\s*if \(denied\) return <ErrorState description=\{ui\("Group policy reviews could not be loaded\."\)\}/);
  assert.match(source, /focus === "library" \? failure === "plan" \? planNotice : <ErrorState/);
});

test("the plan notice copy is translated in Arabic and Urdu", () => {
  for (const key of ["Group policy is not part of your school's plan"]) { assert.ok(arabicP4Ui[key], key); assert.ok(urduP4Ui[key], key); }
  const reason = "This feature is not part of the school's plan. The account owner can add it.";
  assert.ok(arabicP1Ui[reason]); assert.ok(urduP1Ui[reason]);
});
