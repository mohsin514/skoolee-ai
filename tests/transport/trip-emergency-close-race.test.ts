import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-612: closing a trip is one recorded event. Two emergency closures sent at once (double tap, two coordinators)
// record one CLOSED_EMERGENCY event and one exception per unresolved rider; the second reports "repeated".
// Another school or campus, and the crew, cannot close it in an emergency.
type Trip = { id: string; schoolId: string; campusId: string; status: string; version: number; attendantId: string; coordinatorId: string };
let trips: Trip[], events: { kind: string }[], exceptions: { studentId: string }[];
const passengers = [{ tripId: "t-a", studentId: "s1", studentName: "One", status: "BOARDED" }, { tripId: "t-a", studentId: "s2", studentName: "Two", status: "EXPECTED" }];
const pause = () => new Promise(r => setTimeout(r, 5));
const tx = {
  transportTrip: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => { await pause(); const t = trips.find(x => x.id === where.id && x.schoolId === where.schoolId); return t ? { ...t } : null; },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Trip> }) => { await pause(); return Object.assign(trips.find(t => t.id === where.id)!, { ...data, version: 0 }); },
    updateMany: async ({ where, data }: { where: { id: string; status: { in: string[] } }; data: Partial<Trip> }) => { await pause(); const t = trips.find(x => x.id === where.id && where.status.in.includes(x.status)); if (!t) return { count: 0 }; Object.assign(t, { ...data, version: 0 }); return { count: 1 }; },
  },
  tripPassenger: { findMany: async ({ where }: { where: { tripId: string; status: { in: string[] } } }) => { await pause(); return passengers.filter(p => p.tripId === where.tripId && where.status.in.includes(p.status)); } },
  tripException: { create: async ({ data }: { data: { studentId: string } }) => { await pause(); exceptions.push(data); return { id: `x${exceptions.length}` }; } },
  tripEvent: { create: async ({ data }: { data: { kind: string } }) => { events.push(data); return data; } },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: tx } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: unknown) => unknown) => fn(tx) } });

const user = (role: string, s = "a", campus = `campus-${s}`, id = `u-${s}`) => ({ userId: id, role, schoolId: `school-${s}`, campusId: campus }) as never;
const seed = () => { trips = [{ id: "t-a", schoolId: "school-a", campusId: "campus-a", status: "DEPARTED", version: 4, attendantId: "crew-a", coordinatorId: "u-a" }]; events = []; exceptions = []; };
const svc = () => import("@/lib/transport/service");
const close = async (u = user("CAMPUS_ADMIN")) => (await svc()).emergencyClose(u, { tripId: "t-a", reason: "Vehicle breakdown, escalated to principal" });

test("SKAI-612: two emergency closures at once record one closure event and one exception per rider", async () => {
  seed();
  const [a, b] = await Promise.all([close(), close(user("CAMPUS_ADMIN", "a", "campus-a", "u-a2"))]);
  assert.equal(events.filter(e => e.kind === "CLOSED_EMERGENCY").length, 1);
  assert.equal(exceptions.length, 2);
  assert.deepEqual([a.repeated, b.repeated].sort(), [false, true]);
  assert.equal(trips[0].status, "CLOSED_EMERGENCY");
});

test("SKAI-612: a later repeat changes nothing", async () => {
  seed();
  await close();
  const again = await close();
  assert.equal(again.repeated, true);
  assert.equal(events.length, 1);
  assert.equal(exceptions.length, 2);
});

test("SKAI-612: another school, another campus and the crew cannot emergency-close", async () => {
  seed();
  await assert.rejects(close(user("CAMPUS_ADMIN", "b")), /not found/);
  await assert.rejects(close(user("CAMPUS_ADMIN", "a", "campus-a2")), /Only the transport coordinator/);
  await assert.rejects(close(user("TEACHER", "a", "campus-a", "crew-a")), /Only the transport coordinator/);
  assert.equal(events.length, 0);
  assert.equal(trips[0].status, "DEPARTED");
});
