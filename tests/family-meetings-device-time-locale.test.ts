import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1608: the device-zone meeting time uses the active Skoolee locale, not the browser default.
const source = readFileSync("src/components/meetings/family-meetings.tsx", "utf8");

test("theirClock formats with the app locale tag", () => {
  assert.match(source, /const clockTag = localeTag\(useLocale\(\)\);/);
  assert.match(source, /new Intl\.DateTimeFormat\(clockTag, \{ timeZone: viewerZone,/);
  assert.doesNotMatch(source, /Intl\.DateTimeFormat\(undefined/);
});
