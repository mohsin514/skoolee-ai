import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { scanCopy } from "../../src/components/school-ai/scan-copy";
import { schoolAICopy } from "../../src/lib/school-ai/copy";

const origin = "http://localhost:3106";
const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw new Error("Use only the isolated local school AI test database.");
const db = new PrismaClient();
test.beforeEach(async ({ context }) => {
  await db.user.update({ where: { id: "school-ai-browser-b-ADMIN" }, data: { preferredLanguage: "en" } });
  const tokens = JSON.parse(await readFile("test-results/school-ai/local-tokens.json", "utf8"));
  await context.addCookies([{ name: "skoolee_token", value: tokens["b-ADMIN"], url: origin, httpOnly: true, sameSite: "Lax" }]);
});
test.afterAll(async () => { await db.user.update({ where: { id: "school-ai-browser-b-ADMIN" }, data: { preferredLanguage: "en" } }); await db.$disconnect(); });
async function photos(page: Page, count = 2) {
  const data = await page.evaluate(({ count, nonce }) => Array.from({ length: count }, (_, index) => {
    const canvas = document.createElement("canvas"); canvas.width = index % 2 ? 1600 : 1200; canvas.height = index % 2 ? 1200 : 1600;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "black"; ctx.font = "40px sans-serif"; ctx.fillText(`Synthetic source ${index + 1}`, 120, 150); ctx.fillText(nonce, 120, 220);
    return canvas.toDataURL("image/png").split(",")[1];
  }), { count, nonce: randomUUID() });
  return data.map((value, index) => ({ name: `synthetic-page-${index + 1}.png`, mimeType: "image/png", buffer: Buffer.from(value, "base64") }));
}
async function open(page: Page) {
  await page.goto("/ai"); await page.getByRole("button", { name: "Source library", exact: true }).click(); await page.getByRole("button", { name: "Scan multiple pages", exact: true }).click();
  return page.getByRole("dialog", { name: "Turn your pages into one document", exact: true });
}

