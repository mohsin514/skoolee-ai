import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actorRoleLabel, curriculumPacksCopy } from "@/components/curriculum/curriculum-packs-copy";

// SKAI-153: the curriculum setup screen reads every label from the EN/AR/UR catalog.
test("every locale carries the same curriculum pack keys", () => {
  const keys = Object.keys(curriculumPacksCopy("en")).sort();
  for (const language of ["ar", "ur"]) assert.deepEqual(Object.keys(curriculumPacksCopy(language)).sort(), keys, language);
});

test("event actor roles are localized and unknown roles fall back to their code", () => {
  assert.equal(actorRoleLabel(curriculumPacksCopy("en"), "CAMPUS_ADMIN"), "Campus administrator");
  assert.equal(actorRoleLabel(curriculumPacksCopy("ur"), "PRINCIPAL"), "پرنسپل");
  assert.equal(actorRoleLabel(curriculumPacksCopy("ar"), "SUPER_ADMIN"), "مالك المجموعة");
  assert.equal(actorRoleLabel(curriculumPacksCopy("ar"), "TEACHER"), "TEACHER");
});

test("the screen has no hard-coded English title or browser-locale dates", () => {
  const source = readFileSync("src/components/curriculum/CurriculumPacks.tsx", "utf8");
  assert.match(source, /title=\{t\.title\}/);
  assert.doesNotMatch(source, /title="Curriculum packs"/);
  assert.doesNotMatch(source, /toLocaleString\(\)/);
});

test("an empty catalogue explains itself and hides the request form", () => {
  const source = readFileSync("src/components/curriculum/CurriculumPacks.tsx", "utf8");
  assert.match(source, /data\.canRequest && data\.catalogue\.length > 0 && data\.campuses\.length > 0/);
  assert.match(source, /data-pack-catalogue-empty/);
});
