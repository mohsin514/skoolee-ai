// P9-01: the role re-architecture catalogs (src/lib/locale/role-ux/*, §10.10) may add copy, but never change what a
// reviewed word means across the app. Before the fix the aggregator ran first, so "Grade" (school level) became
// "التقدير", the family "Home" became "أساسي" (an org-chart badge) and the task "Owner" became "المالك".
import { test } from "node:test";
import assert from "node:assert/strict";
import { arabicReviewedUi, urduReviewedUi, arabicUi, urduUi, translateUi, reviewedTranslation } from "../../src/lib/locale/ui-messages";
import { arabicNavigationUi, urduNavigationUi } from "../../src/lib/locale/navigation-ui-messages";
import { arabicWorkflowUi, urduWorkflowUi } from "../../src/lib/locale/workflow-ui-messages";
import { ROLE_UX_CATALOGS, arabicRoleUxUi, urduRoleUxUi } from "../../src/lib/locale/role-ux/index";

const REVIEWED = {
  ar: { navigation: arabicNavigationUi, ui: arabicReviewedUi, workflow: arabicWorkflowUi, roleUx: arabicRoleUxUi, all: arabicUi },
  ur: { navigation: urduNavigationUi, ui: urduReviewedUi, workflow: urduWorkflowUi, roleUx: urduRoleUxUi, all: urduUi },
} as const;

test("every reviewed key keeps its reviewed translation, whatever a role-ux package says", () => {
  for (const language of ["ar", "ur"] as const) {
    const c = REVIEWED[language];
    const keys = new Set([...Object.keys(c.navigation), ...Object.keys(c.ui), ...Object.keys(c.workflow)]);
    const drifted: string[] = [];
    for (const key of keys) {
      const reviewed = c.navigation[key] ?? c.ui[key] ?? c.workflow[key];
      if (translateUi(key, language) !== reviewed || reviewedTranslation(key, language) !== reviewed) drifted.push(`${language}: ${key}`);
      // arabicUi/urduUi (read directly by the coverage test) follow the same rule.
      if (key in c.ui && c.all[key] !== c.ui[key]) drifted.push(`${language} (catalog): ${key}`);
    }
    assert.deepEqual(drifted, []);
  }
});

test("role-ux keys still translate where no reviewed catalog has them", () => {
  for (const language of ["ar", "ur"] as const) {
    const c = REVIEWED[language];
    for (const [key, value] of Object.entries(c.roleUx)) {
      assert.equal(translateUi(key, language), reviewedTranslation(key, language) ?? value, `${language}: ${key}`);
    }
  }
});

test("the words that drifted under P9-01 read as reviewed again", () => {
  // SKO-496: the school-level grade (a result grade is resultGradeLabel()).
  assert.equal(translateUi("Grade", "ar"), "الصف");
  assert.equal(translateUi("Grade", "ur"), "جماعت");
  // The task/case owner (improvement workspace "Owner:", queues, complaints) — not the account proprietor.
  assert.equal(translateUi("Owner", "ar"), "المسؤول");
  assert.equal(translateUi("Owner", "ur"), "ذمہ دار");
  assert.equal(translateUi("Select class", "ar"), "اختر الصف");
  assert.equal(translateUi("Period {0}", "ar"), "الفترة {0}");
  // Between packages the shared-vocabulary owners win: the family nav leaf "Home" is P2's, not P5's org-chart badge.
  assert.equal(translateUi("Home", "ar"), "الرئيسية");
  assert.equal(translateUi("Home", "ur"), "ہوم");
});

test("the role-ux precedence order is P9, P2, then P1 and P3–P8, and each package ships both languages", () => {
  assert.deepEqual(ROLE_UX_CATALOGS.map((c) => c.pkg), ["P9", "P2", "P1", "P3", "P4", "P5", "P6", "P7", "P8"]);
  for (const { pkg, ar, ur } of ROLE_UX_CATALOGS) {
    assert.deepEqual(Object.keys(ar).sort(), Object.keys(ur).sort(), `${pkg}: AR and UR cover the same keys`);
  }
});
