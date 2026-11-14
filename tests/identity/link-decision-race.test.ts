import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { Prisma } from "@prisma/client";

// SKAI-1536: a REJECT and a LINK racing on the same PENDING request must commit exactly one decision.
// The loser gets a 409, writes no link and emits no audit event. Two schools stay apart.
type Req = { id: string; schoolId: string; connectionId: string; subject: string; status: string; decidedById?: string | null; decidedAt?: Date | null };
type Link = { schoolId: string; connectionId: string; subject: string; userId: string };
let reqs: Req[] = [];
let links: Link[] = [];
let events: { kind: string; schoolId: string }[] = [];
let gate: Promise<void> | null = null;
const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

const fakePrisma = {
  identityLinkRequest: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string; status: string } }) => {
      const hit = reqs.find((r) => r.id === where.id && r.schoolId === where.schoolId && r.status === where.status) ?? null;
      if (hit && gate) await gate; // both racers read PENDING before either claims it
      return hit ? { ...hit } : null;
    },
    updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Partial<Req> }) => {
      const hit = reqs.find((r) => r.id === where.id && r.status === where.status);
      if (!hit) return { count: 0 };
      Object.assign(hit, data);
      return { count: 1 };
    },
    update: async () => ({}),
  },
  identityLink: {
    create: async ({ data }: { data: Link }) => {
      if (links.some((l) => l.connectionId === data.connectionId && l.subject === data.subject)) throw p2002();
      links.push({ schoolId: data.schoolId, connectionId: data.connectionId, subject: data.subject, userId: data.userId });
      return data;
    },
  },
  user: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => (where.schoolId === "school-a" && ["target-a", "target-a2"].includes(where.id) ? { id: where.id } : null),
  },
  identityEvent: {
    create: async ({ data }: { data: { kind: string; schoolId: string } }) => {
      events.push({ kind: data.kind, schoolId: data.schoolId });
      return data;
    },
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakePrisma),
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/db/tenant-context", { namedExports: { runUnscoped: async (_l: string, fn: () => unknown) => fn(), runWithTenantContext: async (_c: unknown, fn: () => unknown) => fn() } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } } } });
mock.module("@/lib/auth/institution", { namedExports: { authorityRoleFor: () => "PRINCIPAL", isCampusOperator: () => false, isInstitutionAuthority: (u: { role: string }) => u.role === "PRINCIPAL", kindFor: () => "GROUP" } });
mock.module("@/lib/auth/mfa-crypto", { namedExports: { protectSecret: (s: string) => s, revealSecret: (s: string) => s } });
mock.module("@/lib/students/enrollment", { namedExports: { applyEnrollment: async () => ({}), applyWithdrawal: async () => ({}), dateOnly: (v: unknown) => v } });
mock.module("@/lib/identity/oidc", { namedExports: { discover: async () => ({}), exchange: async () => ({}), pkce: () => ({}), readStateCookie: () => null, stateCookie: () => "", verifyIdToken: async () => ({}) } });

const svc = () => import("@/lib/identity/service");
const admin = (s: "a" | "b" = "a") => ({ userId: `owner-${s}`, role: "PRINCIPAL", schoolId: `school-${s}`, campusId: `campus-${s}`, kind: "GROUP" }) as never;

async function race<T>(a: () => Promise<T>, b: () => Promise<T>) {
  let open!: () => void;
  gate = new Promise((r) => { open = r; });
  const both = Promise.allSettled([a(), b()]);
  await new Promise((r) => setTimeout(r, 10));
  gate = null; open();
  return both;
}
const reset = () => { reqs = [{ id: "req-1", schoolId: "school-a", connectionId: "conn-a", subject: "sub-1", status: "PENDING" }]; links = []; events = []; };
const rejectBody = { id: "req-1", decision: "REJECT" };
const linkBody = (userId = "target-a") => ({ id: "req-1", decision: "LINK", userId });

test("reject vs link on one PENDING request: exactly one decision commits", async () => {
  reset();
  const { decideLink } = await svc();
  const [x, y] = await race(() => decideLink(admin(), rejectBody), () => decideLink(admin(), linkBody()));
  const outcomes = [x, y];
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const loser = outcomes.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.equal((loser.reason as { status: number }).status, 409);
  const final = reqs[0].status;
  assert.ok(final === "REJECTED" || final === "LINKED");
  assert.equal(links.length, final === "LINKED" ? 1 : 0);
  assert.deepEqual(events.map((e) => e.kind), [final === "LINKED" ? "LINKED" : "LINK_REJECTED"]);
});

test("link vs link to two accounts: one link, one audit event", async () => {
  reset();
  const { decideLink } = await svc();
  const [x, y] = await race(() => decideLink(admin(), linkBody("target-a")), () => decideLink(admin(), linkBody("target-a2")));
  assert.equal([x, y].filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(links.length, 1);
  assert.deepEqual(events.map((e) => e.kind), ["LINKED"]);
});

test("replay of a decided request is refused and writes nothing", async () => {
  reset();
  const { decideLink } = await svc();
  await decideLink(admin(), rejectBody);
  await assert.rejects(decideLink(admin(), linkBody()), (e: { status?: number }) => e.status === 404);
  assert.equal(links.length, 0);
  assert.deepEqual(events.map((e) => e.kind), ["LINK_REJECTED"]);
});

test("another school's admin cannot decide a request in this school", async () => {
  reset();
  const { decideLink } = await svc();
  await assert.rejects(decideLink(admin("b"), linkBody()), (e: { status?: number }) => e.status === 404);
  assert.equal(reqs[0].status, "PENDING");
  assert.equal(links.length, 0);
  assert.equal(events.length, 0);
});
