import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1658: Escape closes Notifications and restores focus to its opener.
const source = readFileSync("src/components/role-dashboard/RoleHeader.tsx", "utf8");

test("Escape focuses the notification trigger after closing", () => {
  assert.match(source, /if \(event\.key === "Escape"\) \{ setNotifOpen\(false\); notifTriggerRef\.current\?\.focus\(\); \}/);
  assert.match(source, /ref=\{notifTriggerRef\}\s+data-tour="shell\.header\.notifications"/);
});
