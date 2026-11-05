import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1776: ?date= filters by the campus calendar day the register displays (school timezone), not the UTC day.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type Visit = { id: string; schoolId: string; campusId: string; name: string; inTime: Date; status: string; phone: null; outTime: null };
const visit = (id: string, schoolId: string, campusId: string, inTime: string): Visit => ({ id, schoolId, campusId, name: id, inTime: new Date(inTime), status: "LEFT", phone: null, outTime: null });
const visits = [
  visit("early-nov-1", "school-a", "campus-a", "2026-10-31T19:30:00Z"), // 00:30 on 1 Nov in Karachi
  visit("early-oct-31", "school-a", "campus-a", "2026-10-30T20:15:00Z"), // 01:15 on 31 Oct
  visit("late-nov-1", "school-a", "campus-a", "2026-11-01T18:59:00Z"), // 23:59 on 1 Nov
  visit("other-school", "school-b", "campus-b", "2026-10-31T19:30:00Z"),
];
let user: { role: string; schoolId: string; campusId: string; denied?: boolean } = { role: "RECEPTIONIST", schoolId: "school-a", campusId: "campus-a" };
type Where = { schoolId: string; campusId: string; inTime?: { gte: Date; lt: Date } };
const matches = (v: Visit, w: Where) => v.schoolId === w.schoolId && v.campusId === w.campusId && (!w.inTime || (v.inTime >= w.inTime.gte && v.inTime < w.inTime.lt));
mock.module("@/lib/db/prisma", { namedExports: { prisma: { visitorLog: { findMany: async ({ where }: { where: Where }) => visits.filter(v => matches(v, where)) } } } });
mock.module("@/lib/datetime", { namedExports: { getSchoolTimeZone: async () => "Asia/Karachi" } });
mock.module("@/lib/front-desk/visitors", { namedExports: { checkIn: async () => ({}), checkOut: async () => ({}), correctVisit: async () => ({}), OVERDUE_HOURS: 8 } });
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  requireAuthUser: async () => user,
  assertModuleRead: async (u: typeof user) => { if (u.denied) throw new ApiError("Forbidden", 403); },
  assertPermission: async () => {},
  canManageFrontDesk: () => true,
  resolveCampusId: async (u: typeof user) => u.campusId,
  errorResponse: (e: ApiError) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
} });

const ids = async (date?: string) => {
  const { GET } = await import("../../src/app/api/front-desk/visitors/route");
  const url = new URL(`http://x/api/front-desk/visitors${date ? `?date=${date}` : ""}`);
  const res = await GET({ nextUrl: url } as never);
  const body = await res.json();
  return res.status === 200 ? (body.data?.visits ?? body.data).map((v: Visit) => v.id).sort() : res.status;
};

test("early-morning and late-night visits are found on their displayed local day", async () => {
  user = { role: "RECEPTIONIST", schoolId: "school-a", campusId: "campus-a" };
  assert.deepEqual(await ids("2026-11-01"), ["early-nov-1", "late-nov-1"]);
  assert.deepEqual(await ids("2026-10-31"), ["early-oct-31"]);
  assert.deepEqual(await ids("2026-10-30"), []);
});

test("without a date every visit in the campus is listed", async () => {
  assert.deepEqual(await ids(), ["early-nov-1", "early-oct-31", "late-nov-1"]);
});

test("two schools stay isolated on the same local day", async () => {
  user = { role: "RECEPTIONIST", schoolId: "school-b", campusId: "campus-b" };
  assert.deepEqual(await ids("2026-11-01"), ["other-school"]);
});

test("a role without front-desk read is denied", async () => {
  user = { role: "PARENT", schoolId: "school-a", campusId: "campus-a", denied: true };
  assert.equal(await ids("2026-11-01"), 403);
});
