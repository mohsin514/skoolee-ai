import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1602: chat filter and conversation-type controls are toggle groups, not half-implemented tablists.
for (const [file, selected] of [["src/components/chat/conversation-list.tsx", "filter === f.value"], ["src/components/chat/new-conversation-dialog.tsx", "mode === m"]] as const) {
  test(`${file} exposes a labelled group of pressed buttons`, () => {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /role="tablist"|role="tab"/);
    assert.match(source, /role="group"\s+aria-label=/);
    assert.ok(source.includes(`aria-pressed={${selected}}`));
  });
}
