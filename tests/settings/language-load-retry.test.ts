import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/settings/PersonalLanguageSetting.tsx", "utf8");

test("SKAI-1475: a transient language load failure is not reported as an expired session", () => {
  const load = source.slice(source.indexOf("const load = useCallback"), source.indexOf("async function change"));
  assert.match(load, /failure\.message === "permission" \? "permission" : "load"/);
  assert.doesNotMatch(load, /\.catch\(\(\) => \{ if \(active\) setError\("permission"\); \}\)/);
});

test("SKAI-1475: the load error offers a keyboard-reachable Try again that re-runs the request", () => {
  assert.match(source, /error === "load" \? t\("Couldn't load your language settings\."\)/);
  // The retry is the shared Button (design-system adoption): a real <button>, so it stays keyboard-reachable.
  assert.match(source, /<Button type="button" variant="link" className="sk-link[^"]*font-semibold" onClick=\{\(\) => load\(\)\} data-language-retry>\{t\("Try again"\)\}<\/Button>/);
  const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");
  assert.match(messages, /\["Couldn't load your language settings\.", "[^"]+", "[^"]+"\]/);
});
