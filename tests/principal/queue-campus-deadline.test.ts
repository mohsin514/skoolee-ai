/**
 * SKAI-1931: "Attendance not submitted" (and every other calendar-day deadline in the action queue) ends at midnight on
 * the campus clock. It used to end at 23:59:59.999 UTC, which for a Lahore campus (UTC+5) is 04:59 the next morning.
 *
 * Runs without a database: an in-memory stand-in is injected through `globalThis.prisma` before the module is imported.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import { endOfCalendarDayIn } from "../../src/lib/calendar-date";
import { schoolToday } from "../../src/lib/fees/statement";

const SCHOOL = "school-deadline", CAMPUS = "campus-deadline", ZONE = "Asia/Karachi";
const classQueries: Array<Record<string, unknown> | undefined> = [];

const model = (name: string) => new Proxy({}, {
  get(_target, operation) {
    if (typeof operation !== "string" || operation === "then") return undefined;
    return async (args?: { where?: Record<string, unknown> }) => {
      if (name === "school" && operation === "findUniqueOrThrow") return { timezone: ZONE };
      if (name === "class" && operation === "findMany") { classQueries.push(args?.where); return [{ id: "class-7", name: "Grade 7", section: null, classTeacher: null }]; }
      if (operation === "findMany" || operation === "groupBy") return [];
      if (operation === "count") return 0;
      return null;
    };
  },
});
const fakePrisma: Record<string, unknown> = new Proxy({}, {
  get(_target, property) {
    if (typeof property !== "string" || property === "then") return undefined;
    if (property === "$queryRaw") return async () => [];
    if (property.startsWith("$")) return async () => undefined;
    return model(property);
  },
});

let queue: typeof import("../../src/lib/principal/queue");
before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
  (globalThis as { prisma?: unknown }).prisma = fakePrisma;
  queue = await import("../../src/lib/principal/queue");
});

const principal: AuthUser = { userId: "user-principal", schoolId: SCHOOL, campusId: CAMPUS, role: "PRINCIPAL", email: "principal@example.invalid", institutionKind: "GROUP" };

test("end of a calendar day is midnight on the campus clock, across zones and daylight saving", () => {
  assert.equal(endOfCalendarDayIn("2026-11-13", "Asia/Karachi"), "2026-11-13T18:59:59.999Z");
  assert.equal(endOfCalendarDayIn("2026-11-13", "UTC"), "2026-11-13T23:59:59.999Z", "a UTC campus keeps its old deadline");
  assert.equal(endOfCalendarDayIn("2026-12-31", "Asia/Dubai"), "2026-12-31T19:59:59.999Z", "month and year roll over");
  assert.equal(endOfCalendarDayIn("2026-11-01", "America/New_York"), "2026-11-02T04:59:59.999Z", "the day daylight saving ends");
  assert.equal(endOfCalendarDayIn("2026-11-13", "Not/AZone"), "2026-11-13T23:59:59.999Z", "an unknown zone falls back to UTC");
});

test("the missing-attendance item is due at the end of today on the campus clock, scoped to the campus", async () => {
  const { items } = await queue.collectSources(principal, CAMPUS);
  const item = items.find(row => row.type === "ATTENDANCE_MISSING");
  assert.ok(item, "an unmarked class raises the item");
  const today = schoolToday(ZONE);
  assert.equal(item.key, `ATTENDANCE_MISSING:class-7:${today}`);
  assert.equal(item.dueAt, endOfCalendarDayIn(today, ZONE));
  assert.match(item.dueAt ?? "", /T18:59:59\.999Z$/, "midnight PKT, not 04:59 the next morning");
  assert.ok(classQueries.every(where => where?.schoolId === SCHOOL && where?.campusId === CAMPUS), "classes stay in the campus scope");
});
