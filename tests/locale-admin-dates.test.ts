import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1664: these admin dates follow the selected Skoolee locale instead of the browser default.
const read = (file: string) => readFileSync(file, "utf8");

test("inventory transactions and fee due dates use the locale date formatter", () => {
  assert.match(read("src/components/operations/index.tsx"), /<td className=\{tdCls\}>\{formatDate\(t\.createdAt\)\}<\/td>/);
  assert.match(read("src/components/fees/FeeLayersTab.tsx"), /tr\(" · due \{0\}", \[formatDate\(line\.dueDate\)\]\)/);
});

test("datesheet labels pass the app locale tag", () => {
  const source = read("src/components/academic/DatesheetBuilder.tsx");
  assert.doesNotMatch(source, /toLocaleDateString\(undefined/);
  assert.equal(source.match(/const dateTag = localeTag\(useLocale\(\)\);/g)?.length, 2);
});
