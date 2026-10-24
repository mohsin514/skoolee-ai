import { messages } from "../../src/lib/locale/messages";
import { ROLE_DASHBOARD_PATHS } from "../../src/lib/roles";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// SKO-498: the personal language is chosen with the Settings modal's radio cards (the institutional
// /settings/locale panel then follows the live display language); tokens carry a server LoginSession.
const url = process.env.DATABASE_URL || "";
if (!url.includes("127.0.0.1:55401/sko201") && !url.includes("127.0.0.1:55438/postgres")) throw new Error("Local SKO-201 database required");
const base = process.env.LOCALE_TEST_APP || "http://localhost:3201", secret = process.env.LOCALE_AUTH_SECRET || "local-sko201-fixture";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Local app required");
const evidence = process.env.LOCALE_EVIDENCE_DIR || "/tmp/sko201-evidence";
const db = new PrismaClient();
const roles = ["APP_OWNER", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "PARENT", "STUDENT", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const;

async function token(role: string) {
 const account = await db.user.findUniqueOrThrow({ where: { id: `locale-${role}` } });
 const value = await new SignJWT({ userId: account.id, schoolId: "locale-fixture", campusId: account.campusId, role, mfaVerified: true, accessVersion: account.accessVersion, schoolStatus: "ACTIVE", onboardingComplete: true }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(secret));
 await db.loginSession.create({ data: { schoolId: "locale-fixture", userId: account.id, tokenHash: createHash("sha256").update(value).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
 return value;
}

async function main() {
 await mkdir(evidence, { recursive: true });
 const browser = await chromium.launch({ headless: true });
 const results: string[] = [];
 try {
  for (const role of roles) {
   await db.user.update({ where: { id: `locale-${role}` }, data: { preferredLanguage: null } });
   const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
   await context.addCookies([{ name: "skoolee_token", value: await token(role), url: base }]);
   const page = await context.newPage();
   await page.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
   for (const language of ["ar", "ur", "en"] as const) {
    // The personal choice, through the current control: the Settings modal's language radio cards.
    await page.goto(`${base}${ROLE_DASHBOARD_PATHS[role]}?settings=language`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const card = page.locator(`label[for="settings-language-${language}"]`);
    await card.waitFor({ timeout: 120000 });
    await card.click();
    await page.waitForFunction(lang => document.documentElement.lang === lang, language, { timeout: 30000 });
    assert.equal(await page.locator(`#settings-language-${language}`).isChecked(), true, `${role}/${language} selected`);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: `locale-${role}` } })).preferredLanguage, language, `${role}/${language} saved`);
    results.push(`${role}/${language}: personal save pass`);
    // The institutional panel follows the live display language at every width.
    await page.goto(`${base}/settings/locale`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const panel = page.locator("section[aria-labelledby='locale-heading']");
    await panel.waitFor({ timeout: 120000 });
    await panel.locator("select").first().waitFor({ timeout: 60000 }); // the scope selector renders once settings load
    assert.equal(await panel.getAttribute("lang"), language);
    assert.equal(await panel.getAttribute("dir"), language === "en" ? "ltr" : "rtl");
    const permitted = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"].includes(role);
    for (const width of [1440, 768, 390]) {
     await page.setViewportSize({ width, height: 1000 });
     assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${role}/${language} overflow at ${width}`);
     assert.equal(await panel.getByRole("button", { name: messages(language).preview, exact: true }).count(), permitted ? 1 : 0, `${role}/${language} preview`);
     if (width === 390 || role === "CAMPUS_ADMIN") await page.screenshot({ path: `${evidence}/${role}-${language}-${width}.png`, fullPage: true });
     results.push(`${role}/${language}/${width}: pass`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
   }
   await context.close();
  }
  console.log(results.join("\n"));
  console.log(`${results.filter(r => r.includes("personal save")).length} personal saves, ${results.filter(r => /\/\d+: pass$/u.test(r)).length} regional checks`);
 } finally { await browser.close(); await db.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
