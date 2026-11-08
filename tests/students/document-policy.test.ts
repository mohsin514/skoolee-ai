import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkStudentDocumentFile, cleanStudentDocumentName, isStudentDocumentKind, studentDocumentContentType, STUDENT_DOCUMENT_MAX_BYTES } from "../../src/lib/students/document-policy";
import { matchesDocumentKey } from "../../src/lib/storage/document-key-scope";

test("SKAI-165: supported formats pass, including a blank browser type for .docx", () => {
  assert.equal(checkStudentDocumentFile({ name: "birth.pdf", type: "application/pdf", size: 1 }), null);
  assert.equal(checkStudentDocumentFile({ name: "photo.JPG", type: "image/jpeg", size: 2048 }), null);
  assert.equal(studentDocumentContentType({ name: "tc.docx", type: "" }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
});

test("SKAI-165: unsupported, disguised, empty and oversized files are rejected", () => {
  assert.equal(checkStudentDocumentFile({ name: "run.exe", type: "application/octet-stream", size: 10 }), "unsupported_type");
  assert.equal(checkStudentDocumentFile({ name: "page.html", type: "text/html", size: 10 }), "unsupported_type");
  assert.equal(checkStudentDocumentFile({ name: "fake.pdf", type: "text/html", size: 10 }), "unsupported_type");
  assert.equal(checkStudentDocumentFile({ name: "blank.pdf", type: "application/pdf", size: 0 }), "empty");
  assert.equal(checkStudentDocumentFile({ name: "max.pdf", type: "application/pdf", size: STUDENT_DOCUMENT_MAX_BYTES }), null);
  assert.equal(checkStudentDocumentFile({ name: "big.pdf", type: "application/pdf", size: STUDENT_DOCUMENT_MAX_BYTES + 1 }), "too_large");
});

test("SKAI-165: names lose paths and unsafe characters, stay bounded and keep the extension", () => {
  assert.equal(cleanStudentDocumentName("C:\\fakepath\\../evil<script>.pdf"), "evil_script_.pdf");
  const long = cleanStudentDocumentName(`${"a".repeat(300)}.pdf`);
  assert.equal(long.length, 120);
  assert.ok(long.endsWith(".pdf"));
  assert.ok(isStudentDocumentKind("PHOTO"));
  assert.ok(!isStudentDocumentKind("PASSPORT"));
});

test("SKAI-165: storage keys bind to one campus and one student", () => {
  assert.ok(matchesDocumentKey("student-docs/campus-a/student-1/x.pdf", "student-docs", "campus-a", "student-1"));
  assert.ok(!matchesDocumentKey("student-docs/campus-b/student-1/x.pdf", "student-docs", "campus-a", "student-1"));
  assert.ok(!matchesDocumentKey("student-docs/campus-a/student-2/x.pdf", "student-docs", "campus-a", "student-1"));
  assert.ok(!matchesDocumentKey("student-docs/campus-a/student-1/../x.pdf", "student-docs", "campus-a", "student-1"));
});

test("SKAI-165: the record route is staff-gated, scoped, validated and idempotent", () => {
  const route = readFileSync("src/app/api/students/documents/route.ts", "utf8");
  assert.match(route, /assertModuleRead\(user, "students"\)/);
  assert.match(route, /assertPermission\(user, "students", "edit"\)/);
  assert.match(route, /studentScope\(user\)/);
  assert.match(route, /studentDocumentContentType\(\{ name: safeName \}\)/);
  assert.match(route, /findFirst\(\{ where: \{ studentId: student\.id, fileKey \}/);
  // A student in another school or campus is a 404 on list, not an empty 200.
  assert.match(route, /where: \{ id: studentId, \.\.\.studentScope\(user\) \}, select: \{ id: true \} \}\);\n    if \(!student\) throw new ApiError\("Student not found", 404\)/);
});
