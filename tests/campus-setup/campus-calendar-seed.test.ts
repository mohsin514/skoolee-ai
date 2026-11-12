import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

// SKAI-1402: a new campus gets its ACTIVE cycle and weekend inside the create transaction, scoped to its
// school; a seed failure rolls the campus back and reaches the caller instead of reporting success.
type Row = Record<string, any>;
let campuses: Row[] = [];
let cycles: Row[] = [];
let weekends: Row[] = [];
let failCycle = false;
const seed = () => {
  campuses = [
    { id: "campus-a1", schoolId: "school-a", name: "Synthetic North", createdAt: new Date(1), archivedAt: null },
    { id: "campus-b1", schoolId: "school-b", name: "Other North", createdAt: new Date(1), archivedAt: null },
  ];
  cycles = [
    { schoolId: "school-a", campusId: "campus-a1", label: "2026-2027", academicYear: 2026, status: "ACTIVE", startDate: new Date(2), endDate: null },
    { schoolId: "school-b", campusId: "campus-b1", label: "B-2030", academicYear: 2030, status: "ACTIVE", startDate: new Date(3), endDate: null },
  ];
  weekends = [{ schoolId: "school-a", campusId: "campus-a1", dayOfWeek: 6 }, { schoolId: "school-a", campusId: "campus-a1", dayOfWeek: 7 }, { schoolId: "school-b", campusId: "campus-b1", dayOfWeek: 5 }];
};
const match = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => v && typeof v === "object" && "not" in v ? row[k] !== v.not : v && typeof v === "object" && "equals" in v ? String(row[k]).toLowerCase() === String(v.equals).toLowerCase() : row[k] === v);
const client: Row = {
  $queryRaw: async () => [],
  campus: {
    findFirst: async ({ where }: Row) => campuses.filter(c => match(c, where)).sort((a, b) => a.createdAt - b.createdAt)[0] ?? null,
    findUnique: async () => null,
    create: async ({ data }: Row) => { const c = { id: `campus-new-${campuses.length}`, createdAt: new Date(10 + campuses.length), archivedAt: null, ...data }; campuses.push(c); return c; },
  },
  academicCycle: {
    findFirst: async ({ where }: Row) => cycles.find(c => match(c, where)) ?? null,
    create: async ({ data }: Row) => { if (failCycle) throw Object.assign(new Error("constraint"), { code: "P2003" }); cycles.push(data); return data; },
  },
  weekend: {
    findMany: async ({ where }: Row) => weekends.filter(w => match(w, where)),
    createMany: async ({ data }: Row) => { weekends.push(...data); return { count: data.length }; },
  },
};
// Snapshot-and-restore models a rolled-back transaction.
const prisma: Row = {
  ...client,
  $transaction: async (fn: (tx: unknown) => unknown) => {
    const snap = [campuses.slice(), cycles.slice(), weekends.slice()];
    try { return await fn(client); } catch (e) { [campuses, cycles, weekends] = snap; throw e; }
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/billing/entitlements", { namedExports: { assertPlanCapacity: async () => undefined } });
mock.module("@/lib/school/country", { namedExports: { schoolCountry: async () => "SA" } });
const create = async (schoolId: string, name: string) =>
  (await import("../../src/lib/school/campus-commands")).createCampusRecord({ schoolId } as never, { name, regId: `R-${name}`, city: "Riyadh" } as never);

beforeEach(() => { seed(); failCycle = false; });

test("two schools: each new campus copies only its own school's cycle and weekend, with schoolId", async () => {
  const a = await create("school-a", "Alpha Two");
  const b = await create("school-b", "Beta Two");
  assert.deepEqual(cycles.filter(c => c.campusId === a.id).map(c => [c.schoolId, c.label, c.status]), [["school-a", "2026-2027", "ACTIVE"]]);
  assert.deepEqual(weekends.filter(w => w.campusId === a.id).map(w => [w.schoolId, w.dayOfWeek]), [["school-a", 6], ["school-a", 7]]);
  assert.deepEqual(cycles.filter(c => c.campusId === b.id).map(c => [c.schoolId, c.label]), [["school-b", "B-2030"]]);
  assert.deepEqual(weekends.filter(w => w.campusId === b.id).map(w => [w.schoolId, w.dayOfWeek]), [["school-b", 5]]);
});

test("a school with no sibling gets a default year and Sunday off", async () => {
  campuses = []; cycles = []; weekends = [];
  const c = await create("school-a", "First");
  assert.equal(cycles.filter(x => x.campusId === c.id && x.schoolId === "school-a" && x.status === "ACTIVE").length, 1);
  assert.deepEqual(weekends.map(w => [w.schoolId, w.campusId, w.dayOfWeek]), [["school-a", c.id, 7]]);
});

test("a seed failure is reported and rolls the campus back", async () => {
  failCycle = true;
  await assert.rejects(create("school-a", "Broken"), /constraint/);
  assert.equal(campuses.some(c => c.name === "Broken"), false);
  assert.equal(weekends.length, 3);
});

test("standalone replay seed runs in its own transaction and surfaces failure", async () => {
  const { seedCampusCalendar } = await import("../../src/lib/school/campus-commands");
  failCycle = true;
  await assert.rejects(seedCampusCalendar("school-a", "campus-x"), /constraint/);
  failCycle = false;
  await seedCampusCalendar("school-a", "campus-x");
  assert.equal(cycles.filter(c => c.campusId === "campus-x" && c.schoolId === "school-a").length, 1);
});
