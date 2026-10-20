import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { USER_ROLES, dashboardPathForRole, type UserRole } from "../../src/lib/roles";
import { launchCopy } from "../../src/components/onboarding/launch-copy";
import { roleGuideCopy } from "../../src/components/onboarding/role-guide-copy";
import type { Language } from "../../src/lib/locale/package";

const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw Error("Only the isolated local test database is allowed.");
const db = new PrismaClient();
const origin = "http://localhost:3110";
const schoolId = `role-persona-${randomUUID()}`;
const campusId = `${schoolId}-campus`;
const tokens = new Map<string, string>();
const captureRoles: UserRole[] = ["STUDENT", "PARENT", "TEACHER", "PRINCIPAL", "CAMPUS_ADMIN"];
const keyFor = (role: UserRole, language: Language) => `${role}-${language}`;
test.use({ video: process.env.ONBOARDING_RECORD_VIDEO === "1" ? { mode: "on", size: { width: 1440, height: 1000 } } : "off" });

test.beforeAll(async () => {
  await db.school.create({ data: {
    id: schoolId, name: "Personal Welcome · Synthetic", slug: schoolId, regId: schoolId,
    city: "Lahore", contactEmail: "synthetic@example.test", status: "ACTIVE", plan: "PRO", registrationKind: "GROUP",
  } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Personal Campus · Synthetic", city: "Lahore", regId: campusId } });
  for (const role of USER_ROLES) {
    for (const language of role === "PARENT" || role === "STUDENT" ? ["en", "ar", "ur"] as const : ["en"] as const) {
      const key = keyFor(role, language), id = `${schoolId}-${key}`;
      const user = await db.user.create({ data: {
        id, schoolId, campusId: ["APP_OWNER", "SUPER_ADMIN"].includes(role) ? null : campusId,
        email: `${key.toLowerCase()}-${schoolId}@example.test`, fullName: "Alex Persona Synthetic", role,
        onboardingComplete: true, mustChangePassword: false, mfaEnabled: true, preferredLanguage: language,
      } });
      const token = await new SignJWT({
        userId: id, schoolId, campusId: user.campusId, role, email: user.email, accessVersion: 0,
        mfaVerified: true, onboardingComplete: true, mustChangePassword: false, schoolStatus: "ACTIVE",
      }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h")
        .sign(new TextEncoder().encode("synthetic-launch-guide-secret-at-least-32-characters"));
      await db.loginSession.create({ data: {
        userId: id, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"),
        isActive: true, expiresAt: new Date(Date.now() + 7200000),
      } });
      tokens.set(key, token);
    }
  }
});
test.afterAll(async () => {
  await db.school.deleteMany({ where: { id: schoolId } });
  await db.$disconnect();
});

async function signIn(context: BrowserContext, role: UserRole, language: Language = "en") {
  await context.clearCookies();
  await context.addCookies([{ name: "skoolee_token", value: tokens.get(keyFor(role, language))!, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function fullyInViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox(), viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}
async function capture(page: Page, name: string) {
  await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
  await page.screenshot({ path: `test-results/role-persona/evidence/${name}.png`, animations: "disabled" });
}
function character(container: Locator) { return container.locator("[data-guide-stage] [data-guide-persona]"); }
async function accessoryGeometry(prop: Locator) {
  return prop.evaluate(node => JSON.stringify(
    [...node.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, line")].map(shape => ({
      tag: shape.tagName,
      geometry: Object.fromEntries(["d", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "points", "x1", "x2", "y1", "y2", "transform"]
        .map(attribute => [attribute, shape.getAttribute(attribute)])
        .filter(([, value]) => value !== null)),
    })),
  ));
}

for (const role of USER_ROLES) {
  test(`${role} receives personal scenes, a role companion and a matching replay`, async ({ page, context }) => {
    await signIn(context, role);
    await page.goto(dashboardPathForRole(role));
    const c = launchCopy("en"), personal = roleGuideCopy(role, "en");
    const guide = page.locator("[data-launch-guide]");
    await expect(guide.getByRole("heading", { name: personal.title, exact: true })).toBeVisible();
    await expect(guide).toContainText(personal.introduction);
    await expect(character(guide)).toHaveAttribute("data-guide-persona", role);
    const prop = character(guide).locator("[data-guide-prop]");
    await expect(prop).toBeVisible();
    expect(await accessoryGeometry(prop)).not.toBe("[]");
    const captions = new Set<string>(), cardSets = new Set<string>();
    for (const chapter of [0, 1, 2]) {
      await expect(guide).toHaveAttribute("data-chapter", `${chapter}`);
      await expect(character(guide)).toHaveAttribute("data-guide-persona", role);
      captions.add((await guide.locator("[data-guide-narration]").textContent())!);
      cardSets.add((await guide.locator(`[data-guide-scene-cards="${chapter}"][data-active]`).textContent())!);
      if (chapter < 2) {
        await guide.locator("[data-guide-actions]").getByRole("button", { name: chapter === 0 ? c.next : c.continue, exact: true }).click();
        await expect(guide.getByRole("heading", { name: chapter === 0 ? personal.preparationTitle : personal.chooseTitle, exact: true })).toBeFocused();
      }
    }
    expect(captions.size).toBe(3);
    expect(cardSets.size).toBe(3);
    if (role === "PARENT" || role === "STUDENT") {
      await expect(guide.getByRole("group", { name: c.choose })).not.toContainText(c.task("institution"));
      await expect(guide.getByRole("group", { name: c.choose })).not.toContainText(c.task("aiSetup"));
      await expect(guide).not.toContainText(c.setupPath);
    }
    await page.getByRole("button", { name: c.showcase, exact: true }).click();
    const showcase = page.locator("[data-showcase]");
    await expect(character(showcase)).toHaveAttribute("data-guide-persona", role);
    await expect(showcase).not.toContainText("Alex");
    await expect(showcase).not.toContainText("Synthetic");
    await expect(showcase.getByRole("heading", { level: 1 })).toHaveText(personal.title);
    await page.getByRole("button", { name: c.showcaseNext, exact: true }).click();
    await expect(showcase).toHaveAttribute("data-scene", "1");
    await expect(showcase.getByRole("heading", { level: 1 })).toHaveText(personal.preparationTitle);
    await expect(character(showcase)).toHaveAttribute("data-guide-persona", role);
    await page.getByRole("button", { name: c.showcaseReturn, exact: true }).click();
    await expect(guide).toHaveAttribute("data-chapter", "2");
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
    await page.getByRole("button", { name: c.replay, exact: true }).click();
    await expect(guide).toHaveAttribute("data-chapter", "0");
    await expect(guide.getByRole("heading", { name: personal.title, exact: true })).toBeVisible();
    await expect(character(guide)).toHaveAttribute("data-guide-persona", role);
    if (captureRoles.includes(role)) await capture(page, `01-${role.toLowerCase()}-welcome`);
    await page.getByRole("button", { name: c.sayHello, exact: true }).click();
    await expect(guide.locator("[data-guide-narration]")).toContainText(personal.greeting);
  });
}

test("all eleven roles have visibly different accessories", async ({ page, context }) => {
  const artwork: string[] = [];
  for (const role of USER_ROLES) {
    await signIn(context, role);
    await page.goto(dashboardPathForRole(role));
    const prop = character(page.locator("[data-launch-guide]")).locator("[data-guide-prop]");
    await expect(prop).toBeVisible();
    // IDs, colors and role labels cannot make identical drawings pass this check.
    artwork.push(await accessoryGeometry(prop));
  }
  expect(artwork.every(value => value !== "[]")).toBe(true);
  expect(new Set(artwork).size).toBe(USER_ROLES.length);
});

for (const role of ["STUDENT", "PARENT"] as const) {
  for (const language of ["en", "ar", "ur"] as const) {
    test(`${role} ${language} short-mobile welcome keeps the companion and controls visible`, async ({ page, context }) => {
      await signIn(context, role, language);
      await page.setViewportSize({ width: 390, height: 667 });
      await page.goto(dashboardPathForRole(role));
      const c = launchCopy(language), personal = roleGuideCopy(role, language);
      const guide = page.locator("[data-launch-guide]");
      await expect(guide.getByRole("heading", { name: personal.title, exact: true })).toBeVisible();
      await expect(page.getByRole("dialog", { name: c.guide })).toHaveCSS("direction", language === "en" ? "ltr" : "rtl");
      for (const chapter of [0, 1, 2]) {
        await expect(guide).toHaveAttribute("data-chapter", `${chapter}`);
        await fullyInViewport(character(guide).locator("svg"), page);
        const primary = guide.locator("[data-guide-actions]").getByRole("button").last();
        await fullyInViewport(primary, page);
        await guide.locator("[data-guide-scroll]").evaluate(node => { node.scrollTop = node.scrollHeight; });
        await fullyInViewport(character(guide).locator("svg"), page);
        await fullyInViewport(primary, page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (chapter < 2) await primary.click();
      }
      const animations = await guide.locator("svg g").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).animationName));
      expect(animations.every(value => value === "none")).toBe(true);
      await capture(page, `02-${role.toLowerCase()}-${language}-mobile-choices`);
      await page.getByRole("button", { name: c.showcase, exact: true }).click();
      await expect(character(page.locator("[data-showcase]"))).toHaveAttribute("data-guide-persona", role);
      await fullyInViewport(page.getByRole("button", { name: c.showcaseNext, exact: true }), page);
      await capture(page, `03-${role.toLowerCase()}-${language}-mobile-showcase`);
    });
  }
}

test("standalone public showcase retains its generic character and visitor story", async ({ page, context }) => {
  await signIn(context, "PARENT");
  await page.goto("/showcase");
  const c = launchCopy("en"), showcase = page.locator("[data-showcase]");
  await expect(showcase.getByRole("heading", { name: c.demoTitleOne, exact: true })).toBeVisible();
  await expect(character(showcase)).toHaveAttribute("data-guide-persona", "showcase");
  await expect(showcase).not.toContainText(roleGuideCopy("PARENT", "en").title);
  await expect(showcase).not.toContainText("Alex");
  await expect(showcase).not.toContainText("Synthetic");
});
