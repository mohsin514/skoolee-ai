import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-613: a refused double boarding opens one owned exception for the trip's coordinator. Retried or concurrent
// refusals (an offline queue replaying, two taps) never open a second open exception for the same child, and a
// trip of another school is never touched.
let exceptions: { tripId: string; studentId: string; kind: string; status: string; ownerId: string }[] = [];
const trips = [{ id: "t-a", schoolId: "school-a", campusId: "campus-a", coordinatorId: "coord-a" }];
const locks = new Map<string, Promise<void>>();
async function acquire(key: string) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>(r => (release = r))));
  await previous;
  return release;
}
const pause = () => new Promise(r => setTimeout(r, 5));
function fakeTx(held: Array<() => void>) {
  return {
    $executeRaw: async (_s: TemplateStringsArray, key: string) => { held.push(await acquire(key)); return 1; },
    transportTrip: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => trips.find(t => t.id === where.id && t.schoolId === where.schoolId) ?? null },
    tripException: {
      findFirst: async ({ where }: { where: { tripId: string; studentId: string; kind: string; status: string } }) => { await pause(); return exceptions.find(e => e.tripId === where.tripId && e.studentId === where.studentId && e.kind === where.kind && e.status === where.status) ?? null; },
      create: async ({ data }: { data: { tripId: string; studentId: string; kind: string; ownerId: string } }) => { await pause(); exceptions.push({ ...data, status: "OPEN" }); return { id: `x${exceptions.length}` }; },
    },
  };
}
const transaction = async (_u: unknown, fn: (tx: unknown) => Promise<unknown>) => { const held: Array<() => void> = []; try { return await fn(fakeTx(held)); } finally { held.forEach(r => r()); } };
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakeTx([]) } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: transaction } });

const crew = (s = "a") => ({ userId: `crew-${s}`, role: "TEACHER", schoolId: `school-${s}`, campusId: `campus-${s}` }) as never;
const svc = () => import("@/lib/transport/service");
const refuse = async (u = crew()) => { const m = await svc(); return m.recordDoubleBoarding(u, "t-a", new m.DoubleBoarding("s-1", "t-other", "Bus 2 AM")); };

test("SKAI-613: concurrent refused boardings open exactly one exception, owned by the coordinator", async () => {
  exceptions = [];
  const results = await Promise.all([refuse(), refuse(), refuse()]);
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].ownerId, "coord-a");
  assert.equal(results.filter(Boolean).length, 1);
});

test("SKAI-613: a later retry while it is still open adds nothing; after resolution a new one can open", async () => {
  exceptions = [];
  await refuse();
  assert.equal(await refuse(), null);
  exceptions[0].status = "RESOLVED";
  await refuse();
  assert.equal(exceptions.length, 2);
});

test("SKAI-613: another school's crew cannot open an exception on this trip", async () => {
  exceptions = [];
  assert.equal(await refuse(crew("b")), null);
  assert.equal(exceptions.length, 0);
});
