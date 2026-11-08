import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-607: a revised trip version is checked against the trip it replaces. A material change needs fresh
// answers, so its response deadline must still be open (families cannot answer a closed version); a stale
// version is refused; another school or campus cannot revise; a teacher is denied.
type Trip = { id: string; schoolId: string; campusId: string; status: string; currentVersion: number };
let trip: Trip, versions: { version: number; material: boolean }[] = [];
const tx = {
  $queryRaw: async (_s: TemplateStringsArray, id: string, schoolId: string) => (trip.id === id && trip.schoolId === schoolId ? [{ id }] : []),
  trip: { findUnique: async () => ({ ...trip }), update: async ({ data }: { data: Partial<Trip> }) => Object.assign(trip, data) },
  tripVersion: { create: async ({ data }: { data: { version: number; material: boolean } }) => { versions.push(data); return data; } },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: tx } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: unknown) => unknown) => fn(tx) } });

const leader = (s: "a" | "b", campus = `campus-${s}`) => ({ userId: `lead-${s}`, role: "CAMPUS_ADMIN", schoolId: `school-${s}`, campusId: campus }) as never;
const day = 86_400_000, at = (ms: number) => new Date(Date.now() + ms).toISOString();
const terms = (respondBy: number, extra: Record<string, unknown> = {}) => ({ title: "Museum visit", destination: "City museum", departAt: at(5 * day), returnAt: at(5 * day + 3_600_000), respondBy: at(respondBy), contact: "Front office", changeNote: "New bus time", knownVersion: 1, ...extra });
const reset = () => { trip = { id: "t-1", schoolId: "school-a", campusId: "campus-a", status: "OPEN", currentVersion: 1 }; versions = []; };
const svc = () => import("@/lib/family/trips");

test("SKAI-607: a material revision with a deadline already passed is refused and publishes nothing", async () => {
  reset();
  await assert.rejects((await svc()).reviseTrip(leader("a"), "t-1", terms(-day)), /deadline must be in the future/);
  assert.equal(versions.length, 0);
  assert.equal(trip.currentVersion, 1);
});

test("SKAI-607: a non-material correction may keep a passed deadline; a material one with an open deadline publishes v2", async () => {
  reset();
  await (await svc()).reviseTrip(leader("a"), "t-1", terms(-day, { material: false }));
  assert.equal(trip.currentVersion, 2);
  await (await svc()).reviseTrip(leader("a"), "t-1", terms(2 * day, { knownVersion: 2 }));
  assert.deepEqual(versions.map(v => [v.version, v.material]), [[2, false], [3, true]]);
});

test("SKAI-607: a stale version, another school, another campus and a teacher are refused", async () => {
  reset();
  await assert.rejects((await svc()).reviseTrip(leader("a"), "t-1", terms(2 * day, { knownVersion: 0 })), /newer terms/);
  await assert.rejects((await svc()).reviseTrip(leader("b"), "t-1", terms(2 * day)), /not found/);
  await assert.rejects((await svc()).reviseTrip(leader("a", "campus-a2"), "t-1", terms(2 * day)), /not found/);
  await assert.rejects((await svc()).reviseTrip({ userId: "t", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" } as never, "t-1", terms(2 * day)), /Only school leaders/);
  assert.equal(versions.length, 0);
});
