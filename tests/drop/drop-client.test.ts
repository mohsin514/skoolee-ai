import { test } from "node:test";
import assert from "node:assert/strict";
import { dropTypesFor, fileMatchesAccept } from "../../src/lib/drop/client";

// SKAI-1848: the phone may only send what the page's own file input accepts.
test("phone types follow the input's accept list", () => {
  assert.deepEqual(dropTypesFor("image/*"), ["image/jpeg", "image/png", "image/webp"]);
  assert.deepEqual(dropTypesFor(".pdf,.jpg"), ["image/jpeg", "application/pdf"]);
  assert.deepEqual(dropTypesFor("application/pdf,image/png"), ["image/png", "application/pdf"]);
  assert.deepEqual(dropTypesFor("audio/*"), []);
  assert.equal(dropTypesFor("").length, 8);
});

test("dropped, pasted and phone files are checked against accept", () => {
  assert.equal(fileMatchesAccept({ name: "Scan.JPG", type: "image/jpeg" }, "image/*"), true);
  assert.equal(fileMatchesAccept({ name: "notes.pdf", type: "application/pdf" }, "image/*"), false);
  assert.equal(fileMatchesAccept({ name: "notes.pdf", type: "" }, ".pdf,.docx"), true);
  assert.equal(fileMatchesAccept({ name: "evil.svg", type: "image/svg+xml" }, "image/png,image/jpeg"), false);
  assert.equal(fileMatchesAccept({ name: "anything.bin", type: "" }, ""), true);
});
