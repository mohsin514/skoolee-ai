import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { downloadPdfFile, isPdf } from "../src/lib/download";

// SKAI-1648: a 2xx HTML/JSON body is a failed download, never a saved .pdf.
const realFetch = globalThis.fetch;
let clicks = 0;
(globalThis as any).document = { createElement: () => ({ click: () => { clicks++; }, remove() {} }), body: { appendChild() {} } };
URL.createObjectURL = () => "blob:x"; URL.revokeObjectURL = () => undefined;
afterEach(() => { globalThis.fetch = realFetch; clicks = 0; });
const respond = (body: BodyInit, type: string) => { globalThis.fetch = (async () => new Response(body, { status: 200, headers: { "content-type": type } })) as typeof fetch; };

test("200 HTML is rejected with a sign-in hint", async () => {
  respond("<html>login</html>", "text/html");
  await assert.rejects(() => downloadPdfFile("/x", "a.pdf"), /Sign in again/);
  assert.equal(clicks, 0);
});

test("200 JSON error envelope is rejected with its message", async () => {
  respond(JSON.stringify({ success: false, error: "Invoice not found" }), "application/json");
  await assert.rejects(() => downloadPdfFile("/x", "a.pdf"), /Invoice not found/);
  assert.equal(clicks, 0);
});

test("a body without the PDF signature is rejected", async () => {
  respond("not a pdf", "application/octet-stream");
  await assert.rejects(() => downloadPdfFile("/x", "a.pdf"), /not a valid PDF/);
});

test("a real PDF is saved", async () => {
  respond("%PDF-1.7\n...", "application/pdf");
  await downloadPdfFile("/x", "a.pdf");
  assert.equal(clicks, 1);
  assert.equal(await isPdf(new Blob(["%PDF-1.4"])), true);
});
