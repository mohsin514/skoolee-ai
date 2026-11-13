import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { patchListQuery } from "../../src/lib/lists/query";

// SKAI-1944: the ledger's Currency filter is URL state like From/To/Source/Status, so a reload keeps it.
const source = readFileSync("src/components/fees/AccountsTab.tsx", "utf8");
const ledger = source.slice(source.indexOf("function EntriesPanel"), source.indexOf("type ProfitReport"));

test("the ledger currency filter is read from and written to the URL", () => {
  assert.ok(ledger.length > 0, "EntriesPanel source was found");
  assert.match(ledger, /useListField<string>\(`ledger\.\$\{kind\}\.currency`, "", `ledger\.\$\{kind\}\.page`\)/);
  assert.doesNotMatch(ledger, /\[pickedCurrency, setPickedCurrency\] = useState/);
  // A picked currency drives the request and the select; the ledger's reported currency is only the fallback.
  assert.match(ledger, /const currency = pickedCurrency \|\| reportedCurrency;/);
  assert.match(ledger, /buildParams\(pickedCurrency \|\| ledgerCurrency\.current\)/);
  // An unknown code in the URL is ignored instead of being sent to the API.
  assert.match(ledger, /\(CURRENCIES as readonly string\[\]\)\.includes\(urlCurrency\) \? urlCurrency : ""/);
});

test("picking a currency keeps the other ledger filters and resets only that ledger's page", () => {
  const current = "view=accounts&tab=expense&ledger.EXPENSE.from=2026-09-01&ledger.EXPENSE.status=open&ledger.EXPENSE.page=3&ledger.INCOME.page=2";
  const next = patchListQuery(current, { "ledger.EXPENSE.currency": "PKR" }, "ledger.EXPENSE.page");
  assert.equal(next.get("ledger.EXPENSE.currency"), "PKR");
  assert.equal(next.get("ledger.EXPENSE.from"), "2026-09-01");
  assert.equal(next.get("ledger.EXPENSE.status"), "open");
  assert.equal(next.get("view"), "accounts");
  assert.equal(next.get("ledger.EXPENSE.page"), null);
  assert.equal(next.get("ledger.INCOME.page"), "2");
  // Choosing the same currency again is not a filter change and keeps the page.
  const same = patchListQuery("ledger.EXPENSE.currency=PKR&ledger.EXPENSE.page=3", { "ledger.EXPENSE.currency": "PKR" }, "ledger.EXPENSE.page");
  assert.equal(same.get("ledger.EXPENSE.page"), "3");
});
