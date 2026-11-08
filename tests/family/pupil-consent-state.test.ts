import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pupilConsentState } from "@/lib/family/guardian-consent";

// SKAI-1573: an outdated answer stays distinct from no answer in the campus view.
test("pupil state keeps OUTDATED apart from MISSING", () => {
  assert.equal(pupilConsentState(["OUTDATED"]), "OUTDATED");
  assert.equal(pupilConsentState(["OUTDATED", "MISSING"]), "OUTDATED");
  assert.equal(pupilConsentState(["MISSING"]), "MISSING");
  assert.equal(pupilConsentState([]), "MISSING");
  assert.equal(pupilConsentState(["CURRENT", "OUTDATED"]), "PARTIAL");
  assert.equal(pupilConsentState(["CURRENT", "CURRENT"]), "CURRENT");
});

test("status panel counts and filters outdated pupils", () => {
  const src = readFileSync("src/components/family/guardian-consent.tsx", "utf8");
  assert.match(src, /\["CURRENT", "PARTIAL", "OUTDATED", "MISSING"\] as State\[\]/);
});
