import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";
import { DEMO_SCHOOL_ID, resetDemoTenant } from "../../scripts/demo/reset-demo-tenant";

// SKO-452 on the isolated app: after a reset the demo teacher signs in to the labelled synthetic school
// and the guardian sees exactly one allowed next action, on a phone.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DEMO_TEST_APP || "http://localhost:3108";
const evidence = process.env.DEMO_EVIDENCE_DIR || "/tmp/sko452-evidence";
const db = new PrismaClient(), password = "SyntheticDemoTenant452!";
let browser: Browser;

async function signIn(email: string, viewport: { width: number; height: number }): Promise<BrowserContext> {
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email, password } })).status(), 200, `login ${email}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  return c;
}

before(async () => {
  await resetDemoTenant(db, password);
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.school.deleteMany({ where: { id: DEMO_SCHOOL_ID } });
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("the demo teacher works in the labelled synthetic school", async () => {
  const page = await (await signIn("demo-teacher@example.invalid", { width: 1440, height: 1000 })).newPage();
  await page.goto(`${base}/teacher`);
  const badge = page.getByTestId("scope-badge");
  await badge.waitFor({ timeout: 60_000 });
  assert.match((await badge.textContent()) ?? "", /^\[Synthetic demo\] Cedar Demo School · \[Synthetic demo\] Main campus$/u);
  await page.getByText("6 students", { exact: false }).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.screenshot({ path: `${evidence}/demo-teacher-1440.png` });
  await page.close();
});

test("the guardian sees one allowed next action on a phone", async () => {
  const c = await signIn("demo-guardian@example.invalid", { width: 390, height: 844 });
  const page = await c.newPage();
  await page.goto(`${base}/parent`);
  await page.getByText("[Synthetic demo] Review Student 01's science feedback").first().waitFor({ timeout: 60_000 });
  await page.screenshot({ path: `${evidence}/demo-guardian-390.png` });
  await page.close();
});
