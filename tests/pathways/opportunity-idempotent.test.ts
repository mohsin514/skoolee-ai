import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1723: retried or concurrent identical Add opportunity submits leave one active listing and replay it.
type Row = Record<string, unknown> & { id: string; schoolId: string; campusId: string; status: string };
const rows: Row[] = [];
const locks = new Map<string, Promise<void>>();
const eq = (v: unknown, w: unknown) => {
  if (w && typeof w === "object" && !(w instanceof Date) && "equals" in w) return String(v).toLowerCase() === String((w as { equals: string }).equals).toLowerCase();
  if (w instanceof Date || v instanceof Date) return (v as Date | null)?.getTime?.() === (w as Date | null)?.getTime?.();
  return v === w;
};
const model = {
  findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find(r => Object.entries(where).every(([k, w]) => eq(r[k] ?? null, w))) ?? null,
  create: async ({ data }: { data: Record<string, unknown> }) => { await new Promise(r => setTimeout(r, 5)); const row = { id: `o${rows.length + 1}`, status: "ACTIVE", ...data } as Row; rows.push(row); return row; },
};
const prisma = {
  pathwayCounsellor: { findFirst: async () => null },
  pathwayOpportunity: model,
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
    let release = () => {};
    const tx = {
      pathwayOpportunity: model,
      $executeRaw: async (_s: TemplateStringsArray, key: string) => {
        while (locks.has(key)) await locks.get(key);
        locks.set(key, new Promise<void>(r => { release = () => { locks.delete(key); r(); }; }));
      },
    };
    try { return await fn(tx); } finally { release(); }
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });

const leader = (s: "a" | "b") => ({ userId: `lead-${s}`, schoolId: `school-${s}`, campusId: `campus-${s}1`, role: "PRINCIPAL" }) as never;
const data = { title: "Synthetic STEM Scholarship", provider: "QA Foundation", kind: "SCHOLARSHIP", sourceUrl: "https://example.test/stem", eligibility: "Grade 11 learners", deadline: "2026-12-01" };

test("a retry after a lost response replays the one listing", async () => {
  const { saveOpportunity } = await import("../../src/lib/pathways/service");
  rows.length = 0;
  const first = await saveOpportunity(leader("a"), data);
  const retry = await saveOpportunity(leader("a"), { ...data, title: "synthetic stem scholarship" });
  assert.equal(first.replayed, false);
  assert.equal(retry.replayed, true);
  assert.equal(retry.id, first.id);
  assert.equal(rows.length, 1);
});

test("two concurrent identical submits serialise into one listing", async () => {
  const { saveOpportunity } = await import("../../src/lib/pathways/service");
  rows.length = 0;
  const [x, y] = await Promise.all([saveOpportunity(leader("a"), data), saveOpportunity(leader("a"), data)]);
  assert.equal(rows.length, 1);
  assert.equal(x.id, y.id);
  assert.deepEqual([x.replayed, y.replayed].sort(), [false, true]);
});

test("a different deadline, a withdrawn copy, or another school creates a new listing", async () => {
  const { saveOpportunity } = await import("../../src/lib/pathways/service");
  rows.length = 0;
  const first = await saveOpportunity(leader("a"), data);
  assert.equal((await saveOpportunity(leader("a"), { ...data, deadline: "2027-01-15" })).replayed, false);
  rows.find(r => r.id === first.id)!.status = "WITHDRAWN";
  assert.equal((await saveOpportunity(leader("a"), data)).replayed, false);
  const other = await saveOpportunity(leader("b"), data);
  assert.equal(other.replayed, false);
  assert.equal(other.schoolId, "school-b");
  assert.equal(rows.length, 4);
});

test("a teacher who is not a counsellor gets 403", async () => {
  const { saveOpportunity } = await import("../../src/lib/pathways/service");
  const teacher = { userId: "t1", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" } as never;
  await assert.rejects(saveOpportunity(teacher, data), (e: { status?: number }) => e.status === 403);
});
