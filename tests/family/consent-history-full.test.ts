import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONSENT_HISTORY_LIMIT } from "@/lib/family/guardian-consent";

// SKAI-1569: a guardian sees every consent answer on record, not only the newest ten.
test("the history is no longer cut at ten", () => {
  const src = readFileSync("src/lib/family/guardian-consent.ts", "utf8");
  const body = src.slice(src.indexOf("export async function guardianConsentView"));
  assert.doesNotMatch(body.slice(0, 400), /take: 10\b/);
  assert.match(body, /take: CONSENT_HISTORY_LIMIT/);
  assert.ok(CONSENT_HISTORY_LIMIT >= 500);
});
