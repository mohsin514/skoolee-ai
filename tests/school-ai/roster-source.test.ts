import { test } from "node:test";
import assert from "node:assert/strict";
import { rosterFromReviewedSource } from "../../src/lib/school-ai/roster-source";
import type { SourceData } from "../../src/lib/school-ai/types";
const csv: SourceData = { documentKind: "register", mimeType: "text/csv", fileName: "students.csv", extractedText: 'name,rollNo\n"Ali, Ahmed",1' };
test("reviewed CSV preserves quoted names", () => {
  assert.deepEqual(rosterFromReviewedSource(csv).rows, [["Ali, Ahmed", "1"]]);
});
const document = (): SourceData => ({ ...csv, mimeType: "application/pdf", extractedText: "page", expectedPageCount: 1, structureReviewed: true, sourcePages: [{ page: 1, text: "page", reviewed: true, regions: [{ id: "table", kind: "TABLE", box: null, text: "page", confidence: 1, needsReview: false, reviewed: true, issue: "", table: { rows: [["name", "rollNo"], ["فاطمہ", "2"]] } }] }] });
test("reviewed AI table becomes a roster without inventing missing data", () => {
  assert.deepEqual(rosterFromReviewedSource(document()), { headers: ["name", "rollNo"], rows: [["فاطمہ", "2"]] });
});
test("missing pages, unresolved OCR and unrelated documents block imports", () => {
  assert.throws(() => rosterFromReviewedSource({ ...document(), missingPages: [2], expectedPageCount: 2 }));
  assert.throws(() => rosterFromReviewedSource({ ...document(), structureReviewed: false }));
  assert.throws(() => rosterFromReviewedSource({ ...csv, documentKind: "staff_list" }));
  const value = document(); value.sourcePages![0].regions![0].needsReview = true;
  assert.throws(() => rosterFromReviewedSource(value));
});
test("mismatched tables cannot silently merge different record types", () => {
  const value = document(); const region = value.sourcePages![0].regions![0];
  value.sourcePages![0].regions!.push({ ...region, id: "second", table: { rows: [["subject", "teacher"], ["Math", "Sara"]] } });
  assert.throws(() => rosterFromReviewedSource(value));
});
