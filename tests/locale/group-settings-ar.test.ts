import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2203: group settings tabs, data-placement notes and the locked-rows note are translated.
test("group settings strings have catalogue entries and are rendered through ui()", () => {
  const catalogue = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");
  for (const key of ["Language and region", "Sign-in and roster", "Data and privacy", "Read from the database connection host.", "File storage is not configured.", "Not configured"]) {
    assert.ok(catalogue.includes(`["${key}", "`), key);
  }
  const panel = readFileSync("src/components/settings/DataLifecyclePanel.tsx", "utf8");
  assert.match(panel, /\{ui\(item\.note\)\}/);
  assert.match(panel, /\{ui\(item\.provider\)\}/);
  const details = readFileSync("src/components/settings/InstitutionSettingsPanel.tsx", "utf8");
  assert.match(details, /note=\{tr\("The school ID prints on report cards/);
});
