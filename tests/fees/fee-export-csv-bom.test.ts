import assert from "node:assert/strict";
import { test } from "node:test";
import { exportCSV } from "../../src/components/fees/fee-utils";

// SKAI-2147: fee CSV exports must start with the UTF-8 BOM so Excel shows Urdu names correctly.
test("exportCSV output starts with the UTF-8 BOM and keeps Urdu text", async () => {
  const g = globalThis as any;
  const origUrl = g.URL.createObjectURL;
  const origRevoke = g.URL.revokeObjectURL;
  const origDoc = g.document;
  let captured: Blob | undefined;
  g.URL.createObjectURL = (b: Blob) => { captured = b; return "blob:test"; };
  g.URL.revokeObjectURL = () => {};
  g.document = { createElement: () => ({ click() {} }) };
  try {
    exportCSV([{ Student: "S4T15 علی خان", Amount: 1000 }], "defaulters-test");
  } finally {
    g.URL.createObjectURL = origUrl;
    g.URL.revokeObjectURL = origRevoke;
    g.document = origDoc;
  }
  assert.ok(captured);
  const bytes = new Uint8Array(await captured!.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
  const text = new TextDecoder().decode(bytes.slice(3));
  assert.ok(text.startsWith("Student,Amount"));
  assert.ok(text.includes("علی خان"));
});
