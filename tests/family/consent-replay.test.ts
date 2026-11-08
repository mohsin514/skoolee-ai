import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONSENT_NOTICE_VERSION, isConsentReplay } from "@/lib/family/guardian-consent";

// SKAI-1548: one submission creates one consent row, receipt and audit event.
const now = new Date("2026-11-01T10:00:30.000Z");
const choices = { photos: true, messaging: false };
const prior = { choices, noticeVersion: CONSENT_NOTICE_VERSION, language: "en", createdAt: new Date("2026-11-01T10:00:00.000Z") };

test("an identical answer seconds later is the same submission", () => {
  assert.equal(isConsentReplay(prior, { choices: { ...choices }, language: "en" }, CONSENT_NOTICE_VERSION, now), true);
});

test("a changed answer, language, notice or an old answer is a new record", () => {
  assert.equal(isConsentReplay(prior, { choices: { ...choices, photos: false }, language: "en" }, CONSENT_NOTICE_VERSION, now), false);
  assert.equal(isConsentReplay(prior, { choices, language: "ar" }, CONSENT_NOTICE_VERSION, now), false);
  assert.equal(isConsentReplay({ ...prior, noticeVersion: "old" }, { choices, language: "en" }, CONSENT_NOTICE_VERSION, now), false);
  assert.equal(isConsentReplay(prior, { choices, language: "en" }, CONSENT_NOTICE_VERSION, new Date("2026-11-01T10:05:00.000Z")), false);
  assert.equal(isConsentReplay(null, { choices, language: "en" }, CONSENT_NOTICE_VERSION, now), false);
});

test("the write is serialised and checks for a replay before inserting", () => {
  const src = readFileSync("src/lib/family/guardian-consent.ts", "utf8");
  const body = src.slice(src.indexOf("export async function recordGuardianConsent"));
  const lock = body.indexOf("pg_advisory_xact_lock"), check = body.indexOf("isConsentReplay("), create = body.indexOf("tx.guardianConsent.create");
  assert.ok(lock > 0 && lock < check && check < create);
});

test("the form has a synchronous in-flight guard", () => {
  const ui = readFileSync("src/components/family/guardian-consent.tsx", "utf8");
  assert.match(ui, /if \(inFlight\.current\) return;\s*inFlight\.current = true;/);
  assert.match(ui, /finally \{ inFlight\.current = false; setBusy\(false\); \}/);
});