test("scan crops, rotates, reorders and removes photos, then saves a real private multi-page PDF", async ({ page }) => {
  const dialog = await open(page), title = `Synthetic scan ${randomUUID()}`;
  await dialog.getByLabel("Add page photos", { exact: true }).setInputFiles(await photos(page, 3));
  const preview = dialog.getByRole("img", { name: "Prepared page preview 1", exact: true });
  await expect(preview).toHaveAttribute("height", "1600");
  await dialog.getByLabel("Top %", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Apply or clear the crop changes");
  await dialog.getByRole("button", { name: "Apply crop", exact: true }).click();
  await expect(preview).toHaveAttribute("height", "1440");
  await dialog.getByRole("button", { name: "Rotate right", exact: true }).click();
  await expect(preview).toHaveAttribute("width", "1440"); await expect(preview).toHaveAttribute("height", "1200");
  await dialog.getByRole("button", { name: "Move later", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Page 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Page 3", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove page", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Page 3", exact: true })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: /^Document title/ }).fill(title);
  await dialog.getByRole("checkbox", { name: /^I checked page order/ }).check();
  const savedResponse = page.waitForResponse(response => response.url().endsWith("/api/school-ai/intake") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Review and save scan", exact: true }).click();
  const response = await savedResponse; expect(response.ok(), await response.text()).toBeTruthy();
  const { record } = await response.json(); expect(record.title).toBe(`${title}.pdf`); expect(record.data.extractionStatus).toBe("needs_review"); expect(record.data.origin).toBe("camera");
  await expect(dialog).toHaveCount(0);
  const pdf = await page.request.get(`/api/school-ai/sources/${record.id}/file`); expect(pdf.ok()).toBeTruthy(); expect(pdf.headers()["cache-control"]).toContain("no-store"); expect(pdf.headers()["content-security-policy"]).toBe("sandbox; default-src 'none'");
  const bytes = await pdf.body(); expect(bytes.subarray(0, 5).toString()).toBe("%PDF-"); expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(2);
  await mkdir("test-results/school-ai/scan", { recursive: true });
  await writeFile("test-results/school-ai/scan/prepared.pdf", bytes);
});

test("failed intake preserves reviewed pages and retries the same prepared PDF", async ({ page }) => {
  let assembled = 0, uploads = 0;
  page.on("request", request => { if (request.url().endsWith("/api/school-ai/scan")) assembled++; });
  await page.route("**/api/school-ai/intake", async route => { uploads++; if (uploads === 1) await route.fulfill({ status: 503, json: { error: "Synthetic unavailable response" } }); else await route.continue(); });
  const dialog = await open(page);
  await dialog.getByLabel("Add page photos", { exact: true }).setInputFiles(await photos(page, 1));
  await expect(dialog.getByRole("img")).toBeVisible();
  await dialog.getByRole("textbox", { name: /^Document title/ }).fill(`Synthetic retry scan ${randomUUID()}`);
  await dialog.getByRole("checkbox", { name: /^I checked page order/ }).check();
  await dialog.getByRole("button", { name: "Review and save scan", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Your pages are still here");
  await expect(dialog.getByRole("img")).toBeVisible();
  await dialog.getByRole("button", { name: "Review and save scan", exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(assembled).toBe(1); expect(uploads).toBe(2);
});

test("scanner protects unsaved photos and remains within the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const dialog = await open(page);
  await dialog.getByLabel("Add page photos", { exact: true }).setInputFiles(await photos(page, 1));
  await expect(dialog.getByRole("img")).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  await dialog.getByRole("button", { name: "Close scanner", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: /Keep editing/ }).click();
  await expect(dialog.getByRole("img")).toBeVisible();
});

for (const phase of ["scan", "intake"] as const) test(`a stalled ${phase} request can stop waiting without losing pages`, async ({ page }) => {
  let release = () => {};
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let calls = 0, assemblies = 0;
  page.on("request", request => { if (request.url().endsWith("/api/school-ai/scan")) assemblies++; });
  await page.route(`**/api/school-ai/${phase}`, async route => {
    if (++calls === 1) { await blocked; await route.abort().catch(() => {}); }
    else await route.continue();
  });
  try {
    const dialog = await open(page);
    await dialog.getByLabel("Add page photos", { exact: true }).setInputFiles(await photos(page, 1));
    await expect(dialog.getByRole("img")).toBeVisible();
    await dialog.getByRole("textbox", { name: /^Document title/ }).fill(`Synthetic stalled ${phase} ${randomUUID()}`);
    await dialog.getByRole("checkbox", { name: /^I checked page order/ }).check();
    await dialog.getByRole("button", { name: "Review and save scan", exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await dialog.getByRole("button", { name: "Stop waiting", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Your pages are kept here");
    await expect(dialog.getByRole("img")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close scanner", exact: true })).toBeEnabled();
    release();
    await dialog.getByRole("button", { name: "Review and save scan", exact: true }).click();
    await expect(dialog).toHaveCount(0); expect(calls).toBe(2); expect(assemblies).toBe(phase === "scan" ? 2 : 1);
  } finally { release(); }
});

test("scan assembly rejects another campus, unsupported input and family accounts", async ({ page, playwright }) => {
  await page.goto("/ai"); const image = (await photos(page, 1))[0];
  const request = (campusId: string, file = image) => page.request.post("/api/school-ai/scan", { headers: { Origin: origin }, multipart: { pages: file, documentKind: "syllabus", campusId } });
  expect((await request("school-ai-browser-a-campus")).status()).toBe(403);
  expect((await request("school-ai-browser-b-campus", { name: "active.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg><script>bad()</script></svg>") })).status()).toBe(400);
  expect((await request("school-ai-browser-b-campus", { ...image, buffer: image.buffer.subarray(0, 33) })).status()).toBe(400);
  const tokens = JSON.parse(await readFile("test-results/school-ai/local-tokens.json", "utf8"));
  const student = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Cookie: `skoolee_token=${tokens["b-STUDENT"]}`, Origin: origin } });
  try { expect((await student.post("/api/school-ai/scan", { multipart: { pages: image, documentKind: "syllabus", campusId: "school-ai-browser-b-campus" } })).status()).toBe(403); }
  finally { await student.dispose(); }
});

test("scanner uses Arabic and Urdu controls with an RTL mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const language of ["ar", "ur"] as const) {
    await db.user.update({ where: { id: "school-ai-browser-b-ADMIN" }, data: { preferredLanguage: language } });
    const t = scanCopy(language), c = schoolAICopy(language);
    await page.goto("/ai"); await page.getByRole("button", { name: c.sources, exact: true }).click(); await page.getByRole("button", { name: t.open, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: t.title, exact: true });
    await dialog.getByLabel(t.add, { exact: true }).setInputFiles(await photos(page, 1));
    await expect(dialog.getByRole("img")).toBeVisible();
    expect(await dialog.locator("section[dir]").first().getAttribute("dir")).toBe("rtl");
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
    await mkdir("test-results/school-ai/scan", { recursive: true });
    await page.screenshot({ path: `test-results/school-ai/scan/${language}-mobile.png`, fullPage: true });
    await dialog.getByRole("button", { name: t.remove, exact: true }).click();
    await dialog.getByRole("button", { name: t.close, exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});
