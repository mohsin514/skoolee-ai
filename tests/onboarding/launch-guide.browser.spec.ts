import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { USER_ROLES, type UserRole } from "../../src/lib/roles";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { launchCopy } from "../../src/components/onboarding/launch-copy";
import { workspaceLaunchCopy } from "../../src/components/school-ai/workspace-launch-copy";

const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw Error("Only the isolated local test database is allowed.");
const db = new PrismaClient();
const schoolId = `launch-guide-${randomUUID()}`;
const campusId = `${schoolId}-north`, otherCampusId = `${schoolId}-south`;
const accounts = new Map<string, { id: string; token: string; role: UserRole }>();
const origin = "http://localhost:3110";
test.use({ video: process.env.ONBOARDING_RECORD_VIDEO === "1" ? { mode: "on", size: { width: 1440, height: 1000 } } : "off" });

async function account(key: string, role: UserRole, options: { complete?: boolean; owner?: boolean; password?: boolean; campus?: string | null; language?: string } = {}) {
  const id = `${schoolId}-${key}`;
  const campus = options.campus === undefined ? campusId : options.campus;
  const user = await db.user.create({ data: {
    id, schoolId, campusId: campus, email: `${key}-${schoolId}@example.test`, fullName: "Alex Morgan", role,
    onboardingComplete: options.complete ?? true, mustChangePassword: options.password ?? false, mfaEnabled: true,
    isInstitutionOwner: options.owner ?? false, preferredLanguage: options.language ?? "en",
  } });
  const token = await new SignJWT({ userId: id, schoolId, campusId: campus, role, email: user.email, accessVersion: 0, mfaVerified: true, onboardingComplete: user.onboardingComplete, mustChangePassword: user.mustChangePassword, schoolStatus: "ACTIVE" })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("synthetic-launch-guide-secret-at-least-32-characters"));
  await db.loginSession.create({ data: { userId: id, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), isActive: true, expiresAt: new Date(Date.now() + 7200000) } });
  accounts.set(key, { id, token, role });
}
async function signIn(context: BrowserContext, key: string) {
  await context.clearCookies();
  await context.addCookies([{ name: "skoolee_token", value: accounts.get(key)!.token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function shot(page: Page, name: string) {
  await expect(page.locator('[data-launch-guide]')).toBeVisible();
  await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
  await page.screenshot({ path: `test-results/launch-guide/evidence/${name}.png`, animations: "disabled" });
}
async function chapters(page: Page, language: "en" | "ar" | "ur" = "en") {
  const c = launchCopy(language);
  await page.getByRole("button", { name: c.next, exact: true }).click();
  await page.getByRole("button", { name: c.continue, exact: true }).click();
}
async function fullyInViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}
test.beforeAll(async () => {
  await db.school.create({ data: { id: schoolId, name: "Horizon Academy · Synthetic", slug: schoolId, regId: schoolId, city: "Lahore", contactEmail: "synthetic@example.test", registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } });
  await db.campus.createMany({ data: [{ id: campusId, schoolId, name: "North Campus · Synthetic", city: "Lahore", regId: campusId }, { id: otherCampusId, schoolId, name: "South Campus · Synthetic", city: "Lahore", regId: otherCampusId }] });
  for (const role of USER_ROLES) await account(role, role, { complete: !["STUDENT", "PRINCIPAL", "CAMPUS_ADMIN", "PARENT"].includes(role), campus: role === "SUPER_ADMIN" || role === "APP_OWNER" ? null : campusId });
  await account("owner", "SUPER_ADMIN", { complete: false, owner: true, campus: null });
  await db.school.update({ where: { id: schoolId }, data: { contactEmail: `owner-${schoolId}@example.test` } });
  await account("teacher-new", "TEACHER", { complete: false });
  await account("password", "TEACHER", { complete: false, password: true });
  for (const language of ["ar", "ur"]) await account(language, "ADMIN", { language });
});
test.afterAll(async () => { await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); });

test("all eleven roles receive their own guide; acknowledgement is isolated and CSRF-protected", async ({ context, request }) => {
  expect((await request.get("/api/auth/welcome")).status()).toBe(401);
  for (const role of USER_ROLES) {
    await signIn(context, role);
    const response = await context.request.get("/api/auth/welcome");
    expect(response.ok(), `${role}: ${await response.text()}`).toBeTruthy();
    const { context: guide } = await response.json();
    expect(guide.role).toBe(role);
    expect(guide.completed).toBe(false);
    expect(guide.actions.length).toBeGreaterThan(0);
    expect(guide.actions.some((action: { href: string }) => action.href === "/onboarding")).toBe(false);
  }
  await signIn(context, "LIBRARIAN");
  expect((await context.request.post("/api/auth/welcome", { headers: { Origin: "https://unrelated.example" }, data: {} })).status()).toBe(403);
  expect((await context.request.post("/api/auth/welcome", { headers: { Origin: origin }, data: { userId: accounts.get("STUDENT")!.id } })).ok()).toBe(true);
  expect((await db.user.findUniqueOrThrow({ where: { id: accounts.get("LIBRARIAN")!.id } })).welcomeCompletedAt).not.toBeNull();
  expect((await db.user.findUniqueOrThrow({ where: { id: accounts.get("STUDENT")!.id } })).welcomeCompletedAt).toBeNull();
});

test("new owner welcome survives a save failure, persists across reload and replays without resetting setup", async ({ page, context }) => {
  await signIn(context, "owner"); await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: launchCopy("en").title })).toBeVisible();
  await shot(page, "01-owner-welcome-desktop");
  await chapters(page);
  await expect(page.getByRole("group", { name: launchCopy("en").choose }).getByRole("button", { name: /Set up my institution/ })).toBeVisible();
  await shot(page, "02-owner-workflow");
  let failedAttempts = 0;
  await page.route("**/api/auth/welcome", async route => {
    if (route.request().method() !== "POST") return route.continue();
    failedAttempts++;
    await route.fulfill({ status: 503, json: { error: "Synthetic retry" } });
  });
  const launch = page.locator("[data-guide-actions]").getByRole("button", { name: launchCopy("en").task("institution"), exact: true });
  const failure = page.getByRole("alert").filter({ hasText: "couldn’t save" });
  await launch.click();
  await expect(failure).toBeVisible();
  // Retry from the same pointer position after the footer grows. Hover effects must not oscillate its hit target.
  await launch.click({ timeout: 15000 });
  await expect.poll(() => failedAttempts).toBe(2);
  await expect(failure).toBeVisible();
  await page.setViewportSize({ width: 390, height: 667 });
  await fullyInViewport(failure, page);
  await fullyInViewport(page.locator("[data-guide-stage] [data-pose] svg"), page);
  await page.screenshot({ path: "test-results/launch-guide/evidence/16-welcome-save-retry-mobile.png", animations: "disabled" });
  expect((await db.user.findUniqueOrThrow({ where: { id: accounts.get("owner")!.id } })).welcomeCompletedAt).toBeNull();
  await page.unroute("**/api/auth/welcome");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await launch.click();
  await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
  await expect(page.locator("#step-heading")).toBeVisible();
  const before = await db.institutionSetup.findUniqueOrThrow({ where: { schoolId } });
  await page.reload(); await expect(page.getByRole("button", { name: "Replay guide" })).toBeVisible();
  await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
  await page.getByRole("button", { name: "Replay guide" }).click();
  await expect(page.locator("[data-launch-guide]")).toHaveAttribute("data-chapter", "0");
  await page.getByRole("button", { name: "Explore on my own" }).click();
  const after = await db.institutionSetup.findUniqueOrThrow({ where: { schoolId } });
  expect(after.version).toBe(before.version);
  expect(after.draft).toEqual(before.draft);
  expect((await db.user.findUniqueOrThrow({ where: { id: accounts.get("owner")!.id } })).onboardingComplete).toBe(false);
});

