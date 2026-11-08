import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("SKAI-1618 an empty first fetch still sets the arrival baseline", () => {
  const hook = readFileSync("src/hooks/use-notifications.ts", "utf8");
  assert.match(hook, /setLoaded\(true\)/);
  const header = readFileSync("src/components/role-dashboard/RoleHeader.tsx", "utf8");
  assert.match(header, /if \(!notificationsLoaded\) return;/);
  assert.doesNotMatch(header, /if \(liveNotifications\.length === 0\) return;/);
});
