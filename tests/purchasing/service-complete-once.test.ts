import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Job = { id: string; schoolId: string; assetId: string; status: string; dueOn: Date; work: string | null; nextDueOn: Date | null; completedById: string | null; cancelReason: string | null };
type Asset = { id: string; schoolId: string; campusId: string; nextServiceOn: Date | null };
let jobs: Job[] = [];
let assets: Asset[] = [];
let seq = 0;

// A row lock per job, held until the owning transaction ends (as UPDATE does in Postgres).
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
    assetService: {
      updateMany: async ({ where, data }: { where: { id: string; schoolId: string; status?: string }; data: Partial<Job> }) => {
        held.push(await acquire(`job:${where.id}`));
        await pause();
        const hits = jobs.filter((j) => j.id === where.id && j.schoolId === where.schoolId && (where.status === undefined || j.status === where.status));
        for (const j of hits) Object.assign(j, data);
        return { count: hits.length };
      },
      create: async ({ data }: { data: { schoolId: string; assetId: string; dueOn: Date } }) => {
        const job = { id: `job-${++seq}`, status: "SCHEDULED", work: null, nextDueOn: null, completedById: null, cancelReason: null, ...data } as Job;
        jobs.push(job);
        return job;
      },
    },
    schoolAsset: { update: async ({ where, data }: { where: { id: string }; data: Partial<Asset> }) => Object.assign(assets.find((a) => a.id === where.id)!, data) },
  };
}

const fakePrisma = {
  assetService: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string; status: string } }) => {
      const j = jobs.find((x) => x.id === where.id && x.schoolId === where.schoolId && x.status === where.status);
      return j ? { ...j } : null;
    },
    findUnique: async ({ where }: { where: { id: string } }) => jobs.find((x) => x.id === where.id) ?? null,
    updateMany: async (args: unknown) => fakeTx([]).assetService.updateMany(args as never),
  },
  schoolAsset: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId: string } }) => {
      const a = assets.find((x) => x.id === where.id && x.schoolId === where.schoolId && x.campusId === where.campusId);
      return a ? { id: a.id } : null;
    },
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const held: Array<() => void> = [];
    try { return await fn(fakeTx(held)); } finally { held.forEach((release) => release()); }
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, soleChecker: async () => false } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: () => true } });
mock.module("@/lib/notifications/events", { namedExports: { notifySelfApproval: async () => {} } });

const loadService = () => import("@/lib/purchasing/service");
const admin = (schoolId = "school-a", campusId = "campus-a") => ({ userId: "admin-1", role: "CAMPUS_ADMIN", schoolId, campusId }) as never;
const complete = async (u: unknown, jobId: string) => (await loadService()).closeService(u as never, jobId, { action: "COMPLETE", work: "Serviced the boiler", nextDueOn: "2026-12-01" });
const is409 = (e: { status?: number }) => e.status === 409;

function seed() {
  jobs = [{ id: "job-1", schoolId: "school-a", assetId: "asset-a", status: "SCHEDULED", dueOn: new Date("2026-11-01"), work: null, nextDueOn: null, completedById: null, cancelReason: null }];
  assets = [
    { id: "asset-a", schoolId: "school-a", campusId: "campus-a", nextServiceOn: null },
    { id: "asset-b", schoolId: "school-a", campusId: "campus-b", nextServiceOn: null },
  ];
  seq = 100; // created job ids must not collide with seeded ids
}

test("two simultaneous completions of one scheduled job: one succeeds and creates one next job; the other gets 409", async () => {
  seed();
  const [a, b] = await Promise.allSettled([complete(admin(), "job-1"), complete(admin(), "job-1")]);
  const ok = [a, b].filter((r) => r.status === "fulfilled");
  const failed = [a, b].filter((r): r is PromiseRejectedResult => r.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 1);
  assert.ok(is409(failed[0].reason), "the loser gets a 409");
  assert.equal(jobs.filter((j) => j.status === "SCHEDULED" && j.assetId === "asset-a").length, 1, "exactly one next job is scheduled");
  assert.equal(jobs.filter((j) => j.status === "DONE").length, 1);
});

test("a completion after the job is already done is refused and creates no next job", async () => {
  seed();
  await complete(admin(), "job-1");
  await assert.rejects(() => complete(admin(), "job-1"), is409);
  assert.equal(jobs.filter((j) => j.assetId === "asset-a").length, 2);
});

test("a campus admin cannot complete another campus's job, and nothing is written", async () => {
  seed();
  jobs.push({ id: "job-b", schoolId: "school-a", assetId: "asset-b", status: "SCHEDULED", dueOn: new Date("2026-11-01"), work: null, nextDueOn: null, completedById: null, cancelReason: null });
  await assert.rejects(() => complete(admin("school-a", "campus-a"), "job-b"), is409);
  assert.equal(jobs.find((j) => j.id === "job-b")!.status, "SCHEDULED");
});

test("another school's job is not found and nothing is written", async () => {
  seed();
  jobs.push({ id: "job-x", schoolId: "school-b", assetId: "asset-a", status: "SCHEDULED", dueOn: new Date("2026-11-01"), work: null, nextDueOn: null, completedById: null, cancelReason: null });
  await assert.rejects(() => complete(admin("school-a"), "job-x"), is409);
  assert.equal(jobs.find((j) => j.id === "job-x")!.status, "SCHEDULED");
});
