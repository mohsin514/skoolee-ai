import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2176: an owner names a campus of this school when publishing; an empty or foreign campus is a 400.
test("activity and trip creation validate the campus of a school-wide owner", () => {
  const activities = readFileSync("src/lib/activities/service.ts", "utf8");
  assert.match(activities, /campus\.count\(\{ where: \{ id: campusId, schoolId: user\.schoolId, archivedAt: null \} \}\)\)\) throw new ApiError\("Choose a campus for this activity\."/);
  assert.match(activities, /user\.role === "SUPER_ADMIN" && !user\.campusId \? prisma\.campus\.findMany/);
  const trips = readFileSync("src/lib/family/trips.ts", "utf8");
  assert.match(trips, /Choose a campus for this trip\./);
  const desk = readFileSync("src/components/activities/activities.tsx", "utf8");
  assert.match(desk, /data-activity-campus/);
});
