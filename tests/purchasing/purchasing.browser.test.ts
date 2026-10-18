import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-435 on the isolated app: two staff issuing the last units at once cannot drive stock negative;
// a retried movement is recorded once; purchasing sits beside inventory with the budget position,
// orders and deliveries (EN desktop, AR phone).
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.PURCHASING_TEST_APP || "http://localhost:3108";
const evidence = process.env.PURCHASING_EVIDENCE_DIR || "/tmp/sko435-evidence";
const db = new PrismaClient(), password = "SyntheticPurchasing435!";
const schoolId = `pu435-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await c.storageState());
  return c;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar North", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar North", regId: campusId, city: "Riyadh" } });
  await user("admin", "CAMPUS_ADMIN"); await user("admin-ar", "CAMPUS_ADMIN", "ar"); await user("teacher", "TEACHER");
  ids.store = (await db.itemStore.create({ data: { schoolId, campusId, name: "IT room" } })).id;
  ids.item = (await db.item.create({ data: { schoolId, campusId, name: "Laptop", unit: "each" } })).id;
  await db.itemStock.create({ data: { schoolId, itemId: ids.item, storeId: ids.store, quantity: 1 } });
  const budget = await db.purchaseBudget.create({ data: { schoolId, campusId, costCenter: "IT", period: "2027", amount: 30000, currency: "SAR", approvalLimit: 50000, createdById: users.get("admin")!.id } });
  await db.purchaseRequest.create({ data: { schoolId, campusId, budgetId: budget.id, poNumber: "PO-104", title: "Laptops for lab", lines: [{ itemId: ids.item, description: "Laptop", quantity: 10, unitPrice: 2000, asset: true }], received: [6], total: 20000, status: "PARTIALLY_RECEIVED", requestedById: users.get("teacher")!.id, approvedById: users.get("admin")!.id, approvedAt: new Date() } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  for (const m of [db.assetService, db.schoolAsset, db.supplierInvoice, db.goodsReceipt, db.purchaseRequest, db.purchaseBudget]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("two staff issue the last unit at once: one succeeds, stock never goes negative; a retry is recorded once", async () => {
  const c = await context("admin");
  const issue = (key?: string) => c.request.post(`${base}/api/inventory/transactions`, { data: { itemId: ids.item, storeId: ids.store, kind: "ISSUE", quantity: 1, ...(key ? { idempotencyKey: key } : {}) } });
  const results = await Promise.all([issue(), issue()]);
  assert.deepEqual(results.map((r) => r.status()).sort(), [201, 409]);
  assert.equal((await db.itemStock.findFirstOrThrow({ where: { itemId: ids.item, storeId: ids.store } })).quantity, 0);
  const key = `rcv${randomUUID().replace(/-/g, "")}`;
  const receive = () => c.request.post(`${base}/api/inventory/transactions`, { data: { itemId: ids.item, storeId: ids.store, kind: "RECEIVE", quantity: 3, idempotencyKey: key } });
  assert.equal((await receive()).status(), 201);
  assert.equal((await receive()).status(), 200, "the retry replays the first movement");
  assert.equal((await db.itemStock.findFirstOrThrow({ where: { itemId: ids.item, storeId: ids.store } })).quantity, 3);
});

test("purchasing beside inventory shows the budget position and the partly received order (EN desktop, AR phone)", async () => {
  for (const [key, viewport, name, heading] of [["admin", { width: 1440, height: 1000 }, "purchasing-en-1440", "Purchasing and assets"], ["admin-ar", { width: 390, height: 844 }, "purchasing-ar-390", "المشتريات والأصول"]] as const) {
    const page = await (await context(key, viewport)).newPage();
    await page.goto(`${base}/admin?view=inventory`);
    const panel = page.locator('section[aria-labelledby="purchasing"]');
    await panel.waitFor({ timeout: 60_000 });
    assert.ok(await panel.getByRole("heading", { name: heading }).isVisible());
    await panel.getByText("PO-104").first().waitFor();
    if (key === "admin") assert.ok(await panel.getByText("Received 6 of 10").isVisible());
    else assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
    await panel.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${evidence}/${name}.png` });
    await page.close();
  }
});
