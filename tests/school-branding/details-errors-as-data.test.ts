import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2188: validation refusals from updateSchoolDetails come back as data, because production builds hide thrown text.
test("updateSchoolDetails returns validation errors and the panel shows them", () => {
  const settings = readFileSync("src/app/actions/settings.ts", "utf8");
  const wrapper = settings.slice(settings.indexOf("export async function updateSchoolDetails"), settings.indexOf("async function saveSchoolDetails"));
  assert.match(wrapper, /return \{ success: false as const, error: error\.message \}/);
  assert.match(wrapper, /startsWith\("PrismaClient"\)/);
  const panel = readFileSync("src/components/settings/InstitutionSettingsPanel.tsx", "utf8");
  assert.match(panel, /if \(!result\.success\) throw new Error\(result\.error\);/);
});
