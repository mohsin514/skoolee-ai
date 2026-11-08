import assert from "node:assert/strict";
import { test } from "node:test";
import { SOURCE_POLL_LIMIT, sourceExtractionState } from "../../src/lib/school-ai/source-extraction-state";
import { syllabusSourceIssue } from "../../src/lib/school-ai/syllabus-source";
import type { SourceData } from "../../src/lib/school-ai/types";

test("source polling stops for ready/failed/missing jobs and at its bound, including duplicate intake resumes", () => {
  const job = { kind: "EXTRACT" as const, recordVersion: 2, status: "PROCESSING" as const };
  assert.equal(sourceExtractionState(2, [job], 1), "waiting");
  assert.equal(sourceExtractionState(2, [job], SOURCE_POLL_LIMIT), "attention");
  assert.equal(sourceExtractionState(2, [{ ...job, status: "READY" }], 1), "review");
  assert.equal(sourceExtractionState(2, [{ ...job, status: "FAILED" }], 1), "attention");
  assert.equal(sourceExtractionState(2, [{ ...job, status: "CANCELLED" }], 1), "attention");
  assert.equal(sourceExtractionState(2, [], 1), "attention");
  assert.equal(sourceExtractionState(2, [{ ...job, kind: "DELETE_ORIGINAL" }], 1), "attention");
  assert.equal(sourceExtractionState(3, [job], 1), "attention", "an older extraction cannot restart polling for corrected text");
});

test("syllabus-only outline boundary requires reviewed physical evidence, even with a cached outline", () => {
  const plain: SourceData = { documentKind: "syllabus", extractedText: "Unit 1\n1.1 Add numbers", fileName: "manual.txt", mimeType: "text/plain", extractionStatus: "manual" };
  assert.equal(syllabusSourceIssue(plain), null);
  assert.equal(syllabusSourceIssue({ ...plain, documentKind: "paper" }), "OUTLINE_NOT_SYLLABUS");
  assert.equal(syllabusSourceIssue({ ...plain, documentKind: "answer_script" }), "OUTLINE_NOT_SYLLABUS");
  assert.equal(syllabusSourceIssue({ ...plain, extractionStatus: "needs_review" }), "OUTLINE_REVIEW_REQUIRED");
  assert.equal(syllabusSourceIssue({ ...plain, uncertainties: ["Unclear symbol"] }), "OUTLINE_REVIEW_REQUIRED");
  const structured: SourceData = { ...plain, extractionStatus: "extracted", expectedPageCount: 2, missingPages: [1], structureReviewed: false, sourcePages: [{ page: 2, text: plain.extractedText, reviewed: false, regions: [{ id: "unclear", kind: "TEXT", box: null, text: "Add", confidence: null, reviewed: false, needsReview: true, issue: "Check symbol" }] }] };
  assert.equal(syllabusSourceIssue(structured), "OUTLINE_REVIEW_REQUIRED");
  const page = { ...structured.sourcePages![0], page: 1, reviewed: true, regions: [{ ...structured.sourcePages![0].regions![0], reviewed: true, needsReview: false }] };
  const reviewed = { ...structured, expectedPageCount: 1, missingPages: [], structureReviewed: true, sourcePages: [page] };
  assert.equal(syllabusSourceIssue(reviewed), null);
  assert.equal(syllabusSourceIssue({ ...reviewed, extractedText: "Different text" }), "OUTLINE_REVIEW_REQUIRED");
  assert.equal(syllabusSourceIssue({ ...plain, mimeType: "image/png", storageKey: "school-ai/synthetic/test.png" }), "OUTLINE_REVIEW_REQUIRED");
});
