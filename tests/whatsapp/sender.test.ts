import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mockGraph, setGraphAdapter, type GraphAdapter } from "../../src/lib/whatsapp/graph";
import { sendWhatsAppMessage } from "../../src/lib/whatsapp/client";
import { buildCsp } from "../../src/lib/security/csp-policy";

// SKAI-1045: the send path goes through the Graph adapter; no test reaches Meta.
afterEach(() => setGraphAdapter(null));

test("sending uses the adapter (legacy platform number when no school is given)", async () => {
  const calls: { phoneNumberId: string; payload: Record<string, unknown> }[] = [];
  const fake: GraphAdapter = { ...mockGraph, async sendMessage(phoneNumberId, _token, payload) { calls.push({ phoneNumberId, payload }); return { success: true, messageId: "wamid.1" }; } };
  setGraphAdapter(fake);
  process.env.WHATSAPP_PHONE_NUMBER_ID = "999"; process.env.WHATSAPP_ACCESS_TOKEN = "t";
  try {
    const result = await sendWhatsAppMessage({ to: "923001234567", text: "Hello", pdfUrl: "https://example.test/r.pdf" });
    assert.deepEqual(result, { success: true, messageId: "wamid.1" });
    assert.deepEqual(calls.map(c => [c.phoneNumberId, c.payload.type]), [["999", "text"], ["999", "document"]]);
  } finally { delete process.env.WHATSAPP_PHONE_NUMBER_ID; delete process.env.WHATSAPP_ACCESS_TOKEN; }
});

test("no sender configured fails closed without calling Meta", async () => {
  setGraphAdapter({ ...mockGraph, async sendMessage() { throw new Error("must not be called"); } });
  assert.deepEqual(await sendWhatsAppMessage({ to: "923001234567", text: "Hello" }), { success: false, error: "WhatsApp credentials are not configured" });
});

test("CSP admits the Facebook SDK only when a Meta app is configured", () => {
  assert.ok(!buildCsp({ nonce: "n", isProd: true, env: {} as NodeJS.ProcessEnv }).includes("facebook"));
  const csp = buildCsp({ nonce: "n", isProd: true, env: { META_APP_ID: "1" } as unknown as NodeJS.ProcessEnv });
  assert.match(csp, /script-src[^;]*https:\/\/connect\.facebook\.net/);
  assert.match(csp, /frame-src[^;]*https:\/\/www\.facebook\.com/);
});
