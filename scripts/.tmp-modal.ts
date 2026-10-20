import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../src/lib/auth/mfa-crypto";

const out = process.argv[2];
const base = process.env.BASE || "http://localhost:3000";
const raw = new PrismaClient();
async function owner(language: string) {
  const schoolId = `claude-preview-${randomUUID()}`, userId = randomUUID(), email = `${userId}@example.invalid`, password = `Preview-${randomUUID()}`;
  await raw.school.create({ data: { id: schoolId, name: "Preview Group (synthetic)", slug: schoolId, regId: schoolId, contactEmail: email, city: "Lahore", status: "TRIAL", plan: "FREE", registrationKind: "GROUP" } });
  await raw.user.create({ data: { id: userId, email, password: await bcrypt.hash(password, 12), fullName: "Preview owner", schoolId, role: "SUPER_ADMIN", isInstitutionOwner: true, onboardingComplete: false, isActive: true, preferredLanguage: language } });
  await raw.localePolicy.create({ data: { schoolId, scopeKey: "school", status: "ACTIVE", effectiveAt: new Date(Date.now() - 60_000), createdBy: userId, settings: { country: "PK", countryIso: "PK", currency: "PKR" } } });
  return { schoolId, email, password };
}
(async () => {
  const made: string[] = [];
  const browser = await chromium.launch();
  try {
    for (const language of ["en", "ar"]) {
      const o = await owner(language); made.push(o.schoolId);
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      ctx.setDefaultTimeout(150000);
      for (let attempt = 0; attempt < 4; attempt++) {
        const status = (await ctx.request.post(base + "/api/auth/login", { data: { email: o.email, password: o.password }, timeout: 150000 })).status();
        console.log(language, "login", status);
        if (status === 200) break;
        await new Promise((r) => setTimeout(r, 4000));
      }
      const setup = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" }, timeout: 150000 })).json().catch(() => ({}));
      if (setup.secret) {
        await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(setup.secret) } });
        await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
      }
      const page = await ctx.newPage();
      const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
      for (const width of language === "en" ? [1440, 390] : [1440]) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        await page.goto(base + "/onboarding/package?returnStep=package&enrollment=420", { waitUntil: "load" });
        await page.locator("[data-plan='PRO']").waitFor({ timeout: 150000 });
        await page.waitForTimeout(1500);
        console.log(language, width, "url", page.url(), "recommended:", await page.locator("[data-recommended]").getAttribute("data-plan"), "dir:", await page.locator("[role=dialog]").first().evaluate((el) => getComputedStyle(el).direction));
        console.log(language, width, "verdict:", (await page.locator(".sk-verdict-bubble").innerText()).replace(/\s+/g, " "));
        await page.screenshot({ path: `${out}/dd-${language}-${width}.png` });
      }
      if (language === "en") {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator("#chooser-campuses").fill("8");
        await page.waitForTimeout(900);
        console.log("8 campuses -> recommended:", await page.locator("[data-recommended]").getAttribute("data-plan"), "|", (await page.locator(".sk-verdict-bubble").innerText()).replace(/\s+/g, " "));
        await page.getByRole("button", { name: /Annual/ }).click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${out}/dd-en-8-annual.png` });
        await page.locator("[data-plan='ENTERPRISE'] .sk-package-action button").click();
        try { await page.locator(".sk-receipt").waitFor({ timeout: 150000 }); }
        catch (e) { await page.screenshot({ path: `${out}/dd-debug.png` }); console.log("debug alerts:", await page.locator("[role=alert]").allInnerTexts(), "errors", errors); throw e; }
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${out}/dd-en-receipt.png` });
        console.log("receipt title:", await page.locator("[role=dialog] h2").first().innerText(), "|", (await page.locator(".sk-receipt").innerText()).replace(/\s+/g, " ").slice(0, 160));
        // Back to choose, size down, choose Pro -> hand-off -> test checkout page.
        await page.getByRole("button", { name: "Choose a different package" }).click();
        await page.locator("#chooser-campuses").fill("1");
        await page.waitForTimeout(900);
        await page.locator("[data-plan='BASIC'] .sk-package-action button").click();
        await page.locator(".sk-handoff").waitFor({ timeout: 150000 });
        await page.screenshot({ path: `${out}/dd-en-handoff.png` });
        await page.waitForURL(/test-checkout/, { timeout: 150000 });
        console.log("handoff ->", page.url());
      }
      console.log(language, "page errors", errors);
      await ctx.close();
    }
  } finally {
    await browser.close();
    for (const id of made) await raw.school.delete({ where: { id } }).catch((e) => console.log("cleanup", e.message));
    await raw.$disconnect();
  }
})();
