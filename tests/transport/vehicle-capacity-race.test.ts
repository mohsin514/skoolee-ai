import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

// SKAI-1756: a vehicle capacity cut and a rider assignment on the same route serialise on the route lock, so the
// route never ends with more riders than seats; one of the two gets 409.
type Vehicle = { id: string; schoolId: string; capacity: number | null; active: boolean };
type Link = { routeId: string; vehicleId: string; schoolId: string };
type Pupil = { id: string; schoolId: string; campusId: string; transportRouteId: string | null; archivedAt: null };
let vehicles: Vehicle[] = [], links: Link[] = [], pupils: Pupil[] = [];
const routes = [
  { id: "r-a", schoolId: "school-a", campusId: "campus-a", title: "Route A", active: true },
  { id: "r-b", schoolId: "school-b", campusId: "campus-b", title: "Route B", active: true },
];
const locks = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>((r) => (release = r))));
  await previous;
  return release;
}
const pause = () => new Promise((r) => setTimeout(r, 5));
const vehicleOf = (id: string) => vehicles.find(v => v.id === id)!;
function fakeTx(held: Array<() => void>) {
  return {
    $executeRaw: async (_s: TemplateStringsArray, key: string) => { held.push(await acquire(key)); return 1; },
    transportRoute: { findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId?: string } }) => routes.find(r => r.id === where.id && r.schoolId === where.schoolId && (!where.campusId || r.campusId === where.campusId)) ?? null },
    routeVehicle: {
      findMany: async ({ where }: { where: { vehicleId?: string | { not: string }; routeId?: string; schoolId?: string; vehicle?: { active: boolean } } }) => {
        await pause();
        return links.filter(l => (typeof where.vehicleId === "string" ? l.vehicleId === where.vehicleId : !where.vehicleId || l.vehicleId !== where.vehicleId.not) && (!where.routeId || l.routeId === where.routeId) && (!where.schoolId || l.schoolId === where.schoolId) && (!where.vehicle || vehicleOf(l.vehicleId).active))
          .map(l => ({ routeId: l.routeId, route: { title: routes.find(r => r.id === l.routeId)!.title }, vehicle: { capacity: vehicleOf(l.vehicleId).capacity } }));
      },
    },
    vehicle: {
      findFirst: async ({ where }: { where: { id: string } }) => ({ ...vehicleOf(where.id) }),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Vehicle> }) => { await pause(); return Object.assign(vehicleOf(where.id), data); },
    },
    student: {
      findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => pupils.find(p => p.id === where.id && p.schoolId === where.schoolId) ?? null,
      count: async ({ where }: { where: { schoolId: string; transportRouteId: string } }) => { await pause(); return pupils.filter(p => p.schoolId === where.schoolId && p.transportRouteId === where.transportRouteId).length; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Pupil> }) => { await pause(); return Object.assign(pupils.find(p => p.id === where.id)!, data); },
    },
    transportStop: { findFirst: async () => null },
    transportRiderStop: { deleteMany: async () => ({ count: 0 }) },
  };
}
const transaction = async (_u: unknown, fn: (tx: unknown) => Promise<unknown>) => { const held: Array<() => void> = []; try { return await fn(fakeTx(held)); } finally { held.forEach(r => r()); } };
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakeTx([]) } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: transaction } });

const coord = (school: "a" | "b") => ({ userId: `c-${school}`, role: "CAMPUS_ADMIN", schoolId: `school-${school}`, campusId: `campus-${school}` }) as never;
const svc = () => import("@/lib/transport/service");
const shrink = async (school: "a" | "b", vehicleId: string, capacity: number) => (await svc()).changeVehicleWithinCapacity(coord(school), vehicleId, { capacity }, tx => (tx as unknown as ReturnType<typeof fakeTx>).vehicle.update({ where: { id: vehicleId }, data: { capacity } }));
const assign = async (school: "a" | "b", routeId: string, studentId: string) => (await svc()).assignRider(coord(school), { routeId, studentId });
const seed = () => {
  vehicles = [{ id: "v-a", schoolId: "school-a", capacity: 3, active: true }, { id: "v-b", schoolId: "school-b", capacity: 3, active: true }];
  links = [{ routeId: "r-a", vehicleId: "v-a", schoolId: "school-a" }, { routeId: "r-b", vehicleId: "v-b", schoolId: "school-b" }];
  pupils = ["a", "b"].flatMap(s => [1, 2, 3].map(n => ({ id: `p-${s}${n}`, schoolId: `school-${s}`, campusId: `campus-${s}`, transportRouteId: n < 3 ? `r-${s}` : null, archivedAt: null })));
};
const riders = (routeId: string) => pupils.filter(p => p.transportRouteId === routeId).length;

test("a capacity cut with room to spare saves", async () => {
  seed();
  await shrink("a", "v-a", 2);
  assert.equal(vehicleOf("v-a").capacity, 2);
});

test("a concurrent cut and assignment never overbook the route: one of them gets 409", async () => {
  for (const order of [0, 1]) {
    seed();
    const runs = [shrink("a", "v-a", 2), assign("a", "r-a", "p-a3")];
    const results = await Promise.allSettled(order ? runs.reverse() : runs);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    assert.equal(failed.length, 1);
    assert.equal(failed[0].reason.status, 409);
    assert.ok(riders("r-a") <= (vehicleOf("v-a").capacity ?? 0), "riders fit the seats");
  }
});

test("each school's route is checked on its own", async () => {
  seed();
  await Promise.allSettled([shrink("a", "v-a", 2), assign("b", "r-b", "p-b3")]);
  assert.equal(riders("r-b"), 3);
  assert.equal(vehicleOf("v-a").capacity, 2);
  await assert.rejects(assign("b", "r-a", "p-b3"), (e: { status?: number }) => e.status === 404);
});

test("roles without campus operations are refused before any vehicle change", async () => {
  const src = readFileSync("src/app/api/transport/vehicles/route.ts", "utf8");
  const patch = src.slice(src.indexOf("export async function PATCH"));
  assert.ok(patch.indexOf('throw new ApiError("Forbidden", 403)') < patch.indexOf("changeVehicleWithinCapacity("));
  await assert.rejects((await svc()).assignRider({ userId: "t", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" } as never, { routeId: "r-a", studentId: "p-a3" }), (e: { status?: number }) => e.status === 403);
});
