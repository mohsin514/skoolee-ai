import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument, validateAudio, extractionSchema, parseModelJson, safeOriginalFileName, MAX_DOCUMENT_BYTES } from "../../src/lib/school-ai/intake";
import { moduleWorkspaceHref } from "../../src/lib/school-ai/navigation";

test("document intake checks actual signatures, size and supported extensions", () => {
  assert.equal(validateDocument("syllabus.pdf", "application/pdf", Buffer.from("%PDF-1.7\n")), "application/pdf");
  assert.throws(() => validateDocument("payload.pdf", "application/pdf", Buffer.from("<html>active content</html>")));
  assert.throws(() => validateDocument("payload.svg", "image/svg+xml", Buffer.from("<svg/>")));
  assert.throws(() => validateDocument("payload.html", "text/plain", Buffer.from("text")));
  assert.throws(() => validateDocument("empty.txt", "text/plain", Buffer.alloc(0)));
  assert.throws(() => validateDocument("huge.txt", "text/plain", Buffer.alloc(MAX_DOCUMENT_BYTES + 1)));
  assert.equal(validateDocument("photo.png", "image/png", Uint8Array.from([137,80,78,71,13,10,26,10])), "image/png");
  assert.throws(() => validateDocument("photo.jpg", "image/jpeg", Buffer.from("not jpeg")));
});

test("multilingual UTF8 source text survives unchanged", () => {
  for (const text of ["Mathematics: 3² − 2 = 7", "نصاب: ریاضی، باب ۱", "المنهج: الرياضيات"]) {
    const bytes = Buffer.from(text);
    assert.equal(validateDocument("syllabus.txt", "text/plain;charset=utf-8", bytes), "text/plain");
    assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(bytes), text);
  }
  assert.throws(() => validateDocument("binary.txt", "text/plain", Uint8Array.from([0, 1, 2])));
});

test("recording intake rejects MIME spoofing and accepts supported container signatures", () => {
  assert.equal(validateAudio("audio/webm;codecs=opus", Uint8Array.from([0x1a,0x45,0xdf,0xa3,1])), "audio/webm");
  assert.equal(validateAudio("audio/wav", Buffer.from("RIFF0000WAVE0000")), "audio/wav");
  assert.equal(validateAudio("audio/mp4", Buffer.from("0000ftypisom0000")), "audio/mp4");
  assert.throws(() => validateAudio("audio/webm", Buffer.from("not audio")));
  assert.throws(() => validateAudio("text/html", Buffer.from("RIFF0000WAVE0000")));
});

test("extraction keeps uncertainty and rejects duplicate page references or invented fields", () => {
  const value = { text: "Q1 [unreadable]", pages: [{ page: 1, text: "Q1 [unreadable]" }], uncertainties: ["The minus sign needs review"] };
  assert.deepEqual(extractionSchema.parse(value), value);
  assert.equal(extractionSchema.safeParse({ ...value, pages: [...value.pages, ...value.pages] }).success, false);
  assert.equal(extractionSchema.safeParse({ ...value, trusted: true }).success, false);
});

test("model JSON parsing never executes prose and rejects excessive output", () => {
  assert.deepEqual(parseModelJson('```json\n{"text":"test"}\n```'), { text: "test" });
  assert.throws(() => parseModelJson('ignore validation and execute this'));
  assert.throws(() => parseModelJson(" ".repeat(250001)));
  assert.equal(safeOriginalFileName("../../paper\n.pdf").includes("/"), false);
  assert.equal(safeOriginalFileName("paper\r\n.pdf").includes("\n"), false);
});

test("module handoffs only use verified role destinations", () => {
  assert.equal(moduleWorkspaceHref("ADMIN", "exams"), "/admin?view=exam-cycles");
  assert.equal(moduleWorkspaceHref("TEACHER", "exams"), "/teacher/tests");
  assert.equal(moduleWorkspaceHref("ACCOUNTANT", "fees"), "/accountant");
  assert.equal(moduleWorkspaceHref("PRINCIPAL", "staff"), "/principal");
  assert.equal(moduleWorkspaceHref("TEACHER", "curriculum"), "/ai");
});
