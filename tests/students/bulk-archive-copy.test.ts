import assert from "node:assert/strict";
import { test } from "node:test";
import { bulkStatusConfirmCopy } from "../../src/components/shared-admin/bulk-status-copy";
import { translateUi } from "../../src/lib/locale/ui-messages";

const uiFor = (language: "en" | "ar" | "ur") => (source: string, values: unknown[] = []) =>
  translateUi(source, language).replace(/\{(\d+)\}/g, (match, index) => (index in values ? String(values[Number(index)]) : match));

// SKAI-1929: the bulk archive confirm counted "student(s)" and always said "Archive Student".
test("bulk archive confirmation agrees with the number of pupils in English", () => {
  const one = bulkStatusConfirmCopy("archived", 1, "en", uiFor("en"));
  const three = bulkStatusConfirmCopy("archived", 3, "en", uiFor("en"));
  assert.deepEqual([one.title, one.confirmLabel], ["Archive 1 student?", "Archive student"]);
  assert.deepEqual([three.title, three.confirmLabel], ["Archive 3 students?", "Archive students"]);
  assert.equal(bulkStatusConfirmCopy("active", 2, "en", uiFor("en")).description, "2 students will return to the active roster in their existing class.");
});

test("bulk archive confirmation never shows a programmer plural in EN, AR or UR", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    for (const count of [1, 2, 3, 11]) {
      for (const target of ["archived", "active"] as const) {
        const copy = bulkStatusConfirmCopy(target, count, language, uiFor(language));
        for (const text of [copy.title, copy.confirmLabel, copy.description ?? ""]) {
          assert.doesNotMatch(text, /\(s\)|\{\d\}/, `${language} ${target} ${count}: ${text}`);
          if (language !== "en" && text) assert.doesNotMatch(text, /[A-Za-z]/, `${language} untranslated: ${text}`);
        }
      }
    }
  }
  assert.equal(bulkStatusConfirmCopy("archived", 3, "ar", uiFor("ar")).title, "أرشفة 3 طلاب؟");
  assert.notEqual(bulkStatusConfirmCopy("archived", 3, "ar", uiFor("ar")).confirmLabel, bulkStatusConfirmCopy("archived", 1, "ar", uiFor("ar")).confirmLabel);
});
