// P9-01: a conflicting translation is a defect even though precedence keeps the app consistent.
// (1) A role-ux package entry for a key the reviewed catalogs already translate is dead (the reviewed value wins) and,
//     when it means something else, the package's own screen shows the wrong word: the package must use a distinct EN
//     key (e.g. resultGradeLabel() for a result grade, "Account owner" for the owner badge) or drop the entry.
// (2) Two packages translating the same EN key differently: only one wins (P9 → P2 → P1 → P3…P8), so the other screen
//     reads differently from what its package reviewed. Agree on one translation, or use distinct keys.
// The failure message names every key and package so the owner can fix it in their own p<N>-messages.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewedTranslation } from "../../src/lib/locale/ui-messages";
import { ROLE_UX_CATALOGS } from "../../src/lib/locale/role-ux/index";

const reviewed = (language: "ar" | "ur", key: string) => reviewedTranslation(key, language);

test("no role-ux package redefines a reviewed key with a different translation", () => {
  const conflicts: string[] = [];
  for (const { pkg, ar, ur } of ROLE_UX_CATALOGS) {
    for (const [language, catalog] of [["ar", ar], ["ur", ur]] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        const existing = reviewed(language, key);
        if (existing !== undefined && existing !== value) conflicts.push(`${pkg} ${language} ${JSON.stringify(key)}: reviewed "${existing}" vs "${value}"`);
      }
    }
  }
  assert.deepEqual(conflicts, []);
});

test("packages agree on every key they share", () => {
  const conflicts: string[] = [];
  for (const language of ["ar", "ur"] as const) {
    const seen = new Map<string, Array<[string, string]>>();
    for (const catalog of ROLE_UX_CATALOGS) {
      for (const [key, value] of Object.entries(catalog[language])) {
        const list = seen.get(key) ?? [];
        list.push([catalog.pkg, value]);
        seen.set(key, list);
      }
    }
    for (const [key, list] of seen) {
      if (new Set(list.map(([, value]) => value)).size > 1) conflicts.push(`${language} ${JSON.stringify(key)}: ${list.map(([pkg, value]) => `${pkg} "${value}"`).join(" | ")}`);
    }
  }
  assert.deepEqual(conflicts, []);
});
