import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import { countryOf, ownerAction, priceFor, reserve, setEnabled, settle, usage } from "../../src/lib/whatsapp/managed";
import { TENANT_MODELS } from "../../src/lib/db/tenant-models";
import { exclusionFor } from "../../src/lib/ai-workflows/registry/exclusions";

// SKAI-1046: managed sending — pricing, prepaid cap, ledger, tenant isolation and permissions. No Meta calls.

type Row = Record<string, unknown> & { schoolId: string };
function fakeDb() {
  const managed: Row[] = [], ledger: Row[] = [], audits: Row[] = [];
  const pin = (where: { schoolId?: unknown }) => { assert.equal(typeof where?.schoolId, "string", "unscoped query"); return where.schoolId as string; };
  const matches = (r: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) =>
    v && typeof v === "object" && "gte" in v ? (r[k] as bigint) >= (v as { gte: bigint }).gte : r[k] === v);
  const apply = (r: Row, data: Record<string, unknown>) => { for (const [k, v] of Object.entries(data)) r[k] = v && typeof v === "object" && "decrement" in v ? (r[k] as bigint) - (v as { decrement: bigint }).decrement : v && typeof v === "object" && "increment" in v ? (r[k] as bigint) + (v as { increment: bigint }).increment : v; };
  const db = {
    whatsAppManagedSending: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => { pin(where); return managed.find(r => matches(r, where)) ?? null; },
      upsert: async ({ where, create, update }: { where: { schoolId: string }; create: Row; update: Row }) => { pin(where); const r = managed.find(x => x.schoolId === where.schoolId); if (r) { apply(r, update); return r; } const row = { id: `m${managed.length}`, enabled: false, balanceMicroUsd: BigInt(0), ...create }; managed.push(row); return row; },
      update: async ({ where, data }: { where: { schoolId: string }; data: Row }) => { pin(where); const r = managed.find(x => x.schoolId === where.schoolId)!; apply(r, data); return r; },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => { pin(where); const rows = managed.filter(r => matches(r, where)); rows.forEach(r => apply(r, data)); return { count: rows.length }; },
    },
    whatsAppUsageEntry: {
      create: async ({ data }: { data: Row }) => { pin(data); const row = { id: `e${ledger.length}`, createdAt: new Date(), ...data }; ledger.push(row); return row; },
      findMany: async ({ where }: { where: { schoolId: string } }) => { pin(where); return ledger.filter(r => r.schoolId === where.schoolId).reverse(); },
    },
    auditLog: { create: async ({ data }: { data: Row }) => { pin(data); audits.push(data); return data; } },
  };
  return { db: db as never, managed, ledger, audits };
}
const admin = (schoolId: string, role: AuthUser["role"] = "ADMIN"): AuthUser => ({ userId: `u-${schoolId}`, email: "a@x.test", role, schoolId, campusId: null, institutionKind: "STANDALONE" });
const owner: AuthUser = { userId: "owner", email: "o@x.test", role: "APP_OWNER", schoolId: "platform", campusId: null };
const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

async function funded(db: never, schoolId: string, amount: number) {
  await ownerAction(owner, schoolId, { action: "provision", phoneNumberId: "5550000001" }, db);
  await ownerAction(owner, schoolId, { action: "top-up", amountMicroUsd: amount, reference: "INV-1" }, db);
  await setEnabled(admin(schoolId), true, db);
}

test("pricing: Meta rate plus margin by destination country; unknown rates are blocked, service is free", () => {
  assert.equal(countryOf("+92 300 1234567"), "PK");
  assert.equal(countryOf("966500000000"), "SA");
  assert.deepEqual(priceFor("923001234567", "UTILITY", { WHATSAPP_MANAGED_MARGIN_MICRO_USD: "2000" }), { country: "PK", metaRate: 10_000, margin: 2000, cost: 12_000 });
  assert.equal(priceFor("4470000000", "UTILITY", {}), null);
  assert.equal(priceFor("4470000000", "SERVICE", {})?.cost, 0);
  assert.equal(priceFor("923001234567", "UTILITY", { WHATSAPP_MANAGED_RATES_JSON: '{"PK":{"UTILITY":7}}' })?.metaRate, 7);
  assert.equal(priceFor("923001234567", "UTILITY", { WHATSAPP_MANAGED_RATES_JSON: "not json" }), null);
});

