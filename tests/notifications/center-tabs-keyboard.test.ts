import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { arrowSelect } from "../../src/components/ui/choice-card";

// SKAI-1767: the Notification Center tablist follows the WAI-ARIA tabs keyboard pattern.
const TABS = [{ value: "all", label: "All" }, { value: "mentions", label: "Mentions" }, { value: "actions", label: "Needs you" }];

function press(key: string, value: string, dir: "ltr" | "rtl") {
  const focused: string[] = [], picked: string[] = [];
  let prevented = false;
  (globalThis as Record<string, unknown>).getComputedStyle = () => ({ direction: dir });
  (globalThis as Record<string, unknown>).CSS = { escape: (s: string) => s };
  const currentTarget = { querySelector: (sel: string) => ({ focus: () => focused.push(sel) }) };
  arrowSelect({ key, currentTarget, preventDefault: () => { prevented = true; } } as never, TABS, value, v => picked.push(v));
  return { picked: picked[0], focused: focused[0], prevented };
}

test("EN: Right/Left move and wrap, Home/End reach the ends, focus follows", () => {
  assert.equal(press("ArrowRight", "all", "ltr").picked, "mentions");
  assert.equal(press("ArrowRight", "actions", "ltr").picked, "all");
  assert.equal(press("ArrowLeft", "all", "ltr").picked, "actions");
  assert.equal(press("End", "all", "ltr").picked, "actions");
  assert.equal(press("Home", "actions", "ltr").picked, "all");
  const home = press("Home", "mentions", "ltr");
  assert.ok(home.prevented);
  assert.equal(home.focused, '[data-value="all"]');
});

test("AR (RTL): Left/Right are mirrored; Home/End are not", () => {
  assert.equal(press("ArrowLeft", "all", "rtl").picked, "mentions");
  assert.equal(press("ArrowRight", "all", "rtl").picked, "actions");
  assert.equal(press("End", "all", "rtl").picked, "actions");
  assert.equal(press("Home", "actions", "rtl").picked, "all");
});

test("other keys are left alone", () => {
  const r = press("Enter", "all", "ltr");
  assert.equal(r.picked, undefined);
  assert.equal(r.prevented, false);
});

test("tabs use roving tabIndex and link to the tabpanel", () => {
  const src = readFileSync(new URL("../../src/components/notifications/notification-center.tsx", import.meta.url), "utf8");
  assert.match(src, /tabIndex=\{tab === item\.key \? 0 : -1\}/);
  assert.match(src, /aria-controls=\{PANEL_ID\}/);
  assert.match(src, /data-value=\{item\.key\}/);
  assert.match(src, /role="tabpanel" id=\{PANEL_ID\} aria-labelledby=\{tabId\(tab\)\}/);
  assert.match(src, /onKeyDown=\{event => \{ if \(!busy\) arrowSelect\(/);
});
