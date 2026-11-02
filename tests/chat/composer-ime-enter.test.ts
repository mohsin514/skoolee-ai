import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1605: Enter while an IME is composing never sends or saves.
test("the composer ignores Enter during composition, including legacy keyCode 229", () => {
  const src = readFileSync("src/components/chat/composer.tsx", "utf8");
  assert.match(src, /if \(e\.key === "Enter" && !e\.shiftKey && !e\.nativeEvent\.isComposing && e\.nativeEvent\.keyCode !== 229\) \{\n\s*e\.preventDefault\(\);\n\s*submit\(\);/);
  assert.doesNotMatch(src, /if \(e\.key === "Enter" && !e\.shiftKey\) \{/);
});
