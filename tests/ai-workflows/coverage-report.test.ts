import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageMarkdown, registryCoverage } from "../../scripts/ai-workflows/coverage-report";
import type { InventoryRow } from "../../scripts/ai-workflows/inventory-to-json";

const row = (key: string, aiToday: InventoryRow["aiToday"]): InventoryRow => ({
  key, aiToday, roles: ["TEACHER", "ADMIN"], cluster: "C1", method: "POST", route: "/api/example",
  risk: "CREATE", idempotent: "yes", reuse: "direct", addedByVerifier: false, source: "appendix-a",
});

test("coverage follows current registry mappings and role grants, not historic audit labels", () => {
  const connected = registryCoverage([{ key: "new.adapter", inventoryKeys: ["new.write"], roles: ["TEACHER"] }]);
  const rows = [row("old.write", "full"), row("new.write", "none")];
  assert.equal(connected(rows[0]), false);
  assert.equal(connected(rows[1]), true);
  assert.equal(connected(rows[1], "TEACHER"), true);
  assert.equal(connected(rows[1], "ADMIN"), false);
  const report = coverageMarkdown(rows, connected);
  assert.match(report, /Total capabilities: \*\*2\*\*; connected: \*\*1\*\*/);
  assert.match(report, /\| TEACHER \| 2 \| 1 \|/);
  assert.match(report, /\| ADMIN \| 2 \| 0 \|/);
});
