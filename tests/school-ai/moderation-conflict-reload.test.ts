import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1603: a moderation 409 reloads the panel so the next action uses the current version.
const src = readFileSync("src/components/school-ai/exam-moderation-panel.tsx", "utf8");
const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");

test("request errors carry their HTTP status", () => {
  assert.match(src, /throw Object\.assign\(new Error\(json\?\.error \|\| "Request failed"\), \{ status: response\?\.status \?\? 0 \}\)/);
});

test("a 409 reloads before reporting, other failures only report", () => {
  assert.match(src, /if \(\(e as \{ status\?: number \}\)\.status === 409\) \{\n\s*await load\(\);\n\s*setError\(`\$\{ui\(\(e as Error\)\.message\)\} \$\{ui\("The panel now shows the latest version\. Review it before acting again\."\)\}`\);\n\s*\} else setError\(ui\(\(e as Error\)\.message\)\);/);
  assert.match(src, /return false;\n\s*\}\n\s*\};/, "a failed mutation never reports success");
});

test("guidance is translated", () => {
  assert.match(messages, /\["The panel now shows the latest version\. Review it before acting again\.", "[^"]+", "[^"]+"\]/);
});
