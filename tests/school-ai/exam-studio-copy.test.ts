import test from "node:test";
import assert from "node:assert/strict";
import { EXAM_STUDIO_COPY_AREAS, STUDIO_STATUS_TOKENS, fillStudioCopy, studioStatusCopy, studioStatusLabel } from "../../src/lib/school-ai/exam-studio-copy";

const LANGUAGES = ["en", "ar", "ur"] as const;
/** R1.8 bans these from interface copy; the scan runs over every language so a translation cannot reintroduce one. */
const BANNED = ["cheat-proof", "tamper-proof", "fraud-proof", "guaranteed detection"];
const placeholders = (value: string) => (value.match(/\{[^{}]*\}/g) ?? []).sort();
const entries = () => EXAM_STUDIO_COPY_AREAS.flatMap(area => Object.keys(area.en).map(key => ({ area: area.area, key, values: { en: area.en[key], ar: area.ar[key], ur: area.ur[key] } })));

test("every Exam Studio copy key carries a distinct English, Arabic and Urdu translation", () => {
  assert.equal(new Set(EXAM_STUDIO_COPY_AREAS.map(area => area.area)).size, EXAM_STUDIO_COPY_AREAS.length, "two copy areas share one name");
  for (const area of EXAM_STUDIO_COPY_AREAS) {
    const keys = Object.keys(area.en).sort();
    assert(keys.length > 0, `copy area ${area.area} is empty`);
    for (const language of LANGUAGES) assert.deepEqual(Object.keys(area[language]).sort(), keys, `copy area ${area.area} has a different key set in ${language}`);
  }
  for (const { area, key, values } of entries()) {
    for (const language of LANGUAGES) {
      const value = values[language];
      assert.equal(typeof value, "string", `${area}.${key} is missing in ${language}`);
      assert(value.trim().length > 0, `${area}.${key} is blank in ${language}`);
      assert.equal(value, value.trim(), `${area}.${key} in ${language} is padded, which signals string concatenation`);
    }
    assert.notEqual(values.ar, values.en, `${area}.${key} is untranslated in Arabic`);
    assert.notEqual(values.ur, values.en, `${area}.${key} is untranslated in Urdu`);
    assert.notEqual(values.ar, values.ur, `${area}.${key} shares one string between Arabic and Urdu`);
  }
});

test("the status vocabulary is exactly the sixteen frozen tokens in all three languages", () => {
  assert.deepEqual([...STUDIO_STATUS_TOKENS], ["DRAFT", "NEEDS_SOURCE", "NEEDS_CORRECTION", "READY_FOR_REVIEW", "APPROVED", "CHANGED_AFTER_APPROVAL", "STALE", "BLOCKING", "ADVISORY", "SEALED", "SAVED", "SAVING", "UNSAVED", "SAVE_FAILED", "GATE_OPEN", "NOT_MEASURED"]);
  assert.equal(STUDIO_STATUS_TOKENS.length, 16);
  for (const language of LANGUAGES) {
    const copy = studioStatusCopy(language);
    assert.deepEqual(Object.keys(copy).sort(), [...STUDIO_STATUS_TOKENS].sort(), `the ${language} status table does not match the token list`);
    for (const token of STUDIO_STATUS_TOKENS) assert.equal(studioStatusLabel(token, language), copy[token]);
  }
  assert.equal(studioStatusCopy("en").NOT_MEASURED, "not measured", "R1.5 requires this exact text in place of an unmeasured figure");
});

test("composed messages use numbered placeholders that every translation preserves and can reorder", () => {
  for (const { area, key, values } of entries()) {
    const expected = placeholders(values.en);
    for (const token of expected) assert.match(token, /^\{\d+\}$/, `${area}.${key} uses the named placeholder ${token}; Exam Studio copy is numbered only`);
    for (const language of LANGUAGES) assert.deepEqual(placeholders(values[language]), expected, `${area}.${key} loses or adds a placeholder in ${language}`);
  }
  assert.equal(fillStudioCopy("{0} of {1} items", [3, 9]), "3 of 9 items");
  assert.equal(fillStudioCopy("{1} من {0}", [3, 9]), "9 من 3", "a translation must be able to reorder the parts");
  assert.equal(fillStudioCopy("{0} and {1}", ["a"]), "a and {1}", "an unsupplied index is left intact rather than rendered as undefined");
});

test("interface copy excludes the banned absolute-security claims", () => {
  for (const { area, key, values } of entries()) for (const language of LANGUAGES) {
    const value = values[language].toLowerCase();
    for (const term of BANNED) assert(!value.includes(term), `${area}.${key} in ${language} uses the banned term "${term}"`);
  }
});
