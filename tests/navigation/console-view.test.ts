import { test } from "node:test";
import assert from "node:assert/strict";
import { navigateConsoleView, resolveConsoleView } from "../../src/components/nav/useConsoleView";

test("aliases resolve to their registry view and tab, and ask for a rewrite", () => {
  assert.deepEqual(resolveConsoleView("admin", "?view=complaints"), { view: "front-desk", tab: "complaints", rewrite: { view: "front-desk", tab: "complaints" }, retired: null });
  assert.deepEqual(resolveConsoleView("principal", "?view=grading-rules"), { view: "academic-rules", tab: "grading", rewrite: { view: "academic-rules", tab: "grading" }, retired: null });
  assert.equal(resolveConsoleView("accountant", "?view=leave").view, "my-leave");
  assert.equal(resolveConsoleView("super", "?view=schools").view, "overview");
});

test("retired views land on the default view with the notice; unknown views fall back silently", () => {
  const retired = resolveConsoleView("principal", "?view=fees&tab=x");
  assert.equal(retired.view, "overview");
  assert.equal(retired.tab, null);
  assert.equal(retired.retired, "This now lives with your campus admin.");
  assert.equal(resolveConsoleView("principal", "?view=permissions").retired, "Staff access and appointments are managed by your school's administrator.");
  assert.deepEqual(resolveConsoleView("admin", "?view=platform-secrets"), { view: "overview", tab: null, rewrite: null, retired: null });
  assert.deepEqual(resolveConsoleView("admin", ""), { view: "overview", tab: null, rewrite: null, retired: null });
  assert.deepEqual(resolveConsoleView("admin", "?view=fees&tab=invoices&invoice=1"), { view: "fees", tab: "invoices", rewrite: null, retired: null });
});

type FakeWindow = { location: { pathname: string; search: string; assign: (href: string) => void }; history: { pushState: (s: unknown, t: string, href: string) => void }; dispatchEvent: (e: Event) => boolean };
function fakeWindow(pathname: string, search = "") {
  const calls = { push: [] as string[], pushState: [] as string[], assign: [] as string[], events: [] as string[] };
  const win: FakeWindow = {
    location: { pathname, search, assign: (href) => calls.assign.push(href) },
    history: { pushState: (_s, _t, href) => calls.pushState.push(href) },
    dispatchEvent: (event) => { calls.events.push(event.type); return true; },
  };
  (globalThis as unknown as { window: FakeWindow }).window = win;
  return calls;
}

test("navigateConsoleView pushes through the router when the console is another route (K-I1)", () => {
  const calls = fakeWindow("/messages", "?c=1");
  navigateConsoleView("approvals", "tax", { consoleId: "super", push: (href) => calls.push.push(href) });
  assert.deepEqual(calls.push, ["/super?view=approvals&tab=tax"]);
  assert.deepEqual(calls.pushState, []);
});

test("navigateConsoleView uses the History API on the console itself and keeps only shell params", () => {
  const calls = fakeWindow("/admin", "?view=overview&settings=profile&invoice=9");
  navigateConsoleView("fees", "invoices", { consoleId: "admin", push: (href) => calls.push.push(href) });
  assert.deepEqual(calls.push, []);
  assert.deepEqual(calls.pushState, ["/admin?settings=profile&view=fees&tab=invoices"]);
  assert.deepEqual(calls.events, ["skoolee:workspace-view-change"]);
});

test("without a router push, another route is loaded with a full navigation", () => {
  const calls = fakeWindow("/care");
  navigateConsoleView("students", null, { consoleId: "admin" });
  assert.deepEqual(calls.assign, ["/admin?view=students"]);
});
