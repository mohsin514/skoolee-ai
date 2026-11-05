import { test } from "node:test";
import assert from "node:assert/strict";
import { opensWelcomeAutomatically } from "../../src/lib/onboarding/launch-plan";

// SKAI-1690: the automatic welcome must not cover the required teacher onboarding form.
test("the welcome does not auto-open over the required teacher onboarding form", () => {
  assert.equal(opensWelcomeAutomatically("/teacher-onboarding"), false);
});

test("other launch entries still auto-open the welcome; non-entries never do", () => {
  for (const path of ["/teacher", "/admin", "/onboarding", "/student", "/ai"]) assert.equal(opensWelcomeAutomatically(path), true, path);
  for (const path of ["/login", "/ai/studio", "/teacher/attendance"]) assert.equal(opensWelcomeAutomatically(path), false, path);
});
