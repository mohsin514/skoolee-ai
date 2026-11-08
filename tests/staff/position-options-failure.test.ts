import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fields = readFileSync("src/components/staff/position-fields.tsx", "utf8");
const form = readFileSync("src/components/staff/add-staff-form.tsx", "utf8");

test("a failed hierarchy lookup is recorded as failed, not swallowed into an empty ready state", () => {
  assert.match(fields, /if \(!res\.ok\) throw new Error/);
  assert.match(fields, /catch \{\s*if \(!cancelled\) setFailed\(true\);/);
  assert.match(fields, /retry: \(\) => setAttempt/);
});

test("the 'No ranks set up yet' hint only shows for a genuinely empty, loaded campus", () => {
  assert.match(fields, /designations\.length === 0 && ready && !failed \?/);
  assert.match(fields, /\{failed \? \([\s\S]*onClick=\{retry\}/);
});

test("the wizard will not send the invitation while position options failed or are loading", () => {
  const submit = form.slice(form.indexOf("const handleSubmit"));
  assert.ok(submit.indexOf("positionOptions.failed || !positionOptions.ready") < submit.indexOf("inviteStaff("));
});
