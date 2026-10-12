import test from "node:test";
import assert from "node:assert/strict";
import { parseImportCsv } from "../../src/lib/imports/csv";
import { importReviewToken } from "../../src/lib/imports/review-token";
import { mapRosterCsv, parseRosterSource, suggestRosterMapping, RosterMappingError } from "../../src/lib/school-ai/roster-import";

test("Arabic and Urdu roster headings map only exact known fields and preserve quoted multilingual values", () => {
  const source = parseRosterSource('نام,رول نمبر,سرپرست کا فون,پتہ,شہر,طبی معلومات,جنس\n"علی، احمد",R-8,03000000000,"12, Main Road",کراچی,معلوم نہیں,لڑکا');
  const mapping = suggestRosterMapping(source.headers);
  const rows = parseImportCsv(mapRosterCsv(source, mapping));
  assert.deepEqual(rows[0], ["fullName", "rollNo", "guardianPhone", "address", "city", "medicalNotes", "gender"]);
  assert.equal(rows[1][0], "علی، احمد"); assert.equal(rows[1][3], "12, Main Road"); assert.equal(rows[1][5], "معلوم نہیں"); assert.equal(rows[1][6], "MALE");
  assert.deepEqual(suggestRosterMapping(["اسم الطالب", "رقم الطالب", "هاتف ولي الأمر"]), { fullName: 0, rollNo: 1, guardianPhone: 2 });
});

test("ambiguous aliases and missing sensitive facts require explicit correction", () => {
  assert.deepEqual(suggestRosterMapping(["name", "studentName", "Maybe the pupil", "Health guess"]), {});
  const source = parseRosterSource("name,rollNo,guardianPhone,address,city,medicalNotes\nOne,1,123,Street,City,");
  const mapping = suggestRosterMapping(source.headers);
  assert.equal(parseImportCsv(mapRosterCsv(source, mapping))[1][5], ""); // No guessed 'None'.
  assert.throws(() => mapRosterCsv(source, { ...mapping, medicalNotes: undefined }), (error) => error instanceof RosterMappingError && error.code === "required");
  assert.throws(() => mapRosterCsv(source, { ...mapping, medicalNotes: mapping.city }), (error) => error instanceof RosterMappingError && error.code === "mapping");
  assert.throws(() => mapRosterCsv(source, { ...mapping, medicalNotes: 90 }), RosterMappingError);
});

test("malformed, oversized or ambiguous roster sources are rejected before staging", () => {
  for (const text of ["Name,name\nOne,Two", "name,rollNo\nOne", 'name,rollNo\n"One,2', "name,rollNo\nOne,\u0000"]) assert.throws(() => parseRosterSource(text), RosterMappingError);
  assert.throws(() => parseRosterSource(`Name\n${"One\n".repeat(1001)}`), (error) => error instanceof RosterMappingError && error.code === "rows");
  assert.throws(() => parseRosterSource(`Name\n${"x".repeat(4001)}`), (error) => error instanceof RosterMappingError && error.code === "format");
});

test("import review tokens bind exact selections and scope with canonical JSON ordering", () => {
  const batch = { id: "batch", campusId: "campus-a", state: "STAGED", expiresAt: new Date("2026-10-20T00:00:00Z"), data: { rows: [{ name: "One", selected: true }], metadata: { defaultClassId: "class-a" } } };
  const token = importReviewToken(batch);
  assert.equal(token, importReviewToken({ ...batch, data: { metadata: { defaultClassId: "class-a" }, rows: [{ selected: true, name: "One" }] } }));
  assert.notEqual(token, importReviewToken({ ...batch, campusId: "campus-b" }));
  assert.notEqual(token, importReviewToken({ ...batch, data: { ...batch.data, rows: [{ name: "One", selected: false }] } }));
  assert.notEqual(token, importReviewToken({ ...batch, expiresAt: new Date("2026-10-21T00:00:00Z") }));
});
