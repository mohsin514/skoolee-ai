import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateUi } from "@/lib/locale/ui-messages";

const source = readFileSync("src/components/portfolio/portfolio.tsx", "utf8");

test("SKAI-1495: a failed evidence lookup is remembered, not shown as an empty chooser", () => {
  assert.match(source, /setAdding\(true\); setEvidenceFailed\(false\); try \{/);
  assert.match(source, /catch \(e\) \{ setEvidenceFailed\(true\);/);
});

test("SKAI-1495: the Add evidence dialog shows a persistent error with Retry", () => {
  assert.match(source, /\{evidenceFailed \? <Alert tone="danger" compact data-pf-evidence-error>\{ui\("Could not load evidence to add\."\)\}.*onClick=\{\(\) => void openAdd\(\)\}>\{ui\("Retry"\)\}/);
  for (const language of ["ar", "ur"] as const) assert.notEqual(translateUi("Could not load evidence to add.", language), "Could not load evidence to add.", language);
});
