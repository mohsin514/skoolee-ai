import assert from "node:assert/strict";
import { test } from "node:test";
import { sendGate } from "../../src/components/chat/send-gate";
import { translateUi } from "../../src/lib/locale/ui-messages";

// SKAI-1444: a failed attachment blocks Send until it is retried or removed; the text draft survives. The
// Enter key and the Send button share this gate. The gate is pure, so the keyboard path is covered by the same
// function that submit() calls before it sends anything.
const ready = { name: "form.pdf", uploaded: { key: "k1" } };
const failed = { name: "photo.jpg", error: "Upload failed" };
const uploading = { name: "scan.png" };

test("text only sends", () => {
  assert.deepEqual(sendGate({ text: "Hello", files: [], isSending: false, editing: false }), { canSend: true, blockedBy: null, failedNames: [] });
});

test("empty text with no file cannot send", () => {
  assert.equal(sendGate({ text: "   ", files: [], isSending: false, editing: false }).canSend, false);
});

test("a failed attachment blocks Send even with text, and names the file", () => {
  const gate = sendGate({ text: "Please see the attached permission form.", files: [failed], isSending: false, editing: false });
  assert.equal(gate.canSend, false);
  assert.equal(gate.blockedBy, "failed");
  assert.deepEqual(gate.failedNames, ["photo.jpg"]);
});

test("a failed attachment blocks Send with no text too", () => {
  assert.equal(sendGate({ text: "", files: [failed], isSending: false, editing: false }).canSend, false);
});

test("a retrying attachment is still uploading and blocks Send", () => {
  const gate = sendGate({ text: "Hi", files: [uploading], isSending: false, editing: false });
  assert.equal(gate.canSend, false);
  assert.equal(gate.blockedBy, "uploading");
});

test("removing the failed chip restores Send for the text and any ready file", () => {
  assert.equal(sendGate({ text: "Hi", files: [], isSending: false, editing: false }).canSend, true, "removed: text-only");
  assert.equal(sendGate({ text: "Hi", files: [ready], isSending: false, editing: false }).canSend, true, "ready file");
});

test("a retry that succeeds unblocks Send", () => {
  assert.equal(sendGate({ text: "Hi", files: [ready], isSending: false, editing: false }).canSend, true);
});

test("a send in progress cannot be sent again", () => {
  assert.equal(sendGate({ text: "Hi", files: [], isSending: true, editing: false }).canSend, false);
});

test("editing an existing message ignores attachment state", () => {
  const gate = sendGate({ text: "Corrected", files: [failed], isSending: false, editing: true });
  assert.equal(gate.canSend, true);
  assert.deepEqual(gate.failedNames, []);
});

test("the failed-attachment hint translates into Arabic and Urdu, and stays English otherwise", () => {
  const source = "Retry or remove {0} to send. Your message draft is still here.";
  assert.equal(translateUi(source, "en"), source);
  assert.notEqual(translateUi(source, "ar"), source);
  assert.notEqual(translateUi(source, "ur"), source);
  assert.match(translateUi(source, "ar"), /\{0\}/u, "the file name placeholder survives translation");
  assert.match(translateUi(source, "ur"), /\{0\}/u);
});
