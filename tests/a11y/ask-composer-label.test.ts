import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1003 live axe (label-title-only, /ai): the Ask field was named only through
// aria-labelledby plus aria-describedby, which axe reports as "only title used".
// A visually hidden <Label htmlFor> now carries the same name.
test("the Ask field has a real label bound to its id", () => {
  const src = readFileSync("src/components/ai-workflows/ask-composer.tsx", "utf8");
  const id = src.match(/<Label htmlFor=\{(\w+)\} className="sr-only">/)?.[1];
  assert.ok(id, "renders a visually hidden Label");
  assert.match(src, new RegExp(`<Textarea[\\s\\S]{0,200}?\\bid=\\{${id}\\}`));
});
