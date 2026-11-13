import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { Prisma } from "@prisma/client";

// SKAI-1517: two submits of the same roster batch id race past the lookup; the loser must replay, not leak P2002.
type Batch = { id: string; schoolId: string; connectionId: string; externalBatchId: string; payloadHash: string; status: string };
const batches: Batch[] = [];
let gate: Promise<void> | null = null;
let seq = 0;
const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

const fakePrisma = {
  identityConnection: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => (({ "conn-a": "school-a", "conn-b": "school-b" }) as Record<string, string>)[where.id] === where.schoolId ? { id: where.id, schoolId: where.schoolId, roleMap: {}, fieldOwnership: {} } : null },
  campus: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => (where.id === "campus-a" && where.schoolId === "school-a") || (where.id === "campus-b" && where.schoolId === "school-b") ? { id: where.id } : null },
  rosterBatch: {
    findUnique: async ({ where }: { where: { connectionId_externalBatchId: { connectionId: string; externalBatchId: string } } }) => {
      const k = where.connectionId_externalBatchId;
      const hit = batches.find((b) => b.connectionId === k.connectionId && b.externalBatchId === k.externalBatchId) ?? null;
      if (!hit && gate) await gate; // both racers see "no row" before either creates
      return hit ? { ...hit } : null;
    },
    create: async ({ data }: { data: Omit<Batch, "id" | "status"> }) => {
      if (batches.some((b) => b.connectionId === data.connectionId && b.externalBatchId === data.externalBatchId)) throw p2002();
      const b = { id: `batch-${++seq}`, status: "DRY_RUN", ...data, schoolId: data.schoolId, connectionId: data.connectionId, externalBatchId: data.externalBatchId, payloadHash: data.payloadHash };
      batches.push(b);
      return b;
    },
    update: async () => ({}),
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakePrisma),
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: new Proxy(fakePrisma, { get: (t, k) => (t as Record<string | symbol, unknown>)[k] ?? new Proxy({}, { get: (_m, op) => async () => (String(op).startsWith("findMany") ? [] : null) }) }) } });
mock.module("@/lib/db/tenant-context", { namedExports: { runUnscoped: async (_l: string, fn: () => unknown) => fn(), runWithTenantContext: async (_c: unknown, fn: () => unknown) => fn() } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } } } });
mock.module("@/lib/auth/institution", { namedExports: { authorityRoleFor: () => "PRINCIPAL", isCampusOperator: (u: { role: string }) => u.role === "CAMPUS_ADMIN", isInstitutionAuthority: (u: { role: string }) => u.role === "PRINCIPAL", kindFor: () => "GROUP" } });
mock.module("@/lib/auth/mfa-crypto", { namedExports: { protectSecret: (s: string) => s, revealSecret: (s: string) => s } });
mock.module("@/lib/students/enrollment", { namedExports: { applyEnrollment: async () => ({}), applyWithdrawal: async () => ({}), dateOnly: (v: unknown) => v } });
mock.module("@/lib/identity/oidc", { namedExports: { discover: async () => ({}), exchange: async () => ({}), pkce: () => ({}), readStateCookie: () => null, stateCookie: () => "", verifyIdToken: async () => ({}) } });

const svc = () => import("@/lib/identity/service");
const admin = (s: "a" | "b" = "a") => ({ userId: `owner-${s}`, role: "PRINCIPAL", schoolId: `school-${s}`, campusId: `campus-${s}`, kind: "GROUP" }) as never;
const body = (s: "a" | "b", name = "Student One") => ({ connectionId: `conn-${s}`, campusId: `campus-${s}`, externalBatchId: "BATCH-001", rows: [{ kind: "student", externalId: "S-1", name }] });

async function race<T>(a: () => Promise<T>, b: () => Promise<T>) {
  let open!: () => void;
  gate = new Promise((r) => { open = r; });
  const both = Promise.allSettled([a(), b()]);
  await new Promise((r) => setTimeout(r, 10));
  gate = null; open();
  return both;
}

test("concurrent identical submits resolve to one batch, one replayed", async () => {
  batches.length = 0;
  const { submitBatch } = await svc();
  const [x, y] = await race(() => submitBatch(admin(), body("a")), () => submitBatch(admin(), body("a")));
  assert.equal(x.status, "fulfilled"); assert.equal(y.status, "fulfilled");
  const vals = [x, y].map((r) => (r as PromiseFulfilledResult<{ id: string; replayed: boolean; status: string }>).value);
  assert.equal(vals[0].id, vals[1].id);
  assert.deepEqual(vals.map((v) => v.replayed).sort(), [false, true]);
  assert.ok(vals.every((v) => v.status === "DRY_RUN"));
  assert.equal(batches.length, 1);
});

test("concurrent submits with different rows: loser gets a controlled 409, never P2002", async () => {
  batches.length = 0;
  const { submitBatch } = await svc();
  const res = await race(() => submitBatch(admin(), body("a")), () => submitBatch(admin(), body("a", "Other Name")));
  const failed = res.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(failed.length, 1);
  assert.equal(failed[0].reason.status, 409);
  assert.ok(!(failed[0].reason instanceof Prisma.PrismaClientKnownRequestError));
});

test("two schools reusing the same external batch id stay isolated", async () => {
  batches.length = 0;
  const { submitBatch } = await svc();
  const [a, b] = await race(() => submitBatch(admin("a"), body("a")), () => submitBatch(admin("b"), body("b")));
  const ids = [a, b].map((r) => (r as PromiseFulfilledResult<{ id: string; replayed: boolean }>).value);
  assert.notEqual(ids[0].id, ids[1].id);
  assert.ok(ids.every((v) => v.replayed === false));
  await assert.rejects(() => submitBatch(admin("b"), body("a")), (e: { status?: number }) => e.status === 404);
});

test("a denied role cannot submit", async () => {
  const { submitBatch } = await svc();
  const teacher = { userId: "t", role: "TEACHER", schoolId: "school-a", campusId: "campus-a", kind: "CAMPUS" } as never;
  await assert.rejects(() => submitBatch(teacher, body("a")), (e: { status?: number }) => e.status === 403);
});