test("prepaid cap: credit is reserved per message, logged in the ledger and sending blocks once it runs out", async () => {
  const { db, managed, ledger } = fakeDb();
  await funded(db, "s1", 25_000);
  for (let i = 0; i < 2; i++) {
    const held = await reserve("s1", "923001234567", "UTILITY", db);
    if (!("price" in held) || !held.price) throw new Error("expected a reservation");
    await settle("s1", "UTILITY", held.price, { success: true, messageId: `wamid.${i}` }, db);
  }
  const third = await reserve("s1", "923001234567", "UTILITY", db);
  assert.ok("blocked" in third && /used up/.test(third.blocked ?? ""));
  assert.equal(managed[0].balanceMicroUsd, BigInt(5000));
  assert.deepEqual(ledger.filter(e => e.kind === "MESSAGE").map(e => [e.amountMicroUsd, e.metaRateMicroUsd, e.category, e.country]), [[BigInt(10_000), BigInt(10_000), "UTILITY", "PK"], [BigInt(10_000), BigInt(10_000), "UTILITY", "PK"]]);
  const view = await usage(admin("s1"), db);
  assert.equal(view.balanceMicroUsd, 5000);
  assert.deepEqual(view.last30Days, { messages: 2, spentMicroUsd: 20_000 });
});

test("a message Meta refuses is refunded and not logged", async () => {
  const { db, managed, ledger } = fakeDb();
  await funded(db, "s1", 10_000);
  const held = await reserve("s1", "923001234567", "UTILITY", db);
  if (!("price" in held) || !held.price) throw new Error("expected a reservation");
  await settle("s1", "UTILITY", held.price, { success: false }, db);
  assert.equal(managed[0].balanceMicroUsd, BigInt(10_000));
  assert.equal(ledger.filter(e => e.kind === "MESSAGE").length, 0);
});

test("disabled add-on never sends, even with credit", async () => {
  const { db } = fakeDb();
  await funded(db, "s1", 50_000);
  await setEnabled(admin("s1"), false, db);
  assert.ok("blocked" in await reserve("s1", "923001234567", "UTILITY", db));
});

test("tenant isolation: one school's credit, ledger and settings are invisible to another", async () => {
  const { db } = fakeDb();
  await funded(db, "s1", 50_000);
  const other = await usage(admin("s2"), db);
  assert.deepEqual([other.enabled, other.balanceMicroUsd, other.entries.length], [false, 0, 0]);
  assert.ok("blocked" in await reserve("s2", "923001234567", "UTILITY", db));
  await assert.rejects(setEnabled(admin("s2"), true, db), /not set up a managed number/);
  for (const model of ["whatsAppManagedSending", "whatsAppUsageEntry"]) assert.ok(TENANT_MODELS.has(model));
});

test("permissions: only the institution authority opts in or reads usage; only the platform owner provisions and credits", async () => {
  const { db } = fakeDb();
  for (const role of ["PRINCIPAL", "TEACHER", "CAMPUS_ADMIN", "ACCOUNTANT", "PARENT"] as AuthUser["role"][]) {
    await assert.rejects(usage(admin("s1", role), db), (e: { status?: number }) => e.status === 403);
    await assert.rejects(setEnabled(admin("s1", role), true, db), (e: { status?: number }) => e.status === 403);
  }
  await assert.rejects(ownerAction(admin("s1"), "s1", { action: "top-up", amountMicroUsd: 1, reference: "x" }, db), (e: { status?: number }) => e.status === 403);
  await assert.rejects(ownerAction(owner, "s1", { action: "top-up", amountMicroUsd: 5, reference: "INV" }, db), /Provision/);
  await ownerAction(owner, "s1", { action: "provision", phoneNumberId: "5550000001" }, db);
  await assert.rejects(ownerAction(owner, "s1", { action: "top-up", amountMicroUsd: -5, reference: "INV" }, db), /credit between/);
  await assert.rejects(ownerAction(owner, "s1", { action: "top-up", amountMicroUsd: 5 }, db), /payment reference/);
});

test("opting in and buying credit are human-only AI exclusions", () => {
  for (const key of ["whatsapp.managed_settings", "whatsapp.managed_provision", "whatsapp.managed_top_up"]) assert.ok(exclusionFor(key), key);
});
