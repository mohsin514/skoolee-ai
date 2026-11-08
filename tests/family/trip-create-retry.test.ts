import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-606: a retried "publish trip" (double click, network retry) returns the trip already published instead of
// creating a second notice for the same pupils. Different schools, campuses and terms still create their own trip;
// a non-leader is refused.
type Trip = { id: string; schoolId: string; campusId: string; createdById: string; status: string; createdAt: Date; title: string; departAt: Date; invitees: string[] };
let trips: Trip[] = [];
const locks = new Map<string, Promise<void>>();
async function acquire(key: string) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>(r => (release = r))));
  await previous;
  return release;
}
const pause = () => new Promise(r => setTimeout(r, 5));
const pupils = ["a", "b"].flatMap(s => [1, 2].map(n => ({ id: `p-${s}${n}`, schoolId: `school-${s}`, campusId: `campus-${s}` })));
function fakeTx(held: Array<() => void>) {
  let pending: Partial<Trip> = {};
  return {
    $executeRaw: async (_s: TemplateStringsArray, key: string) => { held.push(await acquire(key)); return 1; },
    student: {
      findMany: async () => [],
      count: async ({ where }: { where: { schoolId: string; campusId: string; id: { in: string[] } } }) => pupils.filter(p => p.schoolId === where.schoolId && p.campusId === where.campusId && where.id.in.includes(p.id)).length,
    },
    trip: {
      findMany: async ({ where }: { where: { schoolId: string; campusId: string; createdById: string; status: string; createdAt: { gte: Date } } }) => {
        await pause();
        return trips.filter(t => t.schoolId === where.schoolId && t.campusId === where.campusId && t.createdById === where.createdById && t.status === where.status && t.createdAt >= where.createdAt.gte)
          .map(t => ({ ...t, versions: [{ title: t.title, departAt: t.departAt }], invitees: t.invitees.map(studentId => ({ studentId })) }));
      },
      create: async ({ data }: { data: { schoolId: string; campusId: string; createdById: string; invitees: { create: { studentId: string }[] } } }) => {
        await pause();
        pending = { id: `t-${trips.length + 1}`, schoolId: data.schoolId, campusId: data.campusId, createdById: data.createdById, status: "OPEN", createdAt: new Date(), invitees: data.invitees.create.map(i => i.studentId) };
        return pending;
      },
    },
    tripVersion: { create: async ({ data }: { data: { title: string; departAt: Date } }) => { trips.push({ ...(pending as Trip), title: data.title, departAt: data.departAt }); return {}; } },
  };
}
const transaction = async (_u: unknown, fn: (tx: unknown) => Promise<unknown>) => { const held: Array<() => void> = []; try { return await fn(fakeTx(held)); } finally { held.forEach(r => r()); } };
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakeTx([]) } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: transaction } });

const leader = (s: "a" | "b") => ({ userId: `lead-${s}`, role: "CAMPUS_ADMIN", schoolId: `school-${s}`, campusId: `campus-${s}` }) as never;
const day = 86_400_000;
const body = (s: "a" | "b", title = "Museum visit") => ({ title, destination: "City museum", departAt: new Date(Date.now() + 5 * day).toISOString(), returnAt: new Date(Date.now() + 5 * day + 3_600_000).toISOString(), respondBy: new Date(Date.now() + 2 * day).toISOString(), contact: "Front office", studentIds: [`p-${s}1`, `p-${s}2`] });
const svc = () => import("@/lib/family/trips");

test("SKAI-606: two concurrent identical publishes create one trip and both return it", async () => {
  trips = [];
  const b = body("a");
  const [one, two] = await Promise.all([(await svc()).createTrip(leader("a"), b), (await svc()).createTrip(leader("a"), b)]);
  assert.equal(trips.length, 1);
  assert.equal(one.id, two.id);
});

test("SKAI-606: a sequential retry returns the existing trip; different terms create a new one", async () => {
  trips = [];
  const b = body("a");
  const first = await (await svc()).createTrip(leader("a"), b);
  const retry = await (await svc()).createTrip(leader("a"), b);
  assert.equal(retry.id, first.id);
  await (await svc()).createTrip(leader("a"), body("a", "Zoo visit"));
  assert.equal(trips.length, 2);
});

test("SKAI-606: two schools and campuses never share a trip; other-campus pupils are refused", async () => {
  trips = [];
  await (await svc()).createTrip(leader("a"), body("a"));
  await (await svc()).createTrip(leader("b"), body("b"));
  assert.deepEqual(trips.map(t => t.schoolId), ["school-a", "school-b"]);
  await assert.rejects((await svc()).createTrip(leader("a"), body("b")), /on this campus/);
});

test("SKAI-606: a teacher (denied role) cannot publish", async () => {
  await assert.rejects((await svc()).createTrip({ userId: "t", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" } as never, body("a")), /Only school leaders/);
});
