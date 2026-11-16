import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { purposeDeclined } from "@/lib/family/guardian-consent";

// SKAI-2151: a guardian's recorded "No" must be honoured, not just stored.
test("only each guardian's latest answer counts, per purpose", () => {
  const rows = [
    { guardianUserId: "g1", choices: { aiAssistance: true } },
    { guardianUserId: "g1", choices: { aiAssistance: false } },
    { guardianUserId: "g2", choices: { aiAssistance: true, photosMedia: false } },
  ];
  assert.equal(purposeDeclined(rows, "aiAssistance"), false);
  assert.equal(purposeDeclined(rows, "photosMedia"), true);
  assert.equal(purposeDeclined([{ guardianUserId: "g1", choices: { aiAssistance: false } }], "aiAssistance"), true);
});

test("no answer is not a refusal", () => {
  assert.equal(purposeDeclined([], "aiAssistance"), false);
  assert.equal(purposeDeclined([{ guardianUserId: "g1", choices: null }], "aiAssistance"), false);
});

test("the study assistant checks AI consent before any model call", () => {
  const src = readFileSync("src/lib/study/assistant.ts", "utf8");
  const body = src.slice(src.indexOf("export async function ask"));
  const check = body.indexOf('guardianDeclinedPurpose(user.schoolId, learner.id, "aiAssistance")');
  assert.ok(check > 0 && check < body.indexOf("viaGateway(question"));
});