test("campus admin first use launches the scoped AI interview and resumes an older saved interview", async ({ page, context }) => {
  await signIn(context, "CAMPUS_ADMIN"); await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin(?:\?view=overview)?$/);
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
  await page.getByRole("button", { name: "Show me the way" }).click();
  await expect(page.getByRole("heading", { name: "One campus. A connected team." })).toBeVisible();
  await shot(page, "03-campus-preparation");
  await page.getByRole("button", { name: "Let’s get started" }).click();
  await page.locator("[data-guide-actions]").getByRole("button", { name: launchCopy("en").task("aiSetup"), exact: true }).click();
  await expect(page).toHaveURL(/\/ai\?setup=1$/);
  const c = schoolAICopy("en");
  await expect(page.getByRole("heading", { name: c.setupPath, exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("North Campus · Synthetic", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/launch-guide/evidence/04-campus-ai-interview.png", animations: "disabled" });
  await page.getByRole("button", { name: c.next, exact: true }).click();
  await expect(page.getByRole("heading", { name: c.schoolName, exact: true })).toBeVisible();
  const saved = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId, campusId, kind: "ONBOARDING" } });
  // Push the interview out of the default workspace page; resume still resolves it by campus.
  await db.schoolAiRecord.update({ where: { id: saved.id }, data: { createdAt: new Date("2020-01-01") } });
  await db.schoolAiRecord.createMany({ data: Array.from({ length: 101 }, (_, index) => ({
    schoolId, campusId, kind: "SOURCE", title: `Synthetic paging source ${index}`,
    data: { extractedText: "Synthetic pagination fixture.", documentKind: "other", fileName: `fixture-${index}.txt`, mimeType: "text/plain", origin: "manual" },
    createdById: accounts.get("CAMPUS_ADMIN")!.id, updatedById: accounts.get("CAMPUS_ADMIN")!.id,
    idempotencyKey: `paging-${index}`, requestHash: "synthetic",
  })) });
  const firstPage = await (await context.request.get("/api/school-ai/workspace")).json();
  expect(firstPage.records.some((record: { id: string }) => record.id === saved.id)).toBe(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: c.schoolName, exact: true })).toBeVisible();
  expect(await db.schoolAiRecord.count({ where: { schoolId, campusId, kind: "ONBOARDING" } })).toBe(1);
  expect((await context.request.get(`/api/school-ai/workspace?kind=ONBOARDING&campusId=${otherCampusId}`)).status()).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/launch-guide/evidence/05-campus-interview-mobile.png", animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: c.saveExit, exact: true }).click();
  await expect(page.getByRole("heading", { name: c.schoolName, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Replay guide" }).click();
  await chapters(page); await page.locator("[data-guide-actions]").getByRole("button", { name: launchCopy("en").task("aiSetup"), exact: true }).click();
  await expect(page.getByRole("heading", { name: c.schoolName, exact: true })).toBeVisible();
});

test("group setup waits for a campus choice and cannot reuse another campus interview", async ({ page, context }) => {
  await signIn(context, "SUPER_ADMIN"); await page.goto("/ai?setup=1");
  await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
  const c = schoolAICopy("en");
  await expect(page.getByLabel(c.workspaceCampus, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: c.setupPath, exact: true })).toHaveCount(0);
  await page.getByLabel(c.workspaceCampus, { exact: true }).selectOption(otherCampusId);
  await expect(page.getByRole("heading", { name: c.setupPath, exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("South Campus · Synthetic", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: c.saveExit, exact: true }).click();
  await expect(page).toHaveURL(/\/ai\?workflow=overview$/);
  await page.getByLabel(c.workspaceCampus, { exact: true }).selectOption(campusId);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator("[data-ai-launch-setup]").click();
  await expect(page.getByRole("dialog").getByText("North Campus · Synthetic", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("South Campus · Synthetic", { exact: true })).toHaveCount(0);
});

test("AI workflow discovery explains availability, requires scope and opens resumable deep links", async ({ page, context }) => {
  await signIn(context, "SUPER_ADMIN");
  await page.goto("/ai?workflow=overview");
  const c = schoolAICopy("en"), t = workspaceLaunchCopy("en");
  const launchpad = page.locator("[data-ai-workflow-launchpad]");
  await expect(launchpad).toBeVisible();
  await expect(launchpad.getByText(t.campus, { exact: true })).toBeVisible();
  await expect(page.locator("[data-ai-launch-setup]")).toBeDisabled();
  await expect(launchpad.locator('[data-ai-workflow="sources"] button')).toBeDisabled();
  await page.getByLabel(c.workspaceCampus, { exact: true }).selectOption(campusId);
  await expect(launchpad.getByText(t.prototype, { exact: true })).toBeVisible();
  await expect(launchpad.getByText(t.prototypeHint, { exact: true })).toBeVisible();
  await expect(page.locator("[data-ai-launch-setup]")).toBeEnabled();
  await launchpad.getByRole("button", { name: t.all, exact: true }).click();
  await expect(launchpad.locator('[data-ai-workflow="history"]')).toBeVisible();
  await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
  await launchpad.scrollIntoViewIfNeeded();
  await launchpad.screenshot({ path: "test-results/launch-guide/evidence/14-ai-workflow-launchpad.png", animations: "disabled" });
  await launchpad.locator('[data-ai-workflow="academicSetup"] button').click();
  await expect(page).toHaveURL(/\/ai\?workflow=academicSetup$/);
  await expect(page.getByRole("heading", { name: c.academicSetupTitle, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: c.academicSetupTitle, exact: true })).toBeVisible();
  await page.getByRole("button", { name: t.back, exact: true }).click();
  await expect(launchpad).toBeVisible();
  await page.goto("/ai?workflow=missing-workflow");
  await expect(launchpad).toBeVisible();
  await expect(page.getByText(t.unavailable, { exact: true })).toBeVisible();

  await signIn(context, "TEACHER");
  await page.goto("/ai?workflow=overview");
  await expect(launchpad.getByText(t.noSubject, { exact: true })).toBeVisible();
  await expect(launchpad.locator('[data-ai-workflow="sources"] button')).toBeDisabled();
});

test("read-only capabilities offer review without creation and reject unavailable workflow links", async ({ page, context }) => {
  await signIn(context, "ADMIN");
  // Preserve real authentication; constrain the returned capabilities to exercise the read-only presentation.
  await page.route("**/api/school-ai/workspace", async route => {
    const response = await route.fetch();
    const result = await response.json();
    await route.fulfill({ response, json: { ...result, records: [], capabilities: { ...result.capabilities, canCreate: false, kinds: ["SOURCE", "ONBOARDING"], tools: [] } } });
  });
  const t = workspaceLaunchCopy("en"), c = schoolAICopy("en");
  await page.goto("/ai?workflow=academicSetup");
  const launchpad = page.locator("[data-ai-workflow-launchpad]");
  await expect(launchpad).toBeVisible();
  await expect(page.getByText(t.unavailable, { exact: true })).toBeVisible();
  await expect(launchpad.getByText(t.readOnly, { exact: true })).toBeVisible();
  await expect(page.locator("[data-ai-launch-setup]")).toBeDisabled();
  await expect(launchpad.locator('[data-ai-workflow="academicSetup"]')).toHaveCount(0);
  await launchpad.locator('[data-ai-workflow="sources"]').getByRole("button", { name: t.view, exact: true }).click();
  await expect(page).toHaveURL(/\/ai\?workflow=sources$/);
  await expect(page.getByRole("heading", { name: c.uploadTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: c.manualSource, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: c.attach, exact: true })).toBeDisabled();
  await signIn(context, "STUDENT");
  expect((await context.request.get("/api/school-ai/workspace")).status()).toBe(403);
});

test("student, principal, teacher and temporary-password entry keep the right boundaries", async ({ page, context }) => {
  for (const [key, route, task] of [["STUDENT", "/student", "Open my learning workspace"], ["PRINCIPAL", "/principal", "Guide my campus setup with AI"], ["teacher-new", "/teacher-onboarding", "Set up my teacher profile"]]) {
    await signIn(context, key); await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.locator("[data-launch-guide]")).toBeVisible(); await chapters(page);
    await expect(page.getByRole("group", { name: launchCopy("en").choose }).getByRole("button", { name: new RegExp(task) })).toBeVisible();
    await shot(page, `06-role-${key.toLowerCase()}`);
  }
  await signIn(context, "password"); await page.goto("/teacher");
  await expect(page).toHaveURL(/\/first-login$/);
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
  await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
});

for (const language of ["en", "ar", "ur"] as const) {
  test(`responsive ${language} welcome, keyboard navigation and reduced motion`, async ({ page, context }) => {
    await signIn(context, language === "en" ? "ADMIN" : language); await page.goto("/admin");
    const c = launchCopy(language);
    await expect(page.locator("[data-launch-guide]")).toBeVisible();
    await expect(page.getByRole("dialog", { name: c.guide })).toHaveCSS("direction", language === "en" ? "ltr" : "rtl");
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width < 500) {
        const action = await page.getByRole("button", { name: c.next, exact: true }).boundingBox();
        expect(action && action.y >= 0 && action.y + action.height <= 844).toBe(true);
      }
      await shot(page, `07-welcome-${language}-${width}`);
    }
    await page.getByRole("button", { name: c.next, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: c.journey("campus") })).toBeFocused();
    await page.getByRole("button", { name: c.continue, exact: true }).click();
    await shot(page, `08-choices-${language}-320`);
    const animations = await page.locator("[data-launch-guide] svg g").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).animationName));
    expect(animations.every(value => value === "none")).toBe(true);
  });
}

