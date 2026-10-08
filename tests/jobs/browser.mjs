import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
if (process.env.DATABASE_URL !== "postgresql://postgres@127.0.0.1:55423/sko223")
  throw new Error("Only isolated local database");
const fixture = JSON.parse(
  await readFile(`${tmpdir()}/sko223-job-fixture.json`, "utf8"),
);
const db = new PrismaClient(),
  base = "http://localhost:3223",
  output = "docs/qa/evidence/sko-223";
await mkdir(output, { recursive: true });
const invalid = await db.activityJob.findFirstOrThrow({
  where: {
    schoolId: fixture.schoolId,
    kind: "IMPORT",
    items: {
      some: { payload: { path: ["csv"], equals: "wrong,headers\na,b" } },
    },
  },
});
const evidence = [];
for (const [role, cookie] of Object.entries(fixture.cookies)) {
  const response = await fetch(`${base}/api/jobs/${fixture.jobId}`, {
    headers: { cookie },
  });
  const allowed = [
    "SUPER_ADMIN",
    "ADMIN",
    "CAMPUS_ADMIN",
    "PRINCIPAL",
    "TEACHER",
    "ACCOUNTANT",
    "LIBRARIAN",
    "RECEPTIONIST",
  ].includes(role);
  assert.equal(
    response.status,
    allowed
      ? 200
      : role === "APP_OWNER" || role === "PARENT" || role === "STUDENT"
        ? 404
        : 403,
    `${role} read status`,
  );
  const cross = await fetch(`${base}/api/jobs/${fixture.jobId}`, {
    method: "POST",
    headers: {
      cookie,
      origin: "https://cross-site.invalid",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "cancel", items: [] }),
  });
  assert.equal(cross.status, 403);
  evidence.push({
    check: "role API read and cross-site mutation denial",
    role,
    status: response.status,
    crossSite: cross.status,
  });
}
const browser = await chromium.launch({ headless: true });
for (const [viewport, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 820, 1180],
  ["phone", 390, 844],
])
  for (const language of ["en", "ar", "ur"]) {
    await db.user.update({
      where: { id: fixture.users.PRINCIPAL },
      data: { preferredLanguage: language },
    });
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.context().addCookies([
      {
        name: "skoolee_token",
        value: fixture.cookies.PRINCIPAL.split("=")[1],
        url: base,
      },
    ]);
    await page.goto(`${base}/jobs?id=${invalid.id}`);
    await page.waitForFunction(
      (lang) => document.documentElement.lang === lang,
      language,
    );
    const checkbox = page.getByRole("checkbox");
    await checkbox.waitFor();
    await checkbox.focus();
    await page.keyboard.press("Space");
    assert.ok(await checkbox.isChecked());
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: `${output}/recovery-${viewport}-${language}.png`,
      fullPage: true,
    });
    await page.reload();
    await page.getByRole("checkbox").waitFor();
    assert.ok(page.url().includes(invalid.id));
    await page.goto(`${base}/jobs?id=${fixture.jobId}`);
    await page.locator("article").first().waitFor();
    assert.equal(await page.locator("article").count(), 100);
    await page.screenshot({
      path: `${output}/receipts-${viewport}-${language}.png`,
      fullPage: false,
    });
    assert.deepEqual(errors, []);
    evidence.push({
      check: "recovery and receipts",
      viewport,
      language,
      keyboard: true,
      reopenSameJob: true,
      noOverflow: true,
      errors,
    });
    await page.close();
  }
for (const language of ["en", "ar", "ur"])
  for (const [role, cookie] of Object.entries(fixture.cookies))
    for (const [viewport, width, height] of [
      ["desktop", 1440, 1000],
      ["tablet", 820, 1180],
      ["phone", 390, 844],
    ]) {
      await db.user.update({
        where: { id: fixture.users[role] },
        data: { preferredLanguage: language },
      });
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page
        .context()
        .addCookies([
          { name: "skoolee_token", value: cookie.split("=")[1], url: base },
        ]);
      await page.goto(`${base}/jobs?id=${fixture.jobId}`);
      await page.waitForTimeout(600);
      const allowed = [
        "SUPER_ADMIN",
        "ADMIN",
        "CAMPUS_ADMIN",
        "PRINCIPAL",
        "TEACHER",
        "ACCOUNTANT",
        "LIBRARIAN",
        "RECEPTIONIST",
      ].includes(role);
      if (allowed) {
        await page.locator("article").first().waitFor();
        if (["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"].includes(role))
          assert.equal(
            await page
              .getByRole("button", {
                name: /Request cancellation|طلب الإلغاء|منسوخی کی درخواست/,
              })
              .count(),
            0,
          );
      } else assert.equal(await page.locator("article").count(), 0);
      assert.deepEqual(errors, []);
      evidence.push({
        check: "role layout",
        role,
        viewport,
        language,
        privateRowsVisible: allowed,
        errors,
      });
      await page.close();
    }
await browser.close();
await db.$disconnect();
await writeFile(`${output}/browser.json`, JSON.stringify(evidence, null, 2));
console.log(`Verified ${evidence.length} browser/API cases`);
