import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-611: passenger-list amendments carry a stable client event id and the list version the coordinator saw.
// A replayed amendment changes nothing and reports "repeated"; an amendment made from a stale list is refused
// (also when two coordinators race); other schools, campuses and crew members are refused.
type Trip = { id: string; schoolId: string; campusId: string; status: string; version: number; vehicleCapacity: number; attendantId: string; coordinatorId: string };
type Passenger = { id: string; tripId: string; studentId: string; status: string; source?: string; note?: string };
type Event = { tripId: string; clientEventId: string | null; kind: string };
let trips: Trip[], passengers: Passenger[], events: Event[];
const pause = () => new Promise(r => setTimeout(r, 5));
const students = [{ id: "s-a1", schoolId: "school-a", campusId: "campus-a", fullName: "Pupil A1" }, { id: "s-a2", schoolId: "school-a", campusId: "campus-a", fullName: "Pupil A2" }];
function fakeTx() {
  return {
    transportTrip: {
      findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => { const t = trips.find(x => x.id === where.id && x.schoolId === where.schoolId); return t ? { ...t } : null; },
      update: async ({ where, data }: { where: { id: string }; data: { version: { increment: number } } }) => { await pause(); const t = trips.find(x => x.id === where.id)!; t.version += data.version.increment; return t; },
      updateMany: async ({ where, data }: { where: { id: string; version: number }; data: { version: { increment: number } } }) => { await pause(); const t = trips.find(x => x.id === where.id && x.version === where.version); if (!t) return { count: 0 }; t.version += data.version.increment; return { count: 1 }; },
    },
    tripPassenger: {
      findFirst: async ({ where }: { where: { tripId: string; studentId: string } }) => passengers.find(p => p.tripId === where.tripId && p.studentId === where.studentId) ?? null,
      create: async ({ data }: { data: Passenger }) => { const p = { ...data, id: `p-${passengers.length + 1}`, status: "EXPECTED" }; passengers.push(p); return p; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Passenger> }) => Object.assign(passengers.find(p => p.id === where.id)!, data),
      count: async ({ where }: { where: { tripId: string } }) => passengers.filter(p => p.tripId === where.tripId && p.status !== "REMOVED").length,
    },
    student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => students.find(s => s.id === where.id && s.schoolId === where.schoolId) ?? null },
    tripEvent: {
      findFirst: async ({ where }: { where: { tripId: string; clientEventId: string } }) => events.find(e => e.tripId === where.tripId && e.clientEventId === where.clientEventId) ?? null,
      create: async ({ data }: { data: Event }) => { events.push({ tripId: data.tripId, clientEventId: data.clientEventId ?? null, kind: data.kind }); return data; },
    },
    tripException: { create: async () => ({ id: "x" }) },
  };
}
// The real transaction rolls back the loser's writes; the fake only needs to show which call fails.
const transaction = async (_u: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx());
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakeTx() } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: transaction } });

const user = (role: string, s = "a", campus = `campus-${s}`, id = `u-${s}`) => ({ userId: id, role, schoolId: `school-${s}`, campusId: campus }) as never;
const coord = (id = "u-a") => user("CAMPUS_ADMIN", "a", "campus-a", id);
const svc = () => import("@/lib/transport/service");
const seed = () => {
  trips = [{ id: "t-a", schoolId: "school-a", campusId: "campus-a", status: "PUBLISHED", version: 1, vehicleCapacity: 10, attendantId: "crew-a", coordinatorId: "u-a" }];
  passengers = [{ id: "p-0", tripId: "t-a", studentId: "s-a2", status: "EXPECTED" }];
  events = [];
};
const add = (extra: Record<string, unknown> = {}) => ({ tripId: "t-a", change: "add", studentId: "s-a1", reason: "Late request", ...extra });

test("SKAI-611: a replayed amendment (same client event id) is recognised and changes nothing", async () => {
  seed();
  await (await svc()).amend(coord(), add({ clientEventId: "ev-1", knownVersion: 1 }));
  const again = await (await svc()).amend(coord(), add({ clientEventId: "ev-1", knownVersion: 1 }));
  assert.equal((again as { repeated?: boolean }).repeated, true);
  assert.equal(events.length, 1);
  assert.equal(trips[0].version, 2);
});

test("SKAI-611: an amendment from a stale passenger list is refused and writes nothing", async () => {
  seed();
  trips[0].version = 3;
  await assert.rejects((await svc()).amend(coord(), add({ clientEventId: "ev-2", knownVersion: 2 })), /passenger list changed/);
  assert.equal(events.length, 0);
  assert.equal(passengers.length, 1);
});

test("SKAI-611: two coordinators amending the same version at once — one wins, one gets a conflict", async () => {
  seed();
  const results = await Promise.allSettled([
    (await svc()).amend(coord("u-a"), add({ clientEventId: "ev-3", knownVersion: 1 })),
    (await svc()).amend(coord("u-a2"), { tripId: "t-a", change: "remove", studentId: "s-a2", reason: "Moved", clientEventId: "ev-4", knownVersion: 1 }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(trips[0].version, 2);
  assert.equal(events.length, 1);
});

test("SKAI-611: another school, another campus and the crew cannot amend", async () => {
  seed();
  await assert.rejects((await svc()).amend(user("CAMPUS_ADMIN", "b"), add()), /not found/);
  await assert.rejects((await svc()).amend(user("CAMPUS_ADMIN", "a", "campus-a2"), add()), /Only the transport coordinator/);
  await assert.rejects((await svc()).amend(user("TEACHER", "a", "campus-a", "crew-a"), add()), /Only the transport coordinator/);
  assert.equal(events.length, 0);
});
