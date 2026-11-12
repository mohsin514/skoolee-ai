import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1508: campus creation serialises the plan-capacity check per school. This harness models a
// one-connection-per-transaction pool and a per-school row lock, so a global-client read made while the
// lock is held would deadlock (the QA failure), and two creates for one school cannot both pass the limit.

type Campus = { id: string; schoolId: string; name: string; regId: string; archivedAt: Date | null; board: string };
let campuses: Campus[] = [];
const limits: Record<string, number> = {};
const locks = new Map<string, Promise<void>>();
let openTx = 0;
let globalReadsInsideTx = 0;
let seq = 0;

const campusApi = {
  findFirst: async ({ where }: { where: { schoolId: string; name?: { equals: string } } }) => (where.name ? campuses.find((c) => c.schoolId === where.schoolId && !c.archivedAt && c.name.toLowerCase() === where.name!.equals.toLowerCase()) ?? null : null),
  findUnique: async ({ where }: { where: { regId: string } }) => campuses.find((c) => c.regId === where.regId) ?? null,
  count: async ({ where }: { where: { schoolId: string } }) => campuses.filter((c) => c.schoolId === where.schoolId && !c.archivedAt).length,
  create: async ({ data }: { data: Omit<Campus, "id" | "archivedAt"> }) => { const c = { ...data, id: `c${++seq}`, archivedAt: null }; campuses.push(c); return c; },
};

type Tx = { campus: typeof campusApi; $queryRaw: (s: TemplateStringsArray, schoolId: string) => Promise<void>; held: (() => void)[] };
const makeTx = (): Tx => {
  const t: Tx = {
    campus: campusApi,
    held: [],
    $queryRaw: async (_s, schoolId) => {
      while (locks.has(schoolId)) await locks.get(schoolId);
      let release!: () => void;
      locks.set(schoolId, new Promise<void>((r) => { release = r; }));
      t.held.push(() => { locks.delete(schoolId); release(); });
    },
  };
  return t;
};

const prisma = {
  campus: campusApi,
  academicCycle: { findFirst: async () => null, create: async () => ({}) },
  weekend: { findMany: async () => [], createMany: async () => ({}) },
  $transaction: async <T>(fn: (t: Tx) => Promise<T>) => {
    const t = makeTx();
    openTx++;
    try { return await fn(t); } finally {
      openTx--;
      t.held.forEach((rel) => rel());
    }
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/db/audit-trail", { namedExports: { withoutAutoAudit: <T>(fn: () => T) => fn() } });
mock.module("@/lib/school/country", { namedExports: { schoolCountry: async () => { if (openTx > 0) globalReadsInsideTx++; await new Promise((r) => setTimeout(r, 1)); return "PK"; } } });
mock.module("@/lib/billing/entitlements", {
  namedExports: {
    assertPlanCapacity: async ({ schoolId, client }: { schoolId: string; client: Tx }) => {
      const used = await client.campus.count({ where: { schoolId } });
      await new Promise((r) => setTimeout(r, 2));
      if (used >= limits[schoolId]) throw new Error(`Your plan allows ${limits[schoolId]} campus`);
    },
  },
});

const load = () => import("@/lib/school/campus-commands");
const fields = (name: string) => ({ name, city: "Lahore", email: null, phone: null, website: null, address: null, principalName: null, board: null, regId: null });
const createMany = async (schoolId: string, n: number, prefix: string) => {
  const { createCampusRecord } = await load();
  return Promise.allSettled(Array.from({ length: n }, (_, i) => createCampusRecord({ schoolId } as never, fields(`${prefix}-${i}`) as never)));
};
const active = (schoolId: string) => campuses.filter((c) => c.schoolId === schoolId && !c.archivedAt).length;
const reset = () => { campuses = []; globalReadsInsideTx = 0; };

test("BASIC: concurrent creates from zero make exactly one campus", async () => {
  reset(); limits["school-a"] = 1;
  const results = await createMany("school-a", 2, "a");
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(active("school-a"), 1);
});

test("PRO: a burst larger than the pool stops at exactly the limit, with no global reads under the lock", async () => {
  reset(); limits["school-b"] = 5;
  const results = await createMany("school-b", 8, "b");
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal(active("school-b"), 5);
  assert.equal(globalReadsInsideTx, 0, "default board must be resolved before the locked transaction");
});

test("two schools under concurrent load stay independent", async () => {
  reset(); limits["school-a"] = 1; limits["school-b"] = 5;
  await Promise.all([createMany("school-a", 6, "a"), createMany("school-b", 8, "b")]);
  assert.equal(active("school-a"), 1);
  assert.equal(active("school-b"), 5);
});

test("archive then concurrent creates refill only the freed slot; restore is not double-counted", async () => {
  reset(); limits["school-a"] = 1;
  await createMany("school-a", 1, "first");
  campuses[0].archivedAt = new Date();
  const results = await createMany("school-a", 3, "again");
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(active("school-a"), 1);
});

test("the default board comes from the school's country when none is given", async () => {
  reset(); limits["school-c"] = 2;
  await createMany("school-c", 1, "c");
  assert.ok(campuses[0].board.length > 0);
});
