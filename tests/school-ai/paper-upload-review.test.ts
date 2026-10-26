import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewedPaperSource, uploadedPaperInput } from "../../src/lib/school-ai/paper-upload-service";
import type { AiWorkspaceRecord } from "../../src/lib/school-ai/types";
import { redis } from "../../src/lib/queue/connection";

redis.disconnect();

const source = (data: Record<string, unknown> = {}): Pick<AiWorkspaceRecord, "kind" | "status" | "version" | "data"> => ({
  kind: "SOURCE", status: "DRAFT", version: 4,
  data: { documentKind: "paper", fileName: "paper.txt", mimeType: "text/plain", origin: "manual", extractionStatus: "manual", extractedText: "1. Name a plant. [1]", ...data },
});

test("paper upload pins the exact source version the user reviewed", () => {
  assert.equal(uploadedPaperInput.safeParse({ slotId: "slot" }).success, false);
  assert.equal(uploadedPaperInput.safeParse({ slotId: "slot", expectedSourceVersion: 4 }).success, true);
  assert.throws(() => reviewedPaperSource(source(), 3), { status: 409, code: "UPLOAD_SOURCE_STALE" });
});

test("manually transcribed and reviewed native text can create a draft without source approval", () => {
  assert.equal(reviewedPaperSource(source(), 4).extractedText, "1. Name a plant. [1]");
  assert.equal(reviewedPaperSource(source({ origin: "upload", extractionStatus: "extracted" }), 4).extractionStatus, "extracted");
});

test("an archived or differently classified source cannot become a paper", () => {
  assert.throws(() => reviewedPaperSource({ ...source(), status: "ARCHIVED" }, 4), { code: "UPLOAD_SOURCE_ARCHIVED" });
  assert.throws(() => reviewedPaperSource(source({ documentKind: "syllabus" }), 4), { code: "UPLOAD_NOT_A_PAPER" });
});

test("available OCR text remains blocked until its uncertainty has been reviewed", () => {
  for (const data of [
    { extractionStatus: "needs_review" },
    { extractionStatus: undefined },
    { extractionStatus: "extracted", uncertainties: ["The answer key is unclear."] },
  ]) assert.throws(() => reviewedPaperSource(source(data), 4), { code: "UPLOAD_SOURCE_REVIEW_REQUIRED" });
  assert.throws(() => reviewedPaperSource(source({ extractedText: " " }), 4), { code: "UPLOAD_NO_TEXT" });
});

test("pasting replacement text cannot bypass unresolved physical page evidence", () => {
  const structured = { extractionStatus: "extracted", extractedText: "1. Name a plant. [1]", expectedPageCount: 2, missingPages: [2], structureReviewed: true, sourcePages: [{ page: 1, text: "1. Name a plant. [1]", reviewed: true }] };
  assert.throws(() => reviewedPaperSource(source(structured), 4), { code: "UPLOAD_SOURCE_REVIEW_REQUIRED" });
  assert.throws(() => reviewedPaperSource(source({ ...structured, expectedPageCount: 1, missingPages: [], extractedText: "New pasted text" }), 4), { code: "UPLOAD_SOURCE_REVIEW_REQUIRED" });
  assert.doesNotThrow(() => reviewedPaperSource(source({ ...structured, expectedPageCount: 1, missingPages: [] }), 4));
});

test("every extracted region must be explicitly resolved before paper parsing", () => {
  const data = { extractionStatus: "extracted", extractedText: "1. Name a plant. [1]", expectedPageCount: 1, missingPages: [], structureReviewed: true, sourcePages: [{ page: 1, text: "1. Name a plant. [1]", reviewed: true, regions: [{ id: "region", kind: "TEXT", box: null, text: "plant", confidence: 0.4, needsReview: true, reviewed: false, issue: "Unclear word" }] }] };
  assert.throws(() => reviewedPaperSource(source(data), 4), { code: "UPLOAD_SOURCE_REVIEW_REQUIRED" });
  data.sourcePages[0].regions[0] = { ...data.sourcePages[0].regions[0], needsReview: false, reviewed: true };
  assert.doesNotThrow(() => reviewedPaperSource(source(data), 4));
});

test("manual fallback for a stored scan still requires physical page review", () => {
  for (const mimeType of ["image/png", "application/pdf"]) {
    const scan = source({ mimeType, storageKey: "school-ai/school/original", origin: "upload", extractionStatus: "extracted" });
    assert.throws(() => reviewedPaperSource(scan, 4), { code: "UPLOAD_SOURCE_REVIEW_REQUIRED" });
    scan.data = { ...scan.data, expectedPageCount: 1, sourcePages: [{ page: 1, text: String(scan.data.extractedText), reviewed: true }], missingPages: [], structureReviewed: true };
    assert.doesNotThrow(() => reviewedPaperSource(scan, 4));
  }
});
