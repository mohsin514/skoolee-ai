import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1860: an emergency closure records every unresolved rider's exception in one insert, so the closure
// transaction does not grow by one round trip per rider. Rows keep the school, kind, note and owner they had.
type Row = Record<string, any>;
let trips: Row[], passengers: Row[], creates: Row[][], singleCreates: number, events: Row[];
const tx = {
  transportTrip: {
    findFirst: async ({ where }: Row) => { const t = trips.find(x => x.id === where.id && x.schoolId === where.schoolId); return t ? { ...t } : null; },
    updateMany: async ({ where, data }: Row) => { const t = trips.find(x => x.id === where.id && where.status.in.includes(x.status)); if (!t) return { count: 0 }; Object.assign(t, data, { version: 0 }); return { count: 1 }; },
  },
  tripPassenger: { findMany: async ({ where }: Row) => passengers.filter(p => p.tripId === where.tripId && where.status.in.includes(p.status)) },
  tripException: {
    create: async () => { singleCreates++; return { id: "x" }; },
    createMany: async ({ data }: { data: Row[] }) => { creates.push(data); return { count: data.length }; },
  },
  tripEvent: { create: async ({ data }: Row) => { events.push(data); return data; } },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: tx } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: unknown) => unknown) => fn(tx) } });

const user = (s: string, campus = `campus-${s}`, role = "CAMPUS_ADMIN") => ({ userId: `u-${s}`, role, schoolId: `school-${s}`, campusId: campus }) as never;
const seed = (riders: number) => {
  trips = ["a", "b"].map(s => ({ id: `t-${s}`, schoolId: `school-${s}`, campusId: `campus-${s}`, status: "DEPARTED", version: 1, attendantId: `crew-${s}`, coordinatorId: `u-${s}` }));
  passengers = ["a", "b"].flatMap(s => Array.from({ length: riders }, (_, i) => ({ tripId: `t-${s}`, studentId: `${s}-s${i}`, studentName: `Rider ${i}`, status: ["BOARDED", "EXPECTED", "DROPPED"][i % 3] })));
  creates = []; singleCreates = 0; events = [];
};
const close = async (u = user("a"), tripId = "t-a") => (await import("@/lib/transport/service")).emergencyClose(u, { tripId, reason: "Vehicle breakdown, escalated to principal" });

for (const riders of [3, 60]) {
  test(`SKAI-1860: ${riders} riders are recorded with one insert, school-stamped, with the same kinds and notes`, async () => {
    seed(riders);
    const result = await close();
    const unresolved = passengers.filter(p => p.tripId === "t-a" && p.status !== "DROPPED");
    assert.equal(singleCreates, 0);
    assert.equal(creates.length, 1);
    assert.equal(result.created, unresolved.length);
    assert.deepEqual(creates[0].map(r => r.studentId), unresolved.map(p => p.studentId));
    for (const row of creates[0]) {
      assert.equal(row.schoolId, "school-a");
      assert.equal(row.tripId, "t-a");
      assert.equal(row.ownerId, "u-a");
      const boarded = passengers.find(p => p.studentId === row.studentId)!.status === "BOARDED";
      assert.equal(row.kind, boarded ? "MISSING_RECIPIENT" : "MISSING_CHILD");
      assert.match(row.note, boarded ? /on board, no handover/ : /not boarded, no absence/);
    }
    assert.deepEqual(events.map(e => e.detail.unresolved), [unresolved.length]);
  });
}

test("SKAI-1860: a closure with nothing unresolved writes no exceptions", async () => {
  seed(0);
  assert.equal((await close()).created, 0);
  assert.equal(creates.length, 0);
});

test("SKAI-1860: another school, another campus and the crew write nothing", async () => {
  seed(3);
  await assert.rejects(close(user("b"), "t-a"), /not found/);
  await assert.rejects(close(user("a", "campus-a2")), /Only the transport coordinator/);
  await assert.rejects(close(user("a", "campus-a", "TEACHER")), /Only the transport coordinator/);
  assert.equal(creates.length, 0);
  assert.equal(trips[0].status, "DEPARTED");
  await close(user("b"), "t-b");
  assert.ok(creates[0].every(r => r.schoolId === "school-b" && r.tripId === "t-b"));
});
