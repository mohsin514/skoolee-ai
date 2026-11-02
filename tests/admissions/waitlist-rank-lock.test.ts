import assert from "node:assert/strict";
import { mock, test } from "node:test";

type App = { id: string; schoolId: string; campusId: string; status: string; waitlistRank: number | null };
let apps: App[] = [];

// One lock per campus, held until the owning transaction ends (as FOR UPDATE does in Postgres).
const locks = new Map<string, Promise<void>>();
async function acquire(campusId: string): Promise<() => void> {
  const previous = locks.get(campusId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  locks.set(campusId, previous.then(() => next));
  await previous;
  return release;
}

function fakeDb(held: Array<() => void>) {
  return {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("FOR UPDATE")) held.push(await acquire(String(values[0])));
      return [];
    },
    admissionApplication: {
      findFirst: async ({ where }: { where: { schoolId: string; campusId: string; status: string; id: { not: string }; waitlistRank: { lt?: number; gt?: number } } }) => {
        const candidates = apps.filter((a) => a.schoolId === where.schoolId && a.campusId === where.campusId && a.status === where.status && a.id !== where.id.not && a.waitlistRank !== null && (where.waitlistRank.lt !== undefined ? (a.waitlistRank as number) < where.waitlistRank.lt : (a.waitlistRank as number) > (where.waitlistRank.gt as number)));
        const sorted = candidates.sort((x, y) => (where.waitlistRank.lt !== undefined ? (y.waitlistRank as number) - (x.waitlistRank as number) : (x.waitlistRank as number) - (y.waitlistRank as number)));
        return sorted[0] ? { id: sorted[0].id, waitlistRank: sorted[0].waitlistRank } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { waitlistRank: number } }) => {
        Object.assign(apps.find((a) => a.id === where.id)!, { waitlistRank: data.waitlistRank });
        return {};
      },
      aggregate: async ({ where }: { where: { schoolId: string; campusId: string; status: string } }) => {
        const ranks = apps.filter((a) => a.schoolId === where.schoolId && a.campusId === where.campusId && a.status === where.status && a.waitlistRank !== null).map((a) => a.waitlistRank as number);
        return { _max: { waitlistRank: ranks.length ? Math.max(...ranks) : null } };
      },
    },
  };
}

const fakePrisma = {
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const held: Array<() => void> = [];
    try { return await fn(fakeDb(held)); } finally { held.forEach((release) => release()); }
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } } } });

const loadAssessments = () => import("@/lib/admissions/assessments");

/** One waitlist decision: take the rank, pause as a real request would before saving, then persist it. */
async function decide(schoolId: string, campusId: string, applicationId: string, withLock = true) {
  const { assignWaitlistRank, nextWaitlistRank } = await loadAssessments();
  return fakePrisma.$transaction(async (db) => {
    const rank = withLock ? await assignWaitlistRank(db as never, schoolId, campusId) : await nextWaitlistRank(db as never, schoolId, campusId);
    await new Promise((r) => setTimeout(r, 5));
    apps.push({ id: applicationId, schoolId, campusId, status: "WAITLISTED", waitlistRank: rank });
    return rank;
  });
}

test("two concurrent decisions in one campus get distinct ranks", async () => {
  apps = [];
  const [a, b] = await Promise.all([decide("school-a", "campus-a", "app-1"), decide("school-a", "campus-a", "app-2")]);
  assert.notEqual(a, b);
  assert.deepEqual(apps.map((x) => x.waitlistRank).sort(), [1, 2]);
});

test("without the lock the same race produces a duplicate rank (reproduction)", async () => {
  apps = [];
  const [a, b] = await Promise.all([decide("school-a", "campus-a", "app-1", false), decide("school-a", "campus-a", "app-2", false)]);
  assert.equal(a, b);
});

test("a waitlist move swaps positions under the lock, and a later decision takes the next free position", async () => {
  apps = [{ id: "app-1", schoolId: "school-a", campusId: "campus-a", status: "WAITLISTED", waitlistRank: 1 }, { id: "app-2", schoolId: "school-a", campusId: "campus-a", status: "WAITLISTED", waitlistRank: 2 }];
  const { moveOnWaitlist } = await loadAssessments();
  const moveUser = { schoolId: "school-a", userId: "staff-1" } as never;
  await fakePrisma.$transaction(async (db) =>
    moveOnWaitlist({ db: { ...(db as object), admissionApplicationEvent: { create: async () => ({}) } } as never, user: moveUser, campusId: "campus-a", application: { ...apps[1] } as never } as never, "up"),
  );
  assert.deepEqual(apps.map((a) => [a.id, a.waitlistRank]), [["app-1", 2], ["app-2", 1]]);
  const rank = await decide("school-a", "campus-a", "app-3");
  assert.equal(rank, 3);
});

test("campuses are numbered independently", async () => {
  apps = [];
  const [a, b] = await Promise.all([decide("school-a", "campus-a", "app-1"), decide("school-a", "campus-b", "app-2")]);
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test("schools are numbered independently, even for a campus with the same name", async () => {
  apps = [];
  const [a, b] = await Promise.all([decide("school-a", "campus-a", "app-1"), decide("school-b", "campus-x", "app-2")]);
  assert.equal(a, 1);
  assert.equal(b, 1);
});
