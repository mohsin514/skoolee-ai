import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { csvCell } from "../../src/lib/csv";
import { importField, normalizeImportHeader, parseImportCsv } from "../../src/lib/imports/csv";
import { isoDate, summarizeImportRows, type ImportRow } from "../../src/lib/imports/batch";

// SKAI-1015 (D2-09): scoped import/export contract for a bounded pilot. Synthetic data only.
const src = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("import parser: BOM, quoted commas/newlines, Urdu text and malformed files", () => {
  const rows = parseImportCsv('﻿Full Name,Roll No,Guardian Name\r\n"Ali, Synthetic",QA-1,"Line1\nLine2"\r\nعائشہ مصنوعی,QA-2,\r\n\r\n');
  assert.deepEqual(rows, [["Full Name", "Roll No", "Guardian Name"], ["Ali, Synthetic", "QA-1", "Line1\nLine2"], ["عائشہ مصنوعی", "QA-2", ""]]);
  assert.throws(() => parseImportCsv('a,b\n"open,1'), /unterminated/);
  assert.throws(() => parseImportCsv('a\n"x"y'), /Unexpected text/);
});

test("import mapping: header aliases are normalised", () => {
  const headers = ["Student Name", "Reg. No", "Parent Phone"].map(normalizeImportHeader);
  const row = Object.fromEntries(headers.map((h, i) => [h, ["Synthetic A", "R-9", "+923000000000"][i]]));
  assert.equal(importField(row, ["fullName", "studentName"]), "Synthetic A");
  assert.equal(importField(row, ["rollNo", "regNo"]), "R-9");
  assert.equal(importField(row, ["guardianPhone", "parentPhone"]), "+923000000000");
});

test("rejected-row report counts every state and validates dates", () => {
  const row = (state: ImportRow["state"], selected: boolean): ImportRow => ({ rowNumber: 2, source: {}, proposal: null, state, selected, matchKey: null, errors: [] });
  assert.deepEqual(summarizeImportRows([row("ACCEPTED", true), row("ACCEPTED", false), row("REJECTED", false), row("SKIPPED", false), row("UNRESOLVED", false)]),
    { total: 5, accepted: 1, rejected: 1, skipped: 2, unresolved: 1 });
  assert.equal(isoDate("2026-02-30"), false);
  assert.equal(isoDate("2026-02-28"), true);
});

test("export cells neutralise spreadsheet formulas but keep phone numbers", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-2+3"), "'-2+3");
  assert.equal(csvCell("+92 300 0000000"), "+92 300 0000000");
  assert.equal(csvCell("Khan, Ayesha"), "\"Khan, Ayesha\"");
  assert.equal(csvCell(null), "");
});

test("every CSV download route uses the shared guarded encoder and a UTF-8 BOM", () => {
  for (const path of ["src/app/api/students/export/route.ts", "src/app/api/front-desk/visitors/route.ts", "src/app/api/accounts/ledger/route.ts", "src/app/api/owner/support/actions/[id]/execute/route.ts"]) {
    const code = src(path);
    assert.match(code, /import \{ csvCell \} from "@\/lib\/csv"/, path);
    assert.doesNotMatch(code, /const csvCell\s*=/, `${path} must not define a local encoder`);
    assert.match(code, /﻿|\\uFEFF/, `${path} must emit a BOM`);
  }
});

test("roster export is staff-only, permission-gated, school+campus scoped and not cached", () => {
  const code = src("src/app/api/students/export/route.ts");
  for (const needle of ["assertStaffRole(user)", "assertPermission(user, \"students\", \"view\")", "resolveCampusId(user", "scopedCampusWhere(user, campusId)", "\"Cache-Control\": \"no-store\""]) assert.ok(code.includes(needle), needle);
  assert.match(src("src/lib/api/scope.ts"), /export function scopedCampusWhere[\s\S]{0,120}schoolId: user\.schoolId/);
});

test("staging and commit are tenant+campus scoped and idempotent across interruption", () => {
  const stage = src("src/lib/imports/stage-batch-command.ts");
  // Idempotency key: school, campus, kind, file fingerprint and target scope; a retried upload returns the same batch.
  assert.match(stage, /schoolId_campusId_kind_fingerprint_targetScope/);
  assert.match(stage, /P2002[\s\S]{0,200}created: false/);
  // Classes and existing pupils are read only inside the caller's school and chosen campus.
  assert.match(stage, /class\.findMany\(\{ where: \{ id: \{ in: classIds \}, campusId, campus: \{ schoolId: user\.schoolId \}/);
  assert.match(stage, /student\.findMany\(\{ where: \{ campusId, campus: \{ schoolId: user\.schoolId \}/);
  const create = src("src/lib/students/create.ts");
  // Commit claims STAGED -> COMMITTING inside the same transaction that creates pupils: an interrupted commit rolls
  // back to STAGED (retryable); a repeat after success returns the receipt with idempotent: true.
  assert.match(create, /\$transaction[\s\S]*state: "STAGED"[\s\S]{0,140}data: \{ state: "COMMITTING" \}/);
  assert.match(create, /state === "COMMITTED" \|\| importBatch\.state === "PARTIAL" \|\| importBatch\.state === "REVERSED"[\s\S]{0,300}idempotent: true/);
  assert.match(create, /importBatch\.findFirst\(\{ where: \{ id: body\._importBatchId, schoolId: user\.schoolId, campusId \}/);
  const batchRoute = src("src/app/api/import-batches/[batchId]/route.ts");
  assert.match(batchRoute, /findFirst\(\{ where: \{ id, schoolId, campusId \} \}\)/);
  assert.match(batchRoute, /rollMatches\.find\(\(student\) => student\.classId === proposal\.classId\)/);
});

test("no live government/SIS connector is advertised as available", () => {
  const contract = src("docs/pilots/scoped-exchange-contract.md");
  assert.match(contract, /Noor[\s\S]*Madrasati[\s\S]*KHDA/);
  assert.match(contract, /not available/i);
});
