import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesFileSignature } from "../../src/lib/storage/file-signature";

const b = (...parts: (string | number[])[]) => Buffer.concat(parts.map(p => typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p)));
const zip = (...names: string[]) => b([0x50, 0x4b, 0x03, 0x04], ...names);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

test("a genuine signature is accepted for every private-upload type", () => {
  const samples: [string, Buffer][] = [
    ["image/jpeg", b([0xff, 0xd8, 0xff, 0xe0])], ["image/png", b([137, 80, 78, 71, 13, 10, 26, 10])],
    ["image/webp", b("RIFF\x10\0\0\0WEBPVP8 ")], ["image/gif", b("GIF89a")], ["image/gif", b("GIF87a")],
    ["application/pdf", b("%PDF-1.7\n")], ["application/msword", b(OLE)], ["application/vnd.ms-excel", b(OLE)],
    [DOCX, zip("[Content_Types].xml", "word/document.xml")], [XLSX, zip("[Content_Types].xml", "xl/workbook.xml")],
    ["text/plain", Buffer.from("Synthetic note — ملاحظة — نوٹ", "utf8")], ["text/plain; charset=utf-8", Buffer.from("ok")],
  ];
  for (const [mime, bytes] of samples) assert.equal(matchesFileSignature(mime, bytes, { strictText: true }), true, mime);
});

test("renamed executables and HTML disguised as PDF, PNG or Office are rejected", () => {
  const exe = b("MZ\x90\0\x03\0\0\0"), html = b("<!doctype html><script>alert(1)</script>");
  for (const mime of ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", DOCX, "application/msword"]) {
    assert.equal(matchesFileSignature(mime, exe), false, `exe as ${mime}`);
    assert.equal(matchesFileSignature(mime, html), false, `html as ${mime}`);
  }
  assert.equal(matchesFileSignature(DOCX, zip("[Content_Types].xml", "xl/workbook.xml")), false, "xlsx as docx");
  assert.equal(matchesFileSignature(XLSX, zip("payload.exe")), false, "plain zip as xlsx");
  assert.equal(matchesFileSignature("image/svg+xml", b("<svg/>")), false, "unsupported type");
});

test("empty files are rejected for every type", () => {
  for (const mime of ["application/pdf", "image/png", "text/plain", DOCX]) assert.equal(matchesFileSignature(mime, new Uint8Array(0), { strictText: true }), false, mime);
});

test("text with NUL bytes or invalid UTF-8 is rejected for private uploads", () => {
  assert.equal(matchesFileSignature("text/plain", b("abc", [0], "def"), { strictText: true }), false);
  assert.equal(matchesFileSignature("text/plain", b([0xc3, 0x28]), { strictText: true }), false);
  assert.equal(matchesFileSignature("text/plain", b([0xc3, 0x28])), true, "intake's lenient rule is unchanged");
  assert.equal(matchesFileSignature("text/plain", b("a", [0])), false);
});
