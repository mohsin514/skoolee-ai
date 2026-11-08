import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-482 and SKO-489 on the isolated app: Record corrections is offered only to roles with a correction
// domain; group owners and principals reach the guardian access workflow instead of being redirected.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.QA_TEST_APP || "http://localhost:3108";
const evidence = process.env.QA_EVIDENCE_DIR || "/tmp/qa-fixes-evidence";
const db = new PrismaClient(), password = "SyntheticNavQa482!";
const schoolId = `nav482-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, string>(), secrets = new Map<string, string>();
let browser: Browser;

async function user(role: string) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${role}`, role: role as never, schoolId, campusId: role === "APP_OWNER" ? null : campusId, isActive: true, onboardingComplete: true } });
  users.set(role, email);
}
async function signIn(role: string, viewport = { width: 1280, height: 900 }): Promise<BrowserContext> {
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(role)!, password } })).status(), 200, `login ${role}`);
  const known = secrets.get(role);
  if (known) {
    // A second sign-in proves the enrolled factor with the next step's code, so it is never a replay.
    const step = Math.floor(Date.now() / 30_000) + 1;
    assert.equal((await c.request.post(base + "/api/auth/mfa", { data: { action: "challenge", code: totp(known, step) } })).status(), 200, `mfa ${role}`);
    return c;
  }
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    const clean = secret.replace(/\s+/g, ""); secrets.set(role, clean);
    await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(clean) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  return c;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Navigation QA", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "QA Campus", regId: campusId, city: "Riyadh" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  const classId = (await db.class.create({ data: { schoolId, campusId, name: "Grade 5", section: "A", academicYear: 2026 } })).id;
  await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Pupil Lina", rollNo: "L1", gender: "FEMALE", status: "active" } });
  for (const role of ["APP_OWNER", "LIBRARIAN", "RECEPTIONIST", "TEACHER", "ACCOUNTANT", "PRINCIPAL", "SUPER_ADMIN", "CAMPUS_ADMIN"]) await user(role);
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("SKO-482: Record corrections is offered only where a correction domain exists", async () => {
  const expected: Record<string, boolean> = { APP_OWNER: false, LIBRARIAN: false, RECEPTIONIST: false, TEACHER: true, ACCOUNTANT: true, PRINCIPAL: true, SUPER_ADMIN: true, CAMPUS_ADMIN: true };
  for (const [role, allowed] of Object.entries(expected)) {
    const c = await signIn(role);
    const access = (await (await c.request.get(`${base}/api/navigation/access`)).json()).access;
    assert.equal(access.corrections, allowed, `${role}`);
    await c.close();
  }
  const page = await (await signIn("LIBRARIAN")).newPage();
  await page.goto(`${base}/librarian`);
  await page.getByRole("link", { name: "Search records" }).or(page.locator("nav")).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  assert.equal(await page.getByRole("link", { name: "Record corrections" }).count(), 0, "the librarian is not offered the dead-end workspace");
  await page.screenshot({ path: `${evidence}/sko482-librarian-nav.png` });
  await page.close();
  const owner = await (await signIn("APP_OWNER")).newPage();
  await owner.goto(`${base}/owner`);
  await owner.locator("nav").first().waitFor({ timeout: 60_000 });
  await owner.waitForTimeout(1500);
  assert.equal(await owner.getByRole("link", { name: "Record corrections" }).count(), 0, "the app owner is not offered the dead-end workspace");
  await owner.screenshot({ path: `${evidence}/sko482-owner-nav.png` });
  await owner.close();
  const teacher = await (await signIn("TEACHER")).newPage();
  await teacher.goto(`${base}/teacher`);
  // Registry groups are collapsed by default; Record corrections sits under More (SPEC §3).
  await teacher.locator('[data-tour="shell.nav-group.more"]').first().click({ timeout: 60_000 });
  await teacher.getByRole("link", { name: "Record corrections" }).first().waitFor({ state: "attached", timeout: 60_000 });
  await teacher.close();
});

test("SKO-489 → SPEC §6.1: the retired /dashboard console lands each leader on their own console view", async () => {
  // The legacy guardians page is retired: campus guardian access lives in /admin?view=guardians; the group admin
  // and the principal land on the closest view of their own console instead of the legacy shell.
  const expected: Record<string, Record<string, RegExp>> = {
    SUPER_ADMIN: { "/dashboard/guardians": /^\/super\?view=campuses$/u, "/dashboard/students": /^\/super\?view=campuses$/u, "/dashboard": /^\/super$/u },
    PRINCIPAL: { "/dashboard/guardians": /^\/principal\?view=students$/u, "/dashboard/marks": /^\/principal\?view=exam-cycles$/u },
    CAMPUS_ADMIN: { "/dashboard/guardians?student=s1": /^\/admin\?view=guardians&student=s1$/u, "/dashboard/settings/members": /^\/admin\?view=leadership$/u },
  };
  for (const [role, paths] of Object.entries(expected)) {
    const context = await signIn(role);
    for (const [from, to] of Object.entries(paths)) {
      const page = await context.newPage();
      await page.goto(`${base}${from}`);
      await page.waitForURL((current) => to.test(current.pathname + current.search), { timeout: 60_000 });
      await page.screenshot({ path: `${evidence}/spec61-${role.toLowerCase()}-${from.replace(/[^a-z]+/gu, "-")}.png` });
      await page.close();
    }
    await context.close();
  }
});
