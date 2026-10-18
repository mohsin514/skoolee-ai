import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-456 on the isolated app: the canteen adds no navigation until a principal names its operators,
// completes the checklist and enables it; a guardian orders the last meal and a second guardian finds
// it sold out; the boarding warden's roll call shows a missing boarder and an overdue return.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.PACKAGES_TEST_APP || "http://localhost:3108";
const evidence = process.env.PACKAGES_EVIDENCE_DIR || "/tmp/sko456-evidence";
const db = new PrismaClient(), password = "SyntheticPackages456!";
const schoolId = `pk456-${randomUUID()}`, campusId = randomUUID();
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
async function guardian(parentKey: string, studentId: string) {
  const rel = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: users.get(parentKey)!.id, createdByUserId: users.get("principal")!.id, fullName: "Synthetic guardian", email: users.get(parentKey)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: users.get("principal")!.id, reason: "Synthetic fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false } } });
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Residential", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar Residential", regId: campusId, city: "Riyadh" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await user("principal", "PRINCIPAL"); await user("dietary", "TEACHER"); await user("parent-a", "PARENT"); await user("parent-b", "PARENT", "ar");
  const classId = randomUUID();
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "A", academicYear: 2026 } });
  for (const [k, name] of [["amal", "Synthetic Amal"], ["badr", "Synthetic Badr"], ["dana", "Synthetic Dana"]]) ids[k] = (await db.student.create({ data: { schoolId, campusId, classId, fullName: name, rollNo: k, gender: "FEMALE", status: "active" } })).id;
  await guardian("parent-a", ids.amal); await guardian("parent-b", ids.badr);
  const type = await db.dormRoomType.create({ data: { schoolId, campusId, name: "Standard" } });
  const room = await db.dormRoom.create({ data: { schoolId, campusId, roomTypeId: type.id, number: "C-1", capacity: 4 } });
  for (const s of ["amal", "badr", "dana"]) await db.dormAllocation.create({ data: { schoolId, campusId, roomId: room.id, studentId: ids[s], startDate: new Date("2026-01-01T00:00:00Z"), reason: "Synthetic boarder", createdById: users.get("principal")!.id } });
  const done = (items: string[]) => Object.fromEntries(items.map((i) => [i, { by: users.get("principal")!.id, at: new Date().toISOString(), note: "Validated with the house team" }]));
  await db.campusPackage.create({ data: { schoolId, campusId, package: "BOARDING", status: "ENABLED", operators: { WARDEN: [users.get("principal")!.id], LEAVE_APPROVER: [users.get("principal")!.id] }, checklist: done(["missing_student_procedure", "leave_policy_validated", "roll_call_times", "night_supervision_rota"]), enabledById: users.get("principal")!.id, enabledAt: new Date() } });
  await db.boardingLeave.create({ data: { schoolId, campusId, studentId: ids.badr, departAt: new Date(Date.now() - 7_200_000), expectedReturnAt: new Date(Date.now() - 3_600_000), destination: "Family visit", collectedBy: "Synthetic uncle", approvedById: users.get("principal")!.id, status: "OUT", departedAt: new Date(Date.now() - 7_000_000) } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  for (const m of [db.boardingRollCall, db.boardingLeave, db.dietaryRecord, db.canteenSpendLimit, db.canteenLedgerEntry, db.canteenOrder, db.canteenItem, db.campusPackage, db.dormAllocation]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("the canteen adds navigation only after operators, checklist and enablement (EN desktop)", async () => {
  const page = await (await context("principal")).newPage();
  await page.goto(`${base}/principal?view=leadership`);
  const panel = page.locator('section[aria-labelledby="campus-packages"]');
  await panel.waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Operations" }).first().click();
  await page.getByRole("button", { name: "Inventory", exact: true }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Canteen", exact: true }).count(), 0, "no canteen navigation while it is off");
  const canteen = panel.locator("div.rounded-xl", { hasText: "Canteen · Off" });
  await canteen.getByRole("button", { name: "Enable package" }).isDisabled();
  await canteen.getByLabel("Canteen manager").selectOption({ label: "Synthetic principal" });
  await canteen.getByRole("button", { name: "Save" }).first().click();
  await panel.getByText("Operator saved.").waitFor({ timeout: 30_000 });
  const setup = panel.locator("div.rounded-xl", { hasText: /^Canteen · Setting up/u });
  await setup.getByLabel("Dietary lead").selectOption({ label: "Synthetic dietary" });
  await setup.getByRole("button", { name: "Save" }).nth(1).click();
  await panel.getByText("Operator saved.").waitFor();
  for (let i = 0; i < 4; i++) {
    const field = setup.getByLabel("How this was validated").first();
    await field.fill("Signed off by the operations lead");
    await setup.getByRole("button", { name: "Record" }).first().click();
    await page.waitForResponse((r) => r.url().includes("/api/campus-packages") && r.request().method() === "GET");
  }
  await setup.getByRole("button", { name: "Enable package" }).click();
  await panel.getByText("Package enabled for this campus with the approved staff roles.").waitFor({ timeout: 30_000 });
  await page.reload();
  await page.getByRole("button", { name: "Operations" }).first().click();
  await page.getByRole("button", { name: "Canteen", exact: true }).first().waitFor({ timeout: 60_000 });
  await panel.waitFor();
  await panel.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/packages-setup-en-1440.png` });
  await page.close();
});

test("a guardian orders the last meal once; the second guardian finds it sold out; retries replay", async () => {
  const principal = await context("principal");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const added = await principal.request.post(`${base}/api/campus-packages`, { headers: { Origin: base }, data: { action: "menu-item", data: { serviceDate: tomorrow, name: "Chicken rice", price: 1500, currency: "SAR", capacity: 1, allergens: [] } } });
  assert.equal(added.status(), 200);
  const page = await (await context("parent-a")).newPage();
  await page.goto(`${base}/parent`);
  const panel = page.locator('section[aria-labelledby="family-canteen"]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByRole("button", { name: "Order meal" }).first().click();
  await panel.getByText("Order received.").waitFor({ timeout: 30_000 });
  await panel.getByText("Sold out").first().waitFor();
  await page.close();
  const item = await db.canteenItem.findFirstOrThrow({ where: { schoolId, name: "Chicken rice" } });
  const second = await (await context("parent-b")).request.post(`${base}/api/campus-packages`, { headers: { Origin: base }, data: { action: "order", data: { studentId: ids.badr, itemId: item.id, quantity: 1, idempotencyKey: `k${randomUUID().replace(/-/g, "")}` } } });
  assert.equal(second.status(), 409);
  const placed = await db.canteenOrder.findFirstOrThrow({ where: { schoolId } });
  const replay = await (await context("parent-a")).request.post(`${base}/api/campus-packages`, { headers: { Origin: base }, data: { action: "order", data: { studentId: ids.amal, itemId: item.id, quantity: 1, idempotencyKey: placed.idempotencyKey } } });
  assert.equal((await replay.json()).data.replayed, true);
  assert.equal(await db.canteenLedgerEntry.count({ where: { schoolId } }), 1, "one charge");
});

test("the warden's roll call highlights a missing boarder and an overdue return", async () => {
  const page = await (await context("principal")).newPage();
  await page.goto(`${base}/principal?view=dormitory`);
  const panel = page.locator('section[aria-labelledby="boarding-ops"]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByLabel("Roll call time").fill("20:00");
  await panel.getByLabel(/Synthetic Amal/u).check();
  await panel.getByRole("button", { name: "Save roll call" }).click();
  await panel.getByText("2 boarding exceptions need follow-up").waitFor({ timeout: 30_000 });
  assert.ok(await panel.getByText(/Synthetic Dana · Missing at roll call/u).isVisible());
  assert.ok(await panel.getByText(/Synthetic Badr · Leave return overdue/u).isVisible());
  await panel.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/boarding-exceptions-en-1440.png` });
  await page.close();
});

test("the family canteen reads right to left on a phone (AR)", async () => {
  const page = await (await context("parent-b", { width: 390, height: 844 })).newPage();
  await page.goto(`${base}/parent`);
  const panel = page.locator('section[aria-labelledby="family-canteen"]');
  await panel.waitFor({ timeout: 60_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  await panel.getByText("نفدت الكمية").first().waitFor({ timeout: 30_000 });
  await panel.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/canteen-family-ar-390.png` });
  await page.close();
});
