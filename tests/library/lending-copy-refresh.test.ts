import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1597: the selected copy badge is re-read after a successful issue or return.
const src = readFileSync("src/components/library/lending-desk.tsx", "utf8");

test("refreshCopy re-reads the copy and clears it when it cannot", () => {
  assert.match(src, /const refreshCopy = async \(barcode: string\) => \{\n\s*try \{ const found = await call\(`\/api\/library\/desk\?code=\$\{encodeURIComponent\(barcode\)\}`\); setCopy\(found\.kind === "MEMBER" \? null : found\); \}\n\s*catch \{ setCopy\(null\); \}/);
});

test("both issue paths refresh the copy alongside the reader", () => {
  assert.match(src, /await Promise\.all\(\[refreshMember\(\), refreshCopy\(found\.copy\.barcode\)\]\)/);
  assert.match(src, /await Promise\.all\(\[refreshMember\(\), refreshCopy\(copy\.copy\.barcode\)\]\)/);
});

test("a successful return refreshes the shown copy when it is the returned one", () => {
  assert.match(src, /if \(r && copy && copy\.copy\.barcode\.toLowerCase\(\) === returned\.toLowerCase\(\)\) void refreshCopy\(copy\.copy\.barcode\);/);
});
