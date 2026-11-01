import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Row = { id: string; schoolId: string; issuer: string; clientId: string; clientSecret: string | null; status: string; lastTestedAt: Date | null; lastTestResult: string | null; discovery: unknown; emergencyAdminIds: string[] };
const rows = new Map<string, Row>();
const events: string[] = [];
// Runs once, right after a read, to model another request committing in between.
let afterRead: (() => Promise<unknown>) | null = null;

function matches(row: Row, where: Record<string, unknown>) {
  return Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v);
}

const fakePrisma = {
  identityConnection: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const found = [...rows.values()].find((r) => matches(r, where)) ?? null;
      const snapshot = found ? { ...found } : null;
      if (afterRead) { const hook = afterRead; afterRead = null; await hook(); }
      return snapshot;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const hits = [...rows.values()].filter((r) => matches(r, where));
      for (const r of hits) Object.assign(r, data);
      return { count: hits.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.get(where.id)!, data),
  },
  identityEvent: { create: async ({ data }: { data: { kind: string } }) => events.push(data.kind) },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakePrisma),
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/db/tenant-context", { namedExports: { runUnscoped: async (_label: string, fn: () => unknown) => fn(), runWithTenantContext: async (_c: unknown, fn: () => unknown) => fn() } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } } } });
mock.module("@/lib/auth/institution", { namedExports: { authorityRoleFor: () => "PRINCIPAL", isCampusOperator: () => false, isInstitutionAuthority: () => true, kindFor: () => "GROUP" } });
mock.module("@/lib/auth/mfa-crypto", { namedExports: { protectSecret: (s: string) => `enc:${s}:${Math.random()}`, revealSecret: (s: string) => s } });
mock.module("@/lib/students/enrollment", { namedExports: { applyEnrollment: async () => ({}), applyWithdrawal: async () => ({}), dateOnly: (v: unknown) => v } });
mock.module("@/lib/identity/oidc", { namedExports: { discover: async () => ({ ok: true, discovery: { issuer: "https://idp.test" } }), exchange: async () => ({}), pkce: () => ({}), readStateCookie: () => null, stateCookie: () => "", verifyIdToken: async () => ({}) } });

const loadService = () => import("@/lib/identity/service");
const admin = (schoolId = "school-a") => ({ userId: "owner-a", role: "PRINCIPAL", schoolId, campusId: "campus-a", kind: "GROUP" }) as never;
const TESTED_AT = new Date("2026-11-01T08:00:00Z");

function seed(overrides: Partial<Row> = {}) {
  rows.clear(); events.length = 0;
  rows.set("conn-1", { id: "conn-1", schoolId: "school-a", issuer: "https://old.idp.test", clientId: "client-old", clientSecret: "enc:one", status: "TESTED", lastTestedAt: TESTED_AT, lastTestResult: "OK", discovery: {}, emergencyAdminIds: [], ...overrides });
}

test("enabling loses to a trust change that lands after it read the tested row", async () => {
  const { setConnectionStatus, saveConnection } = await loadService();
  seed();
  afterRead = () => saveConnection(admin(), { id: "conn-1", name: "School SSO", issuer: "https://new.idp.test", clientId: "client-new" });
  await assert.rejects(() => setConnectionStatus(admin(), { id: "conn-1", status: "ENABLED" }), (e: { status?: number }) => e.status === 409);
  const row = rows.get("conn-1")!;
  assert.notEqual(row.status, "ENABLED");
  assert.equal(row.lastTestedAt, null);
  assert.equal(row.issuer, "https://new.idp.test");
  assert.ok(!events.includes("CONNECTION_ENABLED"));
});

test("a test that finishes after the trust settings changed does not mark the new settings tested", async () => {
  const { testConnection, saveConnection } = await loadService();
  seed({ status: "DRAFT", lastTestedAt: null });
  afterRead = () => saveConnection(admin(), { id: "conn-1", name: "School SSO", issuer: "https://new.idp.test", clientId: "client-new" });
  await assert.rejects(() => testConnection(admin(), "conn-1", "https://school.test"), (e: { status?: number }) => e.status === 409);
  assert.equal(rows.get("conn-1")!.lastTestedAt, null);
});

test("secret rotation after the test invalidates the enable", async () => {
  const { setConnectionStatus, saveConnection } = await loadService();
  seed();
  afterRead = () => saveConnection(admin(), { id: "conn-1", name: "School SSO", issuer: "https://old.idp.test", clientId: "client-old", clientSecret: "rotated" });
  await assert.rejects(() => setConnectionStatus(admin(), { id: "conn-1", status: "ENABLED" }), (e: { status?: number }) => e.status === 409);
  assert.notEqual(rows.get("conn-1")!.status, "ENABLED");
});

test("a replayed enable on an unchanged tested configuration succeeds once", async () => {
  const { setConnectionStatus } = await loadService();
  seed();
  await setConnectionStatus(admin(), { id: "conn-1", status: "ENABLED" });
  assert.equal(rows.get("conn-1")!.status, "ENABLED");
  await setConnectionStatus(admin(), { id: "conn-1", status: "ENABLED" });
  assert.equal(rows.get("conn-1")!.status, "ENABLED");
});

test("another school's connection is not found, so it cannot be enabled", async () => {
  const { setConnectionStatus } = await loadService();
  seed({ schoolId: "school-b" });
  await assert.rejects(() => setConnectionStatus(admin("school-a"), { id: "conn-1", status: "ENABLED" }), (e: { status?: number }) => e.status === 404);
  assert.notEqual(rows.get("conn-1")!.status, "ENABLED");
});
