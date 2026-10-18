import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-429 on the isolated app: a parent gets a quoted, cited answer on the family home; a conflict
// offers a reviewed message to the right office (AR phone); the API refuses cross-site writes and
// family management; leaders see the policy list and the office queue.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.POLICY_TEST_APP || "http://localhost:3108";
const evidence = process.env.POLICY_EVIDENCE_DIR || "/tmp/sko429-evidence";
const db = new PrismaClient(), password = "SyntheticPolicy429!";
const schoolId = `po429-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
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
const policy = async (data: object) => db.schoolPolicy.create({ data: { schoolId, office: "GENERAL", audience: "FAMILY", status: "APPROVED", effectiveFrom: new Date("2026-01-01T00:00:00Z"), createdById: users.get("lead")!.id, approvedById: users.get("lead")!.id, approvedAt: new Date(), ...data } as never });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Oak School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Oak Main", regId: campusId, city: "Riyadh" } });
  await user("lead", "CAMPUS_ADMIN"); await user("parent", "PARENT"); await user("parent-ar", "PARENT", "ar");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Two", section: "A", academicYear: 2026 } });
  for (const key of ["parent", "parent-ar"]) {
    const studentId = randomUUID();
    await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: `Synthetic child of ${key}`, rollNo: key, gender: "OTHER", status: "active" } });
    const rel = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: users.get(key)!.id, createdByUserId: users.get("lead")!.id, fullName: `Synthetic ${key}`, email: users.get(key)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
    await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: users.get("lead")!.id, reason: "Synthetic policy fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  }
  await policy({ topic: "attendance", title: "Attendance Policy", office: "ATTENDANCE", sections: [{ id: "2.2", heading: "Requesting leave", text: "Parents request leave through the family app at least two school days in advance." }] });
  await policy({ topic: "trips", title: "Trips Policy", office: "ACTIVITIES", sections: [{ id: "4.1", heading: "Trip cancellation refunds", text: "Late trip cancellation is refunded in full when a medical note is provided." }] });
  await policy({ topic: "trips", title: "Activities Handbook", office: "ACTIVITIES", sections: [{ id: "7.3", heading: "Trip cancellation refunds", text: "Late trip cancellation within seven days is not refunded." }] });
  await policy({ topic: "safeguarding", title: "Staff Safeguarding Procedure", audience: "STAFF", office: "WELFARE", sections: [{ id: "1.1", heading: "Reporting a concern", text: "Staff report any safeguarding concern to the designated lead within the same day." }] });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.schoolPolicy.deleteMany({ where: { schoolId } });
  await db.policyQuestion.deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("the API keeps families out of management and refuses cross-site writes", async () => {
  const parent = await context("parent");
  assert.equal((await parent.request.get(`${base}/api/policies?view=manage`)).status(), 403);
  assert.equal((await parent.request.post(`${base}/api/policies`, { data: { action: "ask", data: { question: "How do I request leave?" } }, headers: { origin: "https://example.invalid" } })).status(), 403);
  const asked = await parent.request.post(`${base}/api/policies`, { data: { action: "ask", data: { question: "How do staff report a safeguarding concern?" } }, headers: { origin: base } });
  assert.equal(asked.status(), 200);
  assert.ok(!(await asked.text()).includes("designated lead"), "a staff-only policy is never quoted to a family");
});

test("a parent gets a cited answer; a conflict offers a reviewed message to the right office (EN desktop, AR phone)", async () => {
  const page = await (await context("parent")).newPage();
  await page.goto(`${base}/parent`);
  const panel = page.locator('section[aria-labelledby="policy-assistant"]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByLabel("Your question").fill("How do I request leave?");
  await panel.getByRole("button", { name: "Ask", exact: true }).click();
  await panel.getByText("Based on Attendance Policy v1, section 2.2").waitFor({ timeout: 30_000 });
  assert.ok(await panel.getByText("Parents request leave through the family app").isVisible());
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: `${evidence}/policy-answer-en-1440.png` });
  await page.close();

  const ar = await (await context("parent-ar", { width: 390, height: 844 })).newPage();
  await ar.goto(`${base}/parent`);
  const arPanel = ar.locator('section[aria-labelledby="policy-assistant"]');
  await arPanel.waitFor({ timeout: 60_000 });
  assert.equal(await ar.evaluate("document.documentElement.dir"), "rtl");
  await arPanel.getByLabel("سؤالك").fill("Is late trip cancellation refunded?");
  await arPanel.getByRole("button", { name: "اسأل", exact: true }).click();
  await arPanel.getByText("وجدت سياستين قد تتعارضان").first().waitFor({ timeout: 30_000 });
  const send = arPanel.getByRole("button", { name: "إرسال إلى مكتب المدرسة" });
  assert.equal(await send.isDisabled(), true, "nothing is sent before the recipient and content are reviewed");
  await arPanel.getByLabel("رسالتك").fill("Which refund rule applies to our trip next week?");
  await arPanel.getByText("لقد تحققت من المستلم ومما سيُرسل").click();
  await arPanel.scrollIntoViewIfNeeded();
  await ar.screenshot({ path: `${evidence}/policy-conflict-ar-390.png` });
  await send.click();
  await arPanel.getByText(/أُرسل إلى مكتب الأنشطة/).first().waitFor({ timeout: 30_000 });
  await ar.close();
});

test("leaders see the policy list and the office queue", async () => {
  const page = await (await context("lead")).newPage();
  await page.goto(`${base}/admin`);
  const panel = page.locator('section[aria-labelledby="policy-manager"]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByText("Which refund rule applies to our trip next week?").waitFor({ timeout: 30_000 });
  await panel.getByLabel("Reply").first().fill("The Activities Handbook applies to this trip.");
  await panel.getByRole("button", { name: "Send reply" }).first().click();
  await panel.getByText("Reply sent.").waitFor();
  await panel.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/policy-manager-en-1440.png` });
  await page.close();
});
