import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lib = readFileSync("src/lib/audit-history.ts", "utf8");
const panel = readFileSync("src/components/audit/audit-history-panel.tsx", "utf8");

test("a truncated export carries a PARTIAL EXPORT row inside the CSV itself", () => {
  assert.match(lib, /const marker = truncated \? \[csvCell\(`PARTIAL EXPORT: only the newest \$\{EXPORT_LIMIT\} entries are included\./);
  assert.match(lib, /\[header\.join\(","\), \.\.\.lines, \.\.\.marker\]/);
});

test("the panel reads X-Export-Truncated and warns instead of reporting ordinary success", () => {
  assert.match(panel, /response\.headers\.get\("X-Export-Truncated"\) === "true"\) toast\.warning\(t\("Only the newest \{0\} entries were exported\./);
  assert.match(panel, /X-Export-Rows/);
  assert.match(panel, /else toast\.success\(t\("Export downloaded\./);
});
