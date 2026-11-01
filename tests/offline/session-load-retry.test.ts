import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateUi } from "@/lib/locale/ui-messages";

const source = readFileSync("src/components/offline/offline-register.tsx", "utf8");
const loader = source.slice(source.indexOf("const loadSession = useCallback"), source.indexOf("const persist = useCallback("));
const message = "The offline register could not be loaded. Check your connection and try again.";

test("SKAI-1520: non-2xx, malformed JSON, missing user and network failure all mark the session failed", () => {
  assert.match(loader, /if \(!response\.ok \|\| !j\?\.user\?\.id \|\| !j\.user\.schoolId\) throw/);
  assert.match(loader, /\} catch \{ setSessionFailed\(true\); \}/);
  assert.doesNotMatch(loader, /catch\(\(\) => undefined\)/);
});

test("SKAI-1520: the failed state shows a translated error with Retry instead of the endless skeleton", () => {
  assert.ok(source.indexOf("&& sessionFailed) return <Alert") < source.indexOf('label={ui("Loading the latest register…")}'));
  assert.match(source, /onClick=\{\(\) => void loadSession\(\)\}>\{ui\("Try again"\)\}/);
  for (const language of ["ar", "ur"] as const) assert.notEqual(translateUi(message, language), message, language);
});

test("SKAI-1520: a successful retry reads the existing device bucket, keeping queued operations", () => {
  assert.match(loader, /setBucket\(load\(j\.user\.id, j\.user\.schoolId\)\)/);
});
