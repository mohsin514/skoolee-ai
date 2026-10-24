import assert from "node:assert/strict";
import test from "node:test";
import { announcementCopy } from "../../src/components/school-ai/announcement-copy";

test("announcement review, blocker and delivery copy is complete in all supported languages", () => {
  const english = announcementCopy("en");
  assert.notEqual(english.QUEUED, english.DELIVERED); assert.notEqual(english.ACCEPTED, english.DELIVERED);
  for (const language of ["ar", "ur"] as const) {
    const copy = announcementCopy(language);
    assert.deepEqual(Object.keys(copy), Object.keys(english));
    for (const value of Object.values(copy)) assert.match(value, /[\u0600-\u06ff]/);
  }
});
