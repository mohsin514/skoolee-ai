/**
 * Charter Desk (setup redesign) copy: Arabic and Urdu spread `...en`, so a
 * missing key would silently show English. Every leaf under `en.charter`
 * must exist in ar and ur, be translated, and keep the same {n} slots; no
 * new string may collide with a pinned phrase.
 *   node --import tsx --test tests/onboarding/charter-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardingCopy } from "../../src/app/onboarding/copy";

type Leaf = [path: string, value: string];

function leaves(value: unknown, path = "charter"): Leaf[] {
  if (typeof value === "string") return [[path, value]];
  assert.ok(value && typeof value === "object", `${path} is a string or an object of strings`);
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
}

const slots = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort().join(",");

const en = leaves(onboardingCopy("en").charter);

test("en.charter is complete: the cover lines, ledger, rail, groups and review strings", () => {
  const keys = new Set(en.map(([path]) => path));
  for (const step of ["structure", "identity", "package", "campuses", "academic", "review", "sealed"]) {
    assert.ok(keys.has(`charter.cover.${step}.light`) && keys.has(`charter.cover.${step}.strong`), `cover.${step}`);
  }
  for (const key of ["type", "use", "city", "package", "campuses", "session", "week"]) assert.ok(keys.has(`charter.ledger.${key}`), `ledger.${key}`);
  for (const key of ["ledgerTitle", "campusSplit", "sealOpen", "sealPressed", "sealFailed", "inSkoolee", "staysInSystems", "modulesLabel", "saveDirty", "railItem",
    "attention", "moreDetails", "dropLogo", "established", "newCampus", "editingCampus", "cityPrefilled", "edit", "editSection", "sealNote", "openWorkspace"]) {
    assert.ok(keys.has(`charter.${key}`), key);
  }
  for (const [path, value] of en) assert.ok(value.trim().length > 0, `${path} is not empty`);
});

for (const language of ["ar", "ur"] as const) {
  test(`${language}.charter translates every en leaf with the same {n} slots`, () => {
    const translated = new Map(leaves(onboardingCopy(language).charter));
    assert.equal(translated.size, en.length, `${language}.charter has exactly the en keys`);
    for (const [path, english] of en) {
      const value = translated.get(path);
      assert.equal(typeof value, "string", `${language}: ${path} exists`);
      assert.notEqual(value, english, `${language}: ${path} is translated, not the English fallback`);
      assert.match(value as string, /[؀-ۿ]/, `${language}: ${path} is written in Arabic script`);
      assert.equal(slots(value as string), slots(english), `${language}: ${path} keeps the slots ${slots(english) || "(none)"}`);
    }
  });
}

test("no charter string collides with a pinned phrase", () => {
  // getByText/getByLabel/getByRole name matches are substring matches unless exact.
  const pinnedSubstrings = [
    "Your campuses", "Compare packages", "Configure fees and payroll", "Set up school operations", "Use Exam Studio with my current systems",
    "A school group", "One school", "Primary campus created automatically", "Activated now:", "campus drafts are beyond",
    "You are completing this setup", "Setup is managed by your institution owner", "Save and exit", "Sign out", "Hand over setup",
    "Revoke access", "Go to Campuses", "Edit campus:", "Campus ID", "Continue with", "Activate eligible setup", "Activate setup",
  ].map((phrase) => phrase.toLowerCase());
  const pinnedExact = ["Continue", "Activate", "Draft", "Auto", "Manual", "Add campus", "Update campus", "Done"];
  for (const language of ["en", "ar", "ur"] as const) {
    for (const [path, value] of leaves(onboardingCopy(language).charter)) {
      const lower = value.toLowerCase();
      for (const phrase of pinnedSubstrings) assert.ok(!lower.includes(phrase), `${language}: ${path} contains the pinned phrase "${phrase}"`);
      for (const exact of pinnedExact) assert.notEqual(value, exact, `${language}: ${path} equals the pinned text "${exact}"`);
    }
  }
});

test("existing pinned strings are byte-identical", () => {
  const t = onboardingCopy("en");
  assert.equal(t.types.STANDALONE.label, "One school");
  assert.equal(t.types.GROUP.label, "A school group");
  assert.equal(t.modes.EXAM_STUDIO.label, "Use Exam Studio with my current systems");
  assert.equal(t.modes.FULL_OPERATIONS.label, "Set up school operations");
  assert.equal(t.continue, "Continue");
  assert.equal(t.saveExit, "Save and exit");
  assert.equal(t.signOut, "Sign out");
  assert.equal(t.comparePackages, "Compare packages");
  assert.equal(t.activate, "Activate setup");
  assert.equal(t.activateEligible, "Activate eligible setup");
  assert.equal(t.activateNote, "Activated now: {0}. Kept as drafts until you change package: {1}.");
  assert.equal(t.overLimit, "{0} campus drafts are beyond this package. They stay saved as drafts; change package when you are ready to activate them.");
});
