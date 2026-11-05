import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { schoolDateIn } from "../../src/lib/offline/store";

// SKAI-1718: the offline register defaults to the campus academic day (school timezone), not the device date.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const zones: Record<string, string> = { "school-a": "Asia/Karachi", "school-b": "America/Los_Angeles" };
let now = new Date("2026-11-01T01:30:00Z");
mock.module("@/lib/db/prisma", { namedExports: { prisma: {} } });
mock.module("@/lib/api/scope", { namedExports: { ApiError, canManageOperations: () => false } });
mock.module("@/lib/datetime", { namedExports: {
  getSchoolTimeZone: async (schoolId: string) => zones[schoolId],
  calendarDateIn: (zone: string) => schoolDateIn(zone, now),
  schoolToday: async (schoolId: string) => schoolDateIn(zones[schoolId], now),
} });
mock.module("@/lib/attendance/register", { namedExports: {
  saveRegister: async () => ({}),
  registerView: async (user: { role: string }, classId: string, date: string) => {
    if (user.role !== "TEACHER" || classId !== "class-assigned") throw new ApiError("Forbidden", 403);
    return { class: { id: classId, name: "Class" }, date, register: { status: "DRAFT" }, entries: [] };
  },
} });
const teacher = (school: "a" | "b") => ({ userId: `t-${school}`, role: "TEACHER", schoolId: `school-${school}`, campusId: `campus-${school}` }) as never;
const svc = () => import("../../src/lib/offline/service");

test("a device west of the campus still gets the campus day at 01:30Z (06:30 in Karachi)", async () => {
  now = new Date("2026-11-01T01:30:00Z");
  assert.deepEqual(await (await svc()).today(teacher("a")), { today: "2026-11-01", timeZone: "Asia/Karachi" });
});

test("campus midnight and a DST change resolve in the school zone, east or west", () => {
  assert.equal(schoolDateIn("Asia/Karachi", new Date("2026-10-31T18:59:59Z")), "2026-10-31");
  assert.equal(schoolDateIn("Asia/Karachi", new Date("2026-10-31T19:00:00Z")), "2026-11-01");
  assert.equal(schoolDateIn("America/Los_Angeles", new Date("2026-11-01T07:30:00Z")), "2026-11-01"); // 00:30 PDT, DST ends that day
  assert.equal(schoolDateIn("America/Los_Angeles", new Date("2026-11-02T07:59:00Z")), "2026-11-01"); // 23:59 PST
  assert.equal(schoolDateIn("Not/AZone"), null);
  assert.equal(schoolDateIn(undefined), null);
});

test("prepare carries the authoritative school day and zone in the snapshot", async () => {
  now = new Date("2026-11-01T01:30:00Z");
  const snap = await (await svc()).prepare(teacher("a"), "class-assigned", "2026-11-01");
  assert.equal(snap.schoolToday, "2026-11-01");
  assert.equal(snap.timeZone, "Asia/Karachi");
  assert.equal(snap.date, "2026-11-01");
});

test("two schools each get their own day at the same instant", async () => {
  now = new Date("2026-11-01T01:30:00Z");
  assert.equal((await (await svc()).today(teacher("b"))).today, "2026-10-31");
  assert.equal((await (await svc()).today(teacher("a"))).today, "2026-11-01");
});

test("a class the teacher is not assigned is still denied", async () => {
  await assert.rejects((await svc()).prepare(teacher("a"), "class-other", "2026-11-01"), (e: ApiError) => e.status === 403);
});

test("the register no longer derives its default from the device clock", () => {
  const source = readFileSync("src/components/offline/offline-register.tsx", "utf8");
  assert.doesNotMatch(source, /getTimezoneOffset/u);
  assert.match(source, /\/api\/offline\?view=today/u);
});
