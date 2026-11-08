import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desk = readFileSync("src/components/admissions/admissions-desk.tsx", "utf8");
const tabs = readFileSync("src/components/ui/view-tabs.tsx", "utf8");

test("SKAI-1777: the Admissions workspaces use the shared ViewTabs tablist", () => {
  assert.doesNotMatch(desk, /role="tablist"/, "no hand-rolled click-only tablist");
  assert.doesNotMatch(desk, /role="tab"/);
  assert.match(desk, /<ViewTabs ariaLabel="Admissions" value=\{tab\} onChange=\{value => setTab\(value === "forms" \? "forms" : "applications"\)\} items=\{\[\{ id: "applications", label: "Applications" \}, \{ id: "forms", label: "Application forms" \}\]\} \/>/);
});

test("SKAI-1777: ViewTabs gives one tabbable tab, arrow keys mirrored for RTL, and Home/End", () => {
  assert.match(tabs, /tabIndex=\{active \? 0 : -1\}/);
  assert.match(tabs, /const forward = rtl \? "ArrowLeft" : "ArrowRight";/);
  assert.match(tabs, /const backward = rtl \? "ArrowRight" : "ArrowLeft";/);
  assert.match(tabs, /else if \(event\.key === "Home"\) next = 0;/);
  assert.match(tabs, /else if \(event\.key === "End"\) next = visible\.length - 1;/);
  assert.match(tabs, /onClick=\{\(\) => onChange\(item\.id\)\}/, "pointer and Enter/Space activation preserved");
});
