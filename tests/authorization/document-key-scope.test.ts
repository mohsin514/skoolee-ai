import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesDocumentKey } from "../../src/lib/storage/document-key-scope";

test("private documents bind an exact authorized resource and campus", () => {
  assert.equal(matchesDocumentKey("student-docs/campus-a/student-a/document.pdf", "student-docs", "campus-a", "student-a"), true);
  for (const key of [
    "student-docs/campus-b/student-a/document.pdf",
    "student-docs/campus-a/student-b/document.pdf",
    "staff-docs/campus-a/student-a/document.pdf",
    "student-docs/campus-a/student-a/../document.pdf",
    "student-docs/campus-a/student-a/..",
    "student-docs/campus-a/student-a/",
    "student-docs/campus-a/student-a/document\\other.pdf",
    "student-docs/campus-a/student-a/document\n.pdf",
  ]) assert.equal(matchesDocumentKey(key, "student-docs", "campus-a", "student-a"), false, key);
});
