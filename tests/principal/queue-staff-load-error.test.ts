import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/principal/action-queue.tsx", "utf8");

test("SKAI-1468: the staff load checks HTTP and application success", () => {
  const load = source.slice(source.indexOf("const loadStaff = useCallback"), source.indexOf("useEffect(() => { void loadStaff(); }"));
  assert.match(load, /if \(!response\.ok \|\| !json\.success \|\| !Array\.isArray\(json\.data\)\) throw/);
  assert.match(load, /catch \{ setStaffFailed\(true\); \}/);
  assert.doesNotMatch(source, /\.catch\(\(\) => undefined\); \}, \[scope\]\)/);
});

test("SKAI-1468: a failed staff load shows an inline error with Retry", () => {
  assert.match(source, /\{staffFailed \? <Alert tone="danger" compact data-staff-load-error>\{ui\("The staff list could not be loaded\."\)\}.*onClick=\{\(\) => void loadStaff\(\)\}>\{ui\("Retry"\)\}/);
  const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");
  assert.match(messages, /\["The staff list could not be loaded\.", "[^"]+", "[^"]+"\]/);
});
