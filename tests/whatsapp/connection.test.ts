import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthUser } from "@/lib/auth";
import { connect, connectionStatus, disconnect, schoolSender } from "@/lib/whatsapp/connection";
import { graphMode, mockGraph, type GraphAdapter } from "@/lib/whatsapp/graph";
import { revealSecret } from "@/lib/auth/mfa-crypto";
import { TENANT_MODELS } from "@/lib/db/tenant-models";
import { exclusionFor } from "@/lib/ai-workflows/registry/exclusions";

process.env.AUTH_SECRET ||= "test-secret-for-whatsapp-connection-tests-0123456789";

type Row = Record<string, unknown> & { schoolId: string };
/** In-memory db that, like the tenant guard, refuses any query without a schoolId. */
function fakeDb() {
  const rows: Row[] = [], audits: Row[] = [];
  const pin = (where: { schoolId?: string }) => { if (!where?.schoolId) throw new Error("unscoped query"); return where.schoolId; };
  const match = (where: Record<string, unknown>) => (r: Row) => Object.entries(where).every(([k, v]) => r[k] === v);
  const db = {
    whatsAppConnection: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => { pin(where); return rows.find(match(where)) ?? null; },
      upsert: async ({ where, create, update }: { where: { schoolId: string }; create: Row; update: Row }) => {
        pin(where); const found = rows.find(r => r.schoolId === where.schoolId);
        if (found) { Object.assign(found, update); return found; }
        const row = { id: `c${rows.length}`, ...create }; rows.push(row); return row;
      },
      update: async ({ where, data }: { where: { schoolId: string }; data: Row }) => { pin(where); const r = rows.find(x => x.schoolId === where.schoolId)!; Object.assign(r, data); return r; },
    },
    auditLog: { create: async ({ data }: { data: Row }) => { pin(data); audits.push(data); return data; } },
  };
  return { db: db as never, rows, audits };
}
const admin = (schoolId: string): AuthUser => ({ userId: `u-${schoolId}`, email: "a@x.test", role: "ADMIN", schoolId, campusId: null, institutionKind: "STANDALONE" } as AuthUser);
const body = { code: "abc", wabaId: "1000000001", phoneNumberId: "2000000002", businessId: "3000000003" };

test("connect stores the token encrypted and never returns it", async () => {
  const { db, rows, audits } = fakeDb();
  const status = await connect(admin("s1"), body, db, mockGraph);
  assert.equal(status.connection?.status, "CONNECTED");
  assert.equal(JSON.stringify(status).includes("mock-token"), false);
  const stored = rows[0].accessTokenEnc as string;
  assert.notEqual(stored, "mock-token-abc");
  assert.equal(revealSecret(stored), "mock-token-abc");
  assert.equal(audits.length, 1);
  assert.equal(JSON.stringify(audits).includes("mock-token"), false);
});

test("only the institution authority may connect, read or disconnect", async () => {
  const { db } = fakeDb();
  for (const role of ["TEACHER", "PRINCIPAL", "ACCOUNTANT", "PARENT"]) {
    const user = { ...admin("s1"), role } as AuthUser;
    await assert.rejects(connect(user, body, db, mockGraph), /institution administrator/);
    await assert.rejects(connectionStatus(user, db), /institution administrator/);
    await assert.rejects(disconnect(user, db), /institution administrator/);
  }
  const groupAdmin = { ...admin("s1"), institutionKind: "GROUP" } as AuthUser; // GROUP authority is SUPER_ADMIN
  await assert.rejects(connect(groupAdmin, body, db, mockGraph), /institution administrator/);
});

test("tenant isolation: one school's connection is invisible to another", async () => {
  const { db } = fakeDb();
  await connect(admin("s1"), body, db, mockGraph);
  assert.equal((await connectionStatus(admin("s2"), db)).connection, null);
  assert.equal(await schoolSender("s2", db), null);
  assert.equal((await schoolSender("s1", db))?.token, "mock-token-abc");
  await assert.rejects(disconnect(admin("s2"), db), /not connected/);
  assert.ok(TENANT_MODELS.has("whatsAppConnection"));
});

test("disconnect clears the token and stops school sending", async () => {
  const { db, rows } = fakeDb();
  await connect(admin("s1"), body, db, mockGraph);
  await disconnect(admin("s1"), db);
  assert.equal(rows[0].accessTokenEnc, null);
  assert.equal(await schoolSender("s1", db), null);
});

test("bad ids, Meta failures and a disabled adapter are refused without storing anything", async () => {
  const { db, rows } = fakeDb();
  await assert.rejects(connect(admin("s1"), { ...body, wabaId: "../x" }, db, mockGraph), /could not read/);
  await assert.rejects(connect(admin("s1"), { ...body, code: "invalid" }, db, mockGraph), /did not confirm/);
  const disabled = { ...mockGraph, mode: "disabled" } as GraphAdapter;
  await assert.rejects(connect(admin("s1"), body, db, disabled), /not configured/);
  assert.equal(rows.length, 0);
});

test("graph mode never goes live without Meta credentials", () => {
  assert.equal(graphMode({}), "disabled");
  assert.equal(graphMode({ META_APP_ID: "1", META_APP_SECRET: "s" }), "live");
  assert.equal(graphMode({ WHATSAPP_GRAPH_MODE: "mock", META_APP_ID: "1", META_APP_SECRET: "s" }), "mock");
});

test("connecting and disconnecting a WABA are human-only AI exclusions", () => {
  assert.ok(exclusionFor("whatsapp.connect_waba"));
  assert.ok(exclusionFor("whatsapp.disconnect_waba"));
});
