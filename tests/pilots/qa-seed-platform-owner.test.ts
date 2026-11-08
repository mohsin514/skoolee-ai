// SKAI-1788: the QA seed creates a synthetic platform owner (APP_OWNER).
import test from "node:test";
import assert from "node:assert/strict";
import { PLATFORM_OWNER, SCHOOLS, mergeCredentials } from "../../scripts/qa/pilot-seed-plan";

test("the platform owner is a synthetic APP_OWNER hosted by a seeded QA school", () => {
  assert.equal(PLATFORM_OWNER.role, "APP_OWNER");
  assert.match(PLATFORM_OWNER.email, /@[a-z-]+\.qa\.local$/);
  assert.ok(SCHOOLS.some((s) => s.slug === PLATFORM_OWNER.hostSchool));
  assert.equal(PLATFORM_OWNER.key, "platform-owner");
});

test("merging replaces the same account and keeps every other lane credential", () => {
  const existing = [
    { school: "qa-alpha", role: "admin", email: "admin@qa-alpha.qa.local", password: "keep" },
    { school: "platform", role: "platform-owner", email: PLATFORM_OWNER.email, password: "old" },
  ];
  const merged = mergeCredentials(existing, [{ school: "platform", role: "platform-owner", email: PLATFORM_OWNER.email, password: "new" }]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((a) => a.role === "admin")?.password, "keep");
  assert.equal(merged.find((a) => a.role === "platform-owner")?.password, "new");
  assert.equal(mergeCredentials([], merged).length, 2);
});
