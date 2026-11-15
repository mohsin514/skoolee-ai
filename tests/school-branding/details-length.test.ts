import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2189: school name, tagline, city and address are capped on the server and in the edit form.
test("school details text fields are length-capped", () => {
  const settings = readFileSync("src/app/actions/settings.ts", "utf8");
  assert.match(settings, /requiredText\(input\.name, "School name", 120\)/);
  assert.match(settings, /requiredText\(input\.city, "City", 80\)/);
  assert.match(settings, /cappedPatch\(input\.tagline, "Tagline", 160\)/);
  assert.match(settings, /cappedPatch\(input\.address, "Address", 300\)/);
  const panel = readFileSync("src/components/settings/InstitutionSettingsPanel.tsx", "utf8");
  for (const [id, max] of [["s-name", 120], ["s-tagline", 160], ["s-city", 80], ["s-address", 300]]) assert.match(panel, new RegExp(`<Field id="${id}" maxLength=\\{${max}\\}`));
});
