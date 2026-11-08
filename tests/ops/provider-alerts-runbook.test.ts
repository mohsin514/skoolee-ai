import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-866: every alertable provider failure reason has an alert rule and a resolution procedure.
test("runbook covers every alertable provider failure reason", () => {
  const source = readFileSync("src/lib/ai/openai.ts", "utf8");
  const union = source.match(/export type ProviderFailureReason = ([^;]+);/);
  assert.ok(union, "ProviderFailureReason union not found");
  const reasons = [...union[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).filter((r) => r !== "OTHER");
  assert.ok(reasons.length >= 3);
  const runbook = readFileSync("docs/operations/provider-alerts.md", "utf8");
  for (const reason of reasons) {
    assert.match(runbook, new RegExp(`\\| \`${reason}\` \\|`), `${reason} has no alert rule row`);
    assert.match(runbook, new RegExp(`^### ${reason}$`, "m"), `${reason} has no resolution procedure`);
  }
  assert.match(runbook, /## Responders/);
});
