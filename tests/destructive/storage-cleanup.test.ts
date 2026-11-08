import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CLEANUP_ATTEMPTS, enqueueCleanup, runCleanups } from "@/lib/storage/cleanup-queue";

// SKAI-1478: a deleted document's object key survives a failed storage delete and is retried.
type Row = { id: string; schoolId: string; campusId: string; objectKey: string; receiptId: string | null; status: string; attempts: number; lastError: string | null; createdAt: Date };
function fakeDb() {
  const rows: Row[] = [];
  let seq = 0;
  const match = (r: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => r[k as keyof Row] === v);
  const db = {
    storageCleanup: {
      upsert: async ({ where, create, update }: { where: { objectKey: string }; create: Omit<Row, "id" | "attempts" | "lastError" | "createdAt" | "receiptId"> & { receiptId?: string }; update: Partial<Row> }) => {
        const found = rows.find(r => r.objectKey === where.objectKey);
        if (found) return Object.assign(found, update);
        const row = { id: `c-${++seq}`, attempts: 0, lastError: null, createdAt: new Date(Date.now() + seq), receiptId: null, ...create };
        rows.push(row);
        return row;
      },
      findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) => rows.filter(r => match(r, where)).slice(0, take).map(r => ({ ...r })),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => { const hit = rows.filter(r => match(r, where)); hit.forEach(r => Object.assign(r, data)); return { count: hit.length }; },
    },
  };
  return { rows, db: db as never };
}
const docKey = (campus: string, id: string) => `student-docs/${campus}/${id}/birth.pdf`;

test("a transient storage failure keeps the tombstone PENDING and a retry removes the object", async () => {
  const { rows, db } = fakeDb();
  await enqueueCleanup(db, { schoolId: "school-a", campusId: "campus-a", objectKey: docKey("campus-a", "d1"), receiptId: "r1" });
  let fail = true;
  const removed: string[] = [];
  const remove = async (key: string) => { if (fail) throw new Error("provider 503"); removed.push(key); };
  assert.deepEqual(await runCleanups(db, { schoolId: "school-a", receiptId: "r1" }, remove), { done: 0, pending: 1, failed: 0 });
  assert.equal(rows[0].status, "PENDING");
  assert.equal(rows[0].lastError, "provider 503");
  fail = false;
  assert.deepEqual(await runCleanups(db, { schoolId: "school-a", receiptId: "r1" }, remove), { done: 1, pending: 0, failed: 0 });
  assert.equal(rows[0].status, "DONE");
  assert.deepEqual(removed, [docKey("campus-a", "d1")]);
  assert.deepEqual(await runCleanups(db, { schoolId: "school-a", receiptId: "r1" }, remove), { done: 0, pending: 0, failed: 0 }, "a replay after success does nothing");
});

test("repeated failures end in an operator-visible FAILED state", async () => {
  const { rows, db } = fakeDb();
  await enqueueCleanup(db, { schoolId: "school-a", campusId: "campus-a", objectKey: docKey("campus-a", "d2") });
  for (let i = 0; i < MAX_CLEANUP_ATTEMPTS; i++) await runCleanups(db, { schoolId: "school-a" }, async () => { throw new Error("denied"); });
  assert.equal(rows[0].status, "FAILED");
  assert.equal(rows[0].attempts, MAX_CLEANUP_ATTEMPTS);
});

test("re-enqueueing the same key does not duplicate the tombstone", async () => {
  const { rows, db } = fakeDb();
  await enqueueCleanup(db, { schoolId: "school-a", campusId: "campus-a", objectKey: docKey("campus-a", "d3") });
  await enqueueCleanup(db, { schoolId: "school-a", campusId: "campus-a", objectKey: docKey("campus-a", "d3") });
  assert.equal(rows.length, 1);
});

test("a sweep for one school never touches another school's or campus's objects", async () => {
  const { rows, db } = fakeDb();
  await enqueueCleanup(db, { schoolId: "school-a", campusId: "campus-a", objectKey: docKey("campus-a", "d4") });
  await enqueueCleanup(db, { schoolId: "school-a", campusId: "campus-b", objectKey: docKey("campus-b", "d5") });
  await enqueueCleanup(db, { schoolId: "school-b", campusId: "campus-c", objectKey: docKey("campus-c", "d6") });
  const removed: string[] = [];
  await runCleanups(db, { schoolId: "school-a", receiptId: undefined } as never, async key => { removed.push(key); });
  assert.deepEqual(removed.sort(), [docKey("campus-a", "d4"), docKey("campus-b", "d5")]);
  assert.equal(rows.find(r => r.schoolId === "school-b")!.status, "PENDING");
});
