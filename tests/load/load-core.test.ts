import { test } from "node:test";
import assert from "node:assert/strict";
import { assertAllowedTarget, checkVirtualUsers, journeyFor, label, percentile, report, shellBatched, shouldAbort, type Sample } from "../../scripts/load/load-core";

test("only dev and local hosts can be targeted; production is always refused", () => {
  assert.equal(assertAllowedTarget("https://dev.skooleeai.com").hostname, "dev.skooleeai.com");
  assert.equal(assertAllowedTarget("http://localhost:3608").hostname, "localhost");
  assert.equal(assertAllowedTarget("https://skoolee-ai-dev-git-x.vercel.app").hostname, "skoolee-ai-dev-git-x.vercel.app");
  for (const prod of ["https://skooleeai.com", "https://app.skooleeai.com", "https://www.skooleeai.com", "https://skoolee-ai-prod-abc.vercel.app"]) {
    assert.throws(() => assertAllowedTarget(prod), /production/);
  }
  assert.throws(() => assertAllowedTarget("https://example.com"), /allow-list/);
  assert.throws(() => assertAllowedTarget("not a url"), /Not a URL/);
});

test("virtual users are capped unless high load is explicitly allowed", () => {
  checkVirtualUsers(300, false);
  assert.throws(() => checkVirtualUsers(301, false), /LOAD_ALLOW_HIGH/);
  checkVirtualUsers(5000, true);
  assert.throws(() => checkVirtualUsers(5001, true), /capped/);
  assert.throws(() => checkVirtualUsers(0, false), /positive/);
});

test("journeys are read-only paths and labels drop ids and queries", () => {
  const teacher = journeyFor("teacher", "2026-11-13");
  assert.ok(teacher.includes("/api/timetable/teacher"));
  assert.equal(teacher[0], "/teacher", "a page view starts with the role's home page");
  assert.ok(teacher.every((p) => !p.includes("{date}")), "dates are filled in");
  for (const role of ["owner", "admin", "principal", "accountant", "guardian", "student", "noaccess", "platform-owner"]) assert.ok(journeyFor(role, "2026-11-13").length > 5, role);
  assert.ok(teacher.every((p) => p.startsWith("/")));
  assert.equal(label("/api/teacher-attendance?userId=self&date=2026-11-13"), "/api/teacher-attendance");
  assert.equal(label("/api/students/32e6d4af-86d1-4a84-8237-11d5bb4e8b10/profile"), "/api/students/:id/profile");
});

test("percentiles use the nearest rank", () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(sorted, 50), 50);
  assert.equal(percentile(sorted, 95), 95);
  assert.equal(percentile(sorted, 99), 99);
  assert.equal(percentile([], 95), null);
});

const samples = (n: number, ms: number, status: number): Sample[] => Array.from({ length: n }, () => ({ at: 0, endpoint: "/x", ms, status }));

test("the run aborts on its own when the target degrades", () => {
  assert.equal(shouldAbort(samples(10, 99_999, 500)), null, "too few samples to judge");
  assert.equal(shouldAbort(samples(100, 200, 200)), null);
  assert.match(shouldAbort([...samples(70, 200, 200), ...samples(30, 200, 503)])!, /error rate/);
  assert.match(shouldAbort([...samples(70, 200, 200), ...samples(30, 200, 0)])!, /error rate/);
  assert.match(shouldAbort(samples(100, 12_000, 200))!, /p95/);
});

test("the report passes or fails against the SKO-451 objectives", () => {
  const meta = { target: "https://dev.skooleeai.com", vus: 5, durationSec: 10, rampSec: 2, thinkMs: [1000, 2000] as [number, number], startedAt: "2026-11-13T00:00:00.000Z", finishedAt: "2026-11-13T00:00:10.000Z", aborted: null, sessions: { teacher: 1 }, skipped: [] };
  const fast = report(meta, samples(100, 300, 200));
  assert.equal(fast.passed, true);
  assert.equal(fast.overall.rps, 10);
  assert.match(fast.markdown, /PASS/);
  assert.equal(report(meta, samples(100, 2_000, 200)).passed, false);
  assert.equal(report(meta, [...samples(98, 300, 200), ...samples(2, 300, 500)]).passed, false);
  assert.equal(report({ ...meta, aborted: "error rate" }, samples(100, 300, 200)).passed, false);
});

test("shell GETs in a page view go as one /api/shell request, like the browser (SKAI-1949)", () => {
  const out = shellBatched(["/api/auth/session", "/api/students?page=1", "/api/notifications?limit=30"]);
  assert.deepEqual(out, ["/api/shell?p=%2Fapi%2Fauth%2Fsession&p=%2Fapi%2Fnotifications%3Flimit%3D30", "/api/students?page=1"]);
  assert.equal(label(out[0]), "/api/shell");
  assert.deepEqual(shellBatched(["/api/profile", "/api/students"]), ["/api/profile", "/api/students"], "a lone shell GET is sent as itself");
});
