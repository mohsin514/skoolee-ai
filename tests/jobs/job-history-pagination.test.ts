import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JOB_PAGE, jobCursor, jobNextCursor } from "@/lib/jobs/service";
import { jobMessages } from "@/lib/jobs/messages";

const src = readFileSync("src/lib/jobs/service.ts", "utf8");

test("SKAI-1781: job 101 is reachable by cursor; the cursor matches the millisecond-truncated SQL keyset", () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: `j${String(999 - i).padStart(3, "0")}`, created_at: new Date(Date.UTC(2026, 9, 1) - Math.floor(i / 2) * 1000) }));
  const { at, after } = jobCursor(jobNextCursor(rows));
  const cut = new Date(at!).getTime();
  const rest = rows.filter(r => r.created_at.getTime() < cut || (r.created_at.getTime() === cut && r.id < after!));
  assert.deepEqual(rest.map(r => r.id), [rows[100].id]);
  assert.equal(jobNextCursor(rows.slice(0, JOB_PAGE)), null);
  assert.deepEqual(jobCursor(null), { at: null, after: null });
  assert.throws(() => jobCursor("Zm9v"), /changed/, "forged cursors fail closed");
});

test("SKAI-1781: every page keeps school/campus scope, per-job authorisation and a deterministic order", () => {
  const body = src.slice(src.indexOf("export async function listJobsPage"), src.indexOf("export async function createJob"));
  assert.match(body, /WHERE j\.school_id=\$\{user\.schoolId\} AND \(\$\{user\.role === "SUPER_ADMIN"\} OR j\.campus_id=\$\{user\.campusId\}\)/);
  assert.match(body, /ORDER BY date_trunc\('milliseconds', j\.created_at\) DESC, j\.id DESC LIMIT \$\{JOB_PAGE \+ 1\}/);
  assert.doesNotMatch(body, /LIMIT 100\b/);
  assert.match(body, /await authorizeJob\(user, job\);/);
  const page = readFileSync("src/app/jobs/page.tsx", "utf8");
  assert.match(page, /data-jobs-more/);
  assert.match(page, /const seen = new Set\(newest\.map\(job => job\.id\)\); return \[\.\.\.newest, \.\.\.older\.filter\(job => !seen\.has\(job\.id\)\)\]/, "polling never duplicates or drops loaded older jobs");
  for (const lang of ["en", "ar", "ur"] as const) { const t = jobMessages[lang]; assert.ok(t.loadOlder && t.loadingOlder && t.olderFailed && t.retryOlder, lang); }
});
