import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateUi } from "@/lib/locale/ui-messages";

const source = readFileSync("src/components/exams/family-exam-brief.tsx", "utf8");
const ack = source.slice(source.indexOf("const acknowledge = async"), source.indexOf("if (loadFailed && !briefs?.length)"));

test("SKAI-1519: a rejected acknowledgement fetch clears busy and shows a retryable error", () => {
  assert.match(ack, /try \{ response = await fetch\(`\/api\/parent\/exam-brief\$\{query\}`/);
  assert.match(ack, /catch \{ setError\(ui\("Could not record your acknowledgement\. Please try again\."\)\); return; \}/);
  assert.match(ack, /finally \{ setBusy\(""\); \}/);
});

test("SKAI-1519: the error message is translated for Arabic and Urdu", () => {
  const message = "Could not record your acknowledgement. Please try again.";
  for (const language of ["ar", "ur"] as const) assert.notEqual(translateUi(message, language), message, language);
});
