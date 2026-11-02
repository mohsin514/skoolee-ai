import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateUi } from "@/lib/locale/ui-messages";

const source = readFileSync("src/components/family/family-requests.tsx", "utf8");
const confirm = source.slice(source.indexOf("const confirm = async () => {\n    if (!review) return;"), source.indexOf("if (loadFailed) return <section className=\"sk-panel p-5\" data-guardian-trips>"));

test("SKAI-1518: a network rejection on trip permission shows 'not recorded' in the review dialog", () => {
  assert.match(confirm, /\} catch \{[\s\S]*?setError\(ui\("Your answer was not recorded\."\)\);[\s\S]*?\} finally \{ setBusy\(false\); \}/);
  assert.match(source, /\{error \? <Alert tone="danger" compact data-trip-review-error>\{error\}<\/Alert> : null\}/);
});

test("SKAI-1518: the failed attempt keeps the review and its idempotency key for a safe retry", () => {
  const failure = confirm.slice(confirm.indexOf("} catch {"), confirm.indexOf("} finally"));
  assert.doesNotMatch(failure, /clearReview\(\)/);
  assert.match(confirm, /idempotencyKey: review\.key/);
});

test("SKAI-1518: the message is translated for Arabic and Urdu", () => {
  for (const language of ["ar", "ur"] as const) assert.notEqual(translateUi("Your answer was not recorded.", language), "Your answer was not recorded.", language);
});
