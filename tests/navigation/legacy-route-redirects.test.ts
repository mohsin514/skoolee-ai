import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import config from "../../next.config";

// tsx's ESM/CJS interop can expose the config one level deeper in the test runner.
const nextConfig = (config as typeof config & { default?: typeof config }).default ?? config;

// SKAI-1935: an old /student/schedule bookmark crashed with React #310 on a hard load because the redirect
// was streamed from a page inside the student client shell. It must be answered before any page renders.
test("the retired student schedule route redirects over HTTP to attendance", async () => {
  const redirects = await nextConfig.redirects!();
  const rule = redirects.find(row => row.source === "/student/schedule");
  assert.ok(rule, "expected a config redirect for /student/schedule");
  assert.equal(rule.destination, "/student/attendance");
  assert.equal(rule.permanent, false);
  assert.ok(existsSync(path.join(process.cwd(), "src/app/student/attendance/page.tsx")), "redirect target must exist");
});

test("config redirects never point back at their own source", async () => {
  for (const row of await nextConfig.redirects!()) assert.notEqual(row.destination, row.source);
});
