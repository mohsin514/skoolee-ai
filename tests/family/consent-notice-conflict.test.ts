import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1551: a 409 notice-version conflict reloads the current notice and clears the old answers.
const ui = readFileSync("src/components/family/guardian-consent.tsx", "utf8");
const submit = ui.slice(ui.indexOf("const submit = async"), ui.indexOf("return (", ui.indexOf("const submit = async")));

test("409 clears choices and reloads before reporting", () => {
  assert.match(submit, /if \(response\.status === 409\) \{ setChoices\(\{\}\); await load\(\); \}/);
  assert.ok(submit.indexOf("response.status === 409") < submit.indexOf("throw new Error(json.error"));
});
