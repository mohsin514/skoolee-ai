import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1539: only HTTP 200 reportCard:null means "not ready"; a 500, bad payload or network error is a failure with Retry.
const src = readFileSync("src/app/teacher/reports/page.tsx", "utf8");
const body = src.slice(src.indexOf("const openDeepLink"), src.indexOf("}, [searchParams, academicYear, ui]);"));

test("non-OK and malformed responses are failures, not 'not ready'", () => {
  assert.match(body, /if \(!rcRes\.ok\) throw/);
  assert.match(body, /!\("reportCard" in rcResult\)\) throw/);
  assert.match(body, /catch \{\s*setDeepLinkFailed\(true\);/);
  const notReady = body.indexOf("This report card isn't ready yet");
  assert.ok(notReady > body.indexOf("if (!rcRes.ok)"), "not-ready is only reached after the status check");
});

test("the failure shows a scoped Retry that re-runs the same deep link", () => {
  assert.match(src, /deepLinkFailed \? \(\s*<ErrorState[\s\S]*onRetry=\{\(\) => void openDeepLink\(\)\}/);
  assert.match(body, /searchParams\.get\("studentId"\)[\s\S]*searchParams\.get\("classId"\)/);
});
