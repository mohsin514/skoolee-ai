import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImportRow } from "../../src/lib/imports/batch";
import { addNameAdvisories, nameKey, normalizeRosterDate, reconciliationSheet, rehearsalGroups } from "../../src/lib/imports/rehearsal";

// SKAI-913 fixture: synthetic QA-01 pupils only.
const row = (rowNumber: number, state: ImportRow["state"], proposal: Record<string, unknown> | null, extra: Partial<ImportRow> = {}): ImportRow => ({
  rowNumber, source: { fullname: String(proposal?.fullName ?? ""), rollno: String(proposal?.rollNo ?? ""), guardianphone: "+92 3000000009", medicalnotes: "asthma", address: "QA street" },
  proposal, state, selected: state === "ACCEPTED", matchKey: proposal ? `class:c1/roll:${proposal.rollNo}` : null, errors: [], ...extra,
});

test("mixed spreadsheet dates normalise to ISO or are rejected with a reason", () => {
  assert.deepEqual(normalizeRosterDate("2015-04-12"), { value: "2015-04-12" });
  assert.deepEqual(normalizeRosterDate("2015/4/2"), { value: "2015-04-02" });
  assert.deepEqual(normalizeRosterDate("25/12/2014"), { value: "2014-12-25" });
  assert.deepEqual(normalizeRosterDate("12/25/2014"), { value: "2014-12-25" });
  assert.deepEqual(normalizeRosterDate("15 Mar 2016"), { value: "2016-03-15" });
  assert.deepEqual(normalizeRosterDate("March 5, 2016"), { value: "2016-03-05" });
  assert.deepEqual(normalizeRosterDate("٢٠١٥-٠٤-١٢"), { value: "2015-04-12" });
  assert.deepEqual(normalizeRosterDate("۲۰۱۵-۰۴-۱۲"), { value: "2015-04-12" });
  assert.deepEqual(normalizeRosterDate(""), { value: null });
  assert.match(normalizeRosterDate("03/04/2015").error || "", /day\/month or month\/day/);
  assert.match(normalizeRosterDate("2015-02-30").error || "", /not a real calendar date/);
  assert.match(normalizeRosterDate("next spring").error || "", /not a recognised date/);
});

test("Arabic and Urdu names compare without diacritics or tatweel", () => {
  assert.equal(nameKey("مُحَمَّد  علي"), nameKey("محمد علي"));
  assert.equal(nameKey("عـائشة"), nameKey("عائشة"));
  assert.equal(nameKey("  Sample   PUPIL "), "sample pupil");
});

test("name-only duplicates are advisories and never change a row's outcome", () => {
  const rows = [
    row(2, "ACCEPTED", { fullName: "محمد علی", rollNo: "QA-1" }),
    row(3, "ACCEPTED", { fullName: "مُحمد علی", rollNo: "QA-2" }),
    row(4, "ACCEPTED", { fullName: "Sample Pupil", rollNo: "QA-3" }),
    row(5, "ACCEPTED", { fullName: "Unique Pupil", rollNo: "QA-4" }),
  ];
  addNameAdvisories(rows, [{ fullName: "Sample Pupil", rollNo: "OLD-9" }, { fullName: "Unique Pupil", rollNo: "qa-4" }]);
  assert.match(rows[0].notes?.[0] || "", /row 3/);
  assert.match(rows[1].notes?.[0] || "", /row 2/);
  assert.match(rows[2].notes?.[0] || "", /roll OLD-9/);
  assert.equal(rows[3].notes, undefined, "the same roll number is a key match, not a name advisory");
  assert.ok(rows.every((item) => item.state === "ACCEPTED" && item.selected));
});

test("rehearsal groups are separately named and reconcile exactly to the input", () => {
  const rows = [
    row(2, "ACCEPTED", { fullName: "A", rollNo: "1" }),
    row(3, "ACCEPTED", { fullName: "B", rollNo: "2" }, { selected: false }),
    row(4, "SKIPPED", { fullName: "C", rollNo: "3" }, { matchLabel: "Existing pupil: C" }),
    row(5, "SKIPPED", { fullName: "D", rollNo: "4" }, { errors: ["Excluded by staff during preview"] }),
    row(6, "REJECTED", { fullName: "E", rollNo: "5" }, { errors: ['className: No single active class "Grade 9" exists at this campus; create it or correct the file'] }),
    row(7, "UNRESOLVED", { fullName: "F", rollNo: "1" }, { errors: ["rollNo: repeated"] }),
  ];
  const groups = rehearsalGroups(rows);
  assert.deepEqual(groups, { total: 6, additions: 1, existingUnchanged: 1, excluded: 2, errors: 1, unresolved: 1 });
  assert.equal(groups.additions + groups.existingUnchanged + groups.excluded + groups.errors + groups.unresolved, groups.total);
});

test("the reconciliation sheet explains every row and exports no contact, address or medical data", () => {
  const rows = [
    row(2, "ACCEPTED", { fullName: "عائشة", rollNo: "QA-1" }),
    row(3, "REJECTED", { fullName: "=HYPERLINK(1)", rollNo: "QA-2" }, { errors: ["dateOfBirth: \"03/04/2015\" could be day/month or month/day; write it as YYYY-MM-DD"] }),
  ];
  const sheet = reconciliationSheet(rows);
  assert.deepEqual(sheet[0], ["row", "outcome", "full_name", "roll_no", "class", "section", "match_key", "reasons", "notes"]);
  assert.equal(sheet.length, 3);
  assert.deepEqual(sheet.slice(1).map((line) => line[1]), ["addition", "error"]);
  assert.match(String(sheet[2][7]), /day\/month/);
  const flat = JSON.stringify(sheet);
  for (const sensitive of ["+92 3000000009", "asthma", "QA street"]) assert.ok(!flat.includes(sensitive), `${sensitive} must not be exported`);
});
