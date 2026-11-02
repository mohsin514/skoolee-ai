import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1650: every official PDF carries a meaningful title plus creator/producer metadata.
const files = { "report card": "src/lib/academic/pdf.tsx", "final grades": "src/lib/pdf.tsx", "invoice and receipt": "src/lib/locale/invoice-pdf.tsx" };
for (const [name, file] of Object.entries(files)) {
  test(`${name} PDF sets document metadata`, () => {
    const docs = readFileSync(file, "utf8").match(/<Document [^>]*>/g) ?? [];
    assert.ok(docs.length > 0);
    for (const doc of docs) assert.match(doc, /title=\{[^}]+\}[^>]*creator="SkooleeAI" producer="SkooleeAI"/);
  });
}
