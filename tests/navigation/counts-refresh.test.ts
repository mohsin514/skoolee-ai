import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NAVIGATION_COUNTS_REFRESH_MS, navigationCountsDue } from "../../src/lib/navigation/counts-refresh";

/** SKAI-1829: rapid focus and route changes reuse the sidebar badge counts instead of re-running the action-queue sources. */
test("SKAI-1829: counts load on first mount and refresh at most once per 30 seconds", () => {
  assert.equal(NAVIGATION_COUNTS_REFRESH_MS, 30_000);
  const t = 1_000_000;
  assert.equal(navigationCountsDue(null, t), true, "no fresh read yet");
  assert.equal(navigationCountsDue(t, t), false, "the same focus/route burst");
  assert.equal(navigationCountsDue(t, t + 29_999), false, "a focus or route change inside the window");
  assert.equal(navigationCountsDue(t, t + 30_000), true, "the window has passed");
});

test("SKAI-1829: the shell gates its counts fetch on the window and frees it when a read fails or is aborted", () => {
  const shell = readFileSync("src/components/role-dashboard/RoleShell.tsx", "utf8");
  const hook = shell.slice(shell.indexOf("function useNavigationCounts("), shell.indexOf("function activeLeafFor("));
  assert.match(hook, /if \(!navigationCountsDue\(lastFetchAt\.current, startedAt\)\) return;\n\s+lastFetchAt\.current = startedAt;/);
  assert.match(hook, /\.catch\(\(\) => \{ settled = true; if \(!controller\.signal\.aborted\) release\(\); \}\)/);
  assert.match(hook, /return \(\) => \{ if \(!settled\) release\(\); controller\.abort\(\); \};/);
  assert.match(hook, /window\.addEventListener\("focus", refresh\)/, "focus still asks for a refresh");
});
