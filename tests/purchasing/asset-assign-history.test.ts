import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1753: overlapping custodian and location assignments serialise on the asset row and keep both history events.
type Asset = { id: string; schoolId: string; campusId: string; custodian: string | null; location: string | null; history: Array<Record<string, unknown>> };
let assets: Asset[] = [];
const locks = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>((r) => (release = r))));
  await previous;
  return release;
}
const pause = () => new Promise((r) => setTimeout(r, 5));
function fakeTx(held: Array<() => void>) {
  return {
    $queryRaw: async (_s: TemplateStringsArray, id: string) => { held.push(await acquire(`asset:${id}`)); return []; },
    schoolAsset: {
      findFirst: async ({ where }: { where: Partial<Asset> }) => { await pause(); const a = assets.find((x) => x.id === where.id && x.schoolId === where.schoolId && x.campusId === where.campusId); return a ? structuredClone(a) : null; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Asset> }) => { await pause(); return Object.assign(assets.find((a) => a.id === where.id)!, data); },
    },
  };
}
const fakePrisma = {
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => { const held: Array<() => void> = []; try { return await fn(fakeTx(held)); } finally { held.forEach((r) => r()); } },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, soleChecker: async () => false } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: () => true } });
mock.module("@/lib/notifications/events", { namedExports: { notifySelfApproval: async () => {} } });

const user = (role = "CAMPUS_ADMIN", schoolId = "school-a", campusId = "campus-a") => ({ userId: `u-${role}`, role, schoolId, campusId }) as never;
const assign = async (u: unknown, id: string, data: unknown) => (await import("@/lib/purchasing/service")).assignAsset(u as never, id, data);
const seed = () => { assets = [
  { id: "asset-a", schoolId: "school-a", campusId: "campus-a", custodian: null, location: null, history: [{ action: "RECEIVED" }] },
  { id: "asset-b", schoolId: "school-b", campusId: "campus-b", custodian: null, location: null, history: [{ action: "RECEIVED" }] },
  { id: "asset-c", schoolId: "school-a", campusId: "campus-c", custodian: null, location: null, history: [{ action: "RECEIVED" }] },
]; };
const actions = (id: string) => assets.find((a) => a.id === id)!.history.map((h) => h.action);

test("sequential assignments keep both events after the receipt", async () => {
  seed();
  await assign(user(), "asset-a", { custodian: "Synthetic Custodian" });
  await assign(user(), "asset-a", { location: "Room 101" });
  assert.deepEqual(actions("asset-a"), ["RECEIVED", "ASSIGNED", "ASSIGNED"]);
});

test("concurrent custodian and location assignments keep both fields and both events, in order", async () => {
  seed();
  await Promise.all([assign(user(), "asset-a", { custodian: "Synthetic Custodian" }), assign(user(), "asset-a", { location: "Room 101" })]);
  const a = assets[0];
  assert.equal(a.custodian, "Synthetic Custodian");
  assert.equal(a.location, "Room 101");
  assert.deepEqual(actions("asset-a"), ["RECEIVED", "ASSIGNED", "ASSIGNED"]);
  assert.deepEqual(a.history[2].from, { custodian: "Synthetic Custodian", location: null }, "the second event saw the first");
});

test("another school's or campus's asset is not found and nothing is written", async () => {
  seed();
  await assert.rejects(assign(user("CAMPUS_ADMIN", "school-b", "campus-b"), "asset-a", { location: "Room 9" }), (e: { status?: number }) => e.status === 404);
  await assert.rejects(assign(user(), "asset-c", { location: "Room 9" }), (e: { status?: number }) => e.status === 404);
  assert.deepEqual(actions("asset-a"), ["RECEIVED"]);
  assert.deepEqual(actions("asset-c"), ["RECEIVED"]);
});

test("a role that does not run assets is refused with 403", async () => {
  seed();
  await assert.rejects(assign(user("TEACHER"), "asset-a", { location: "Room 9" }), (e: { status?: number }) => e.status === 403);
  assert.deepEqual(actions("asset-a"), ["RECEIVED"]);
});
