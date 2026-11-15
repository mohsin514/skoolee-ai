import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2181: only campus-wide readers (principal, campus operators) are told they can open any roster.
test("activities header copy follows readsCampus, not only canPublish", () => {
  const service = readFileSync("src/lib/activities/service.ts", "utf8");
  assert.match(service, /readsCampus: campusWide/);
  const desk = readFileSync("src/components/activities/activities.tsx", "utf8");
  assert.match(desk, /list\.readsCampus \? "Clubs, sports and trips on your campus\. Their coordinators run them; you can open any roster\." : "Activities you coordinate or help run appear here\."/);
});