for (const language of ["en", "ar"] as const) {
  test(`short ${language} screens keep the guide and next action in view across every chapter`, async ({ page, context }) => {
    await signIn(context, language === "en" ? "ADMIN" : language);
    const c = launchCopy(language);
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 600 }, { width: 390, height: 667 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/admin");
      const guide = page.locator("[data-launch-guide]");
      await expect(guide).toBeVisible();
      await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
      const stage = guide.locator("[data-guide-stage]");
      const character = stage.locator("[data-pose] svg");
      const originalCharacter = await character.elementHandle();
      const narration = stage.locator("[data-guide-narration]");
      const seenNarration = new Set<string>();
      const seenCards = new Set<string>();
      for (const chapter of [0, 1, 2]) {
        await expect(guide).toHaveAttribute("data-chapter", `${chapter}`);
        await expect(stage.locator("[data-pose]")).toHaveAttribute("data-pose", ["wave", "think", "ready"][chapter]);
        await expect(narration).toBeVisible();
        seenNarration.add((await narration.textContent())!);
        const activeCards = stage.locator(`[data-guide-scene-cards="${chapter}"][data-active]`);
        await expect(activeCards).toHaveCSS("opacity", "1");
        seenCards.add((await activeCards.textContent())!);
        await fullyInViewport(character, page);
        const next = guide.locator("[data-guide-actions]").getByRole("button", {
          name: chapter === 0 ? c.next : chapter === 1 ? c.continue : c.task("aiSetup"), exact: true,
        });
        await fullyInViewport(next, page);
        const pane = guide.locator("[data-guide-scroll]");
        await pane.evaluate(node => { node.scrollTop = node.scrollHeight; });
        await fullyInViewport(character, page);
        await fullyInViewport(next, page);
        expect(await originalCharacter!.evaluate(node => node.isConnected)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (chapter < 2) {
          await next.click();
          await expect(guide.getByRole("heading", { name: chapter === 0 ? c.journey("campus") : c.choose, exact: true })).toBeFocused();
          await expect.poll(() => pane.evaluate(node => node.scrollTop)).toBe(0);
        }
      }
      expect(seenNarration.size).toBe(3);
      expect(seenCards.size).toBe(3);
      await guide.locator("[data-guide-scroll]").evaluate(node => { node.scrollTop = 0; });
      await page.screenshot({ path: `test-results/launch-guide/evidence/13-short-${language}-${viewport.width}x${viewport.height}.png`, animations: "disabled" });
      await originalCharacter!.dispose();
    }
  });
}

