import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/family/family-digest.tsx", "utf8");
const act = source.slice(source.indexOf("const act = async"), source.indexOf("const openEdit"));

test("SKAI-1455: a failed refresh after a confirmed PATCH never says the change was not saved", () => {
  const patch = act.indexOf('"PATCH"'), success = act.indexOf("toast.success("), notSaved = act.indexOf("The change was not saved.");
  assert.ok(notSaved < success, "the not-saved message belongs to the PATCH failure only");
  assert.ok(patch < notSaved);
  assert.match(act.slice(success), /try \{ await refresh\(digest\.id\); \} catch \{ toast\.error\(ui\("Saved, but the latest version could not be loaded/);
  assert.match(act.slice(success), /return true;/);
});

test("SKAI-1455: the refresh after a failed PATCH cannot throw out of the handler", () => {
  assert.match(act, /await refresh\(digest\.id\)\.catch\(\(\) => undefined\)/);
});

test("SKAI-1455: the new message is translated for Arabic and Urdu", () => {
  const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");
  assert.match(messages, /\["Saved, but the latest version could not be loaded\. Refresh the update to see it\.", "[^"]+", "[^"]+"\]/);
});
