import assert from "node:assert/strict";
import { test } from "node:test";
import { isoDate, summarizeImportRows } from "../../src/lib/imports/batch";
import { parseImportCsv } from "../../src/lib/imports/csv";

test("CSV parser keeps commas, escaped quotes, embedded newlines and UTF-8 BOM intact", () => {
  assert.deepEqual(parseImportCsv('\uFEFFname,note\r\n"Khan, Ayesha","said ""hello""\nand left"\r\n'), [
    ["name", "note"],
    ["Khan, Ayesha", 'said "hello"\nand left'],
  ]);
});

test("CSV parser rejects an unterminated quoted field instead of shifting later cells", () => {
  assert.throws(() => parseImportCsv('name,rollNo\n"Ali,VA-1\n'), /unterminated quoted field/i);
});

test("row summary reconciles selected, rejected, skipped and unresolved inputs", () => {
  const summary = summarizeImportRows([
    { rowNumber: 2, source: {}, proposal: {}, state: "ACCEPTED", selected: true, matchKey: "c:r", errors: [] },
    { rowNumber: 3, source: {}, proposal: {}, state: "ACCEPTED", selected: false, matchKey: "c:s", errors: [] },
    { rowNumber: 4, source: {}, proposal: null, state: "REJECTED", selected: false, matchKey: null, errors: ["invalid"] },
    { rowNumber: 5, source: {}, proposal: {}, state: "SKIPPED", selected: false, matchKey: "c:t", errors: [] },
    { rowNumber: 6, source: {}, proposal: {}, state: "UNRESOLVED", selected: false, matchKey: "c:u", errors: ["ambiguous"] },
  ]);
  assert.deepEqual(summary, { total: 5, accepted: 1, rejected: 1, skipped: 2, unresolved: 1 });
  assert.equal(summary.accepted + summary.rejected + summary.skipped + summary.unresolved, summary.total);
});

test("date-only import validation rejects normalized and impossible dates", () => {
  assert.equal(isoDate("2026-10-08"), true);
  assert.equal(isoDate("2026-02-30"), false);
  assert.equal(isoDate("08/10/2026"), false);
});