test("motion can be paused and Escape exits without marking setup or the welcome complete", async ({ page, context }) => {
  await signIn(context, "RECEPTIONIST");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/receptionist");
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
  await page.getByRole("button", { name: "Pause motion" }).click();
  await expect(page.getByRole("button", { name: "Play motion" })).toHaveAttribute("aria-pressed", "true");
  const states = await page.locator("[data-launch-guide] svg g").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).animationPlayState));
  expect(states.every(state => state === "paused")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
  expect((await db.user.findUniqueOrThrow({ where: { id: accounts.get("RECEPTIONIST")!.id } })).welcomeCompletedAt).toBeNull();
  await page.getByRole("button", { name: "Replay guide" }).click();
  await expect(page.locator("[data-launch-guide]")).toHaveAttribute("data-chapter", "0");
});

test("confirmed institution activation automatically hands off to campus AI setup", async ({ page, context }) => {
  await signIn(context, "owner");
  const regId = `LAUNCH-${randomUUID().slice(0, 8)}`;
  await db.user.update({ where: { id: accounts.get("owner")!.id }, data: { welcomeCompletedAt: new Date() } });
  await db.institutionSetup.upsert({ where: { schoolId }, create: { schoolId, institutionType: "GROUP" }, update: {} });
  await db.institutionSetup.update({ where: { schoolId }, data: {
    institutionType: "GROUP", adoptionMode: "EXAM_STUDIO", status: "IN_PROGRESS", currentStep: "review",
    completedSteps: ["structure", "identity", "package", "campuses", "academic"],
    draft: { school: { name: "Horizon Academy · Synthetic", city: "Lahore", country: "PK", regId, timezone: "Asia/Karachi", academicYear: "2026", sessionLabel: "2026-27", weekends: [6, 7] }, campuses: [{ key: "new", name: "Launch Campus · Synthetic", city: "Lahore", regId: `${regId}-C` }] },
  } });
  await page.goto("/onboarding");
  await expect(page.getByRole("button", { name: "Activate setup", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate setup", exact: true }).click();
  await expect(page).toHaveURL(/\/ai\?setup=1$/, { timeout: 45000 });
  const campus = await db.campus.findFirstOrThrow({ where: { schoolId, regId: `${regId}-C`.toUpperCase() } });
  await page.getByLabel(schoolAICopy("en").workspaceCampus, { exact: true }).selectOption(campus.id);
  await expect(page.getByRole("heading", { name: schoolAICopy("en").setupPath, exact: true })).toBeVisible();
  expect((await db.institutionSetup.findUniqueOrThrow({ where: { schoolId } })).status).toBe("COMPLETED");
  expect((await db.user.findUniqueOrThrow({ where: { id: accounts.get("owner")!.id } })).onboardingComplete).toBe(true);
  await page.screenshot({ path: "test-results/launch-guide/evidence/09-activated-campus-ai-handoff.png", animations: "disabled" });
});

test.describe("living guide and exhibition showcase", () => {
  test("ongoing motion, greeting and a private showcase end at an explicit workflow choice", async ({ page, context }) => {
    await signIn(context, "RECEPTIONIST");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/receptionist");
    const guide = page.locator("[data-launch-guide]");
    await expect(guide).toBeVisible();
    await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
    const before = await db.user.findUniqueOrThrow({ where: { id: accounts.get("RECEPTIONIST")!.id } });
    // Observe actual movement after the old two-wave sequence would already have ended.
    await page.waitForTimeout(8500);
    const arm = guide.locator('g[class*="guideArm"]');
    const firstPose = await arm.evaluate(node => getComputedStyle(node).transform);
    await expect.poll(() => arm.evaluate(node => getComputedStyle(node).transform)).not.toBe(firstPose);
    await page.getByRole("button", { name: "Pause motion", exact: true }).click();
    await expect(arm).toHaveCSS("animation-play-state", "paused");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const pausedPose = await arm.evaluate(node => getComputedStyle(node).transform);
    await page.waitForTimeout(400);
    expect(await arm.evaluate(node => getComputedStyle(node).transform)).toBe(pausedPose);
    const animationStates = await guide.evaluate(node => node.getAnimations({ subtree: true }).map(animation => animation.playState));
    expect(animationStates.every(state => state === "paused" || state === "finished")).toBe(true);
    await page.getByRole("button", { name: "Play motion", exact: true }).click();
    await page.getByRole("button", { name: "Say hello", exact: true }).click();
    await expect.poll(() => arm.evaluate(node => getComputedStyle(node).transform)).not.toBe(pausedPose);
    await page.screenshot({ path: "test-results/launch-guide/evidence/10-living-guide-desktop.png" });
    await page.clock.install();
    await page.clock.fastForward(2500);
    await page.getByRole("button", { name: launchCopy("en").next, exact: true }).click();
    await expect(guide.locator("[data-pose]")).toHaveAttribute("data-pose", "think");
    await page.getByRole("button", { name: "Say hello", exact: true }).click();
    await expect(guide.locator("[data-pose]")).toHaveAttribute("data-pose", "wave");
    await page.clock.fastForward(2500);
    await expect(guide.locator("[data-pose]")).toHaveAttribute("data-pose", "think");
    await page.getByRole("button", { name: "Showcase", exact: true }).click();
    const showcase = page.locator("[data-showcase]");
    await expect(showcase).toHaveAttribute("data-scene", "0");
    const showcaseCharacter = await showcase.locator("[data-guide-stage] [data-pose] svg").elementHandle();
    await expect(showcase).not.toContainText("Alex");
    await expect(showcase).not.toContainText("Synthetic");
    await expect(page.getByRole("heading", { name: launchCopy("en").demoTitleOne })).toBeFocused();
    let writes = 0;
    page.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/")) writes++; });
    await page.getByRole("button", { name: "Full screen", exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.getByRole("button", { name: "Exit full screen", exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    await page.clock.fastForward(9100);
    await expect(showcase).toHaveAttribute("data-scene", "1");
    expect(await showcaseCharacter!.evaluate(node => node.isConnected)).toBe(true);
    await page.screenshot({ path: "test-results/launch-guide/evidence/11-showcase-desktop.png", animations: "disabled" });
    await page.clock.fastForward(9100);
    await expect(showcase).toHaveAttribute("data-scene", "2");
    await page.clock.fastForward(9100);
    await expect(showcase).toHaveAttribute("data-complete", "true");
    await page.clock.fastForward(60000);
    await expect(showcase).toHaveAttribute("data-complete", "true");
    await expect(showcase).toHaveAttribute("data-scene", "2");
    await page.screenshot({ path: "test-results/launch-guide/evidence/15-showcase-complete.png", animations: "disabled" });
    await page.getByRole("button", { name: "Watch again", exact: true }).click();
    await expect(showcase).toHaveAttribute("data-scene", "0");
    await expect(showcase).not.toHaveAttribute("data-complete", "true");
    await page.getByRole("button", { name: "Pause motion", exact: true }).click();
    await page.clock.fastForward(20000);
    await expect(showcase).toHaveAttribute("data-scene", "0");
    await page.getByRole("button", { name: "Next scene", exact: true }).click();
    await expect(showcase).toHaveAttribute("data-scene", "1");
    await page.getByRole("button", { name: "Next scene", exact: true }).click();
    await expect(showcase).toHaveAttribute("data-scene", "2");
    await showcase.locator("[data-guide-actions]").getByRole("button", { name: launchCopy("en").finishTour, exact: true }).click();
    await expect(showcase).toHaveAttribute("data-complete", "true");
    await page.getByRole("button", { name: "Choose my workflow", exact: true }).click();
    await expect(guide).toHaveAttribute("data-chapter", "2");
    await expect(page.getByRole("heading", { name: launchCopy("en").choose })).toBeFocused();
    await expect(guide.locator("[data-guide-actions]").getByRole("button", { name: launchCopy("en").task("frontDesk"), exact: true })).toBeVisible();
    expect(writes).toBe(0);
    const after = await db.user.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.welcomeCompletedAt).toEqual(before.welcomeCompletedAt);
    expect(after.onboardingComplete).toBe(before.onboardingComplete);
    await showcaseCharacter!.dispose();
  });

  test("showcase respects reduced motion and stays usable on an Arabic phone", async ({ page, context }) => {
    await signIn(context, "ar");
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto("/admin");
    const c = launchCopy("ar");
    await page.getByRole("button", { name: c.showcase, exact: true }).click();
    await page.clock.install();
    await page.clock.fastForward(20000);
    await expect(page.locator("[data-showcase]")).toHaveAttribute("data-scene", "0");
    await expect(page.getByRole("button", { name: c.pause, exact: true })).toBeDisabled();
    await fullyInViewport(page.locator("[data-guide-stage] [data-pose] svg"), page);
    await fullyInViewport(page.getByRole("button", { name: c.showcaseNext, exact: true }), page);
    await page.getByRole("button", { name: c.showcaseNext, exact: true }).click();
    await expect(page.getByRole("heading", { name: c.demoTitleTwo })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("[data-showcase]").evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: "test-results/launch-guide/evidence/12-showcase-ar-mobile.png", animations: "disabled" });
    await page.getByRole("button", { name: c.showcaseReturn, exact: true }).click();
    await expect(page.locator("[data-launch-guide]")).toHaveAttribute("data-chapter", "0");
  });

  test("extreme zoom keeps introduction text readable and actions reachable by scrolling", async ({ page, context }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 320, height: 256 });
    await page.goto("/showcase");
    const c = launchCopy("en");
    const content = page.locator("[data-guide-scroll]");
    await expect(content).toBeVisible();
    expect(await content.evaluate(node => node.clientHeight)).toBeGreaterThan(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const next = page.getByRole("button", { name: c.showcaseNext, exact: true });
    await next.scrollIntoViewIfNeeded();
    await fullyInViewport(next, page);
    await next.click();
    await expect(page.locator("[data-showcase]")).toHaveAttribute("data-scene", "1");
    await expect(page.getByRole("heading", { name: c.demoTitleTwo, exact: true })).toBeFocused();
    await page.getByRole("heading", { name: c.demoTitleTwo, exact: true }).scrollIntoViewIfNeeded();
    await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
    await page.screenshot({ path: "test-results/launch-guide/evidence/17-extreme-zoom.png", animations: "disabled" });
  });

  test("public showcase ends once; exhibition looping requires an explicit choice", async ({ page, context }) => {
    await context.clearCookies();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.goto("/showcase");
    const c = launchCopy("en");
    const showcase = page.locator("[data-showcase]");
    const loop = page.getByRole("button", { name: c.exhibitionLoop, exact: true });
    await expect(loop).toHaveAttribute("aria-pressed", "false");
    for (const scene of ["1", "2"]) {
      await page.clock.fastForward(9100);
      await expect(showcase).toHaveAttribute("data-scene", scene);
    }
    await page.clock.fastForward(9100);
    await expect(showcase).toHaveAttribute("data-complete", "true");
    await page.clock.fastForward(60000);
    await expect(showcase).toHaveAttribute("data-complete", "true");
    await expect(page.getByRole("heading", { name: c.showcaseComplete, exact: true })).toBeVisible();
    await page.getByRole("button", { name: c.watchAgain, exact: true }).click();
    await expect(showcase).toHaveAttribute("data-scene", "0");
    await loop.click();
    await expect(loop).toHaveAttribute("aria-pressed", "true");
    for (const scene of ["1", "2", "0"]) {
      await page.clock.fastForward(9100);
      await expect(showcase).toHaveAttribute("data-scene", scene);
    }
    await expect(showcase).not.toHaveAttribute("data-complete", "true");
    await loop.click();
    await expect(loop).toHaveAttribute("aria-pressed", "false");
  });

  test("public showcase works without sign-in and its final next step leads into registration", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/showcase?lang=ur");
    const c = launchCopy("ur");
    await expect(page.locator("[data-showcase]")).toBeVisible();
    await expect(page.locator("[data-showcase]")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
    await page.getByRole("button", { name: c.showcaseNext, exact: true }).click();
    await page.getByRole("button", { name: c.showcaseNext, exact: true }).click();
    await page.getByRole("button", { name: c.finishTour, exact: true }).click();
    await expect(page.locator("[data-showcase]")).toHaveAttribute("data-complete", "true");
    await expect(page.getByRole("heading", { name: c.showcaseComplete, exact: true })).toBeFocused();
    await page.locator("[data-guide-actions]").getByRole("button", { name: c.getStarted, exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("finishing the private tour reaches the chosen campus interview through an explicit action", async ({ page, context }) => {
    await signIn(context, "PRINCIPAL");
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.goto("/principal");
    const c = launchCopy("en");
    await page.getByRole("button", { name: c.showcase, exact: true }).click();
    await page.getByRole("button", { name: c.showcaseNext, exact: true }).click();
    await page.getByRole("button", { name: c.showcaseNext, exact: true }).click();
    await page.getByRole("button", { name: c.finishTour, exact: true }).click();
    await page.getByRole("button", { name: c.chooseWorkflow, exact: true }).click();
    await expect(page.locator("[data-launch-guide]")).toHaveAttribute("data-chapter", "2");
    const launch = page.locator("[data-guide-actions]").getByRole("button", { name: c.task("aiSetup"), exact: true });
    await fullyInViewport(launch, page);
    await launch.click();
    await expect(page).toHaveURL(/\/ai\?setup=1$/);
    await expect(page.getByRole("dialog").getByText("North Campus · Synthetic", { exact: true })).toBeVisible();
    const ai = schoolAICopy("en");
    await expect(page.getByRole("heading", { name: ai.schoolName, exact: true }).or(page.getByRole("heading", { name: ai.setupPath, exact: true }))).toBeVisible();
    await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
  });
});
