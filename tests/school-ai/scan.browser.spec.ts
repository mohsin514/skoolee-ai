import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { scanCopy } from "../../src/components/school-ai/scan-copy";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { documentReviewCopy } from "../../src/components/school-ai/document-review-copy";

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
test("scanner shows approximate quality signals and corrects explicitly observed page corners locally",async({page})=>{const dialog=await open(page);await dialog.getByLabel("Add page photos",{exact:true}).setInputFiles(await photos(page,1));const preview=dialog.getByRole("img");await expect(preview).toHaveAttribute("width","1200");await expect(dialog.getByText("Local image checks are approximate. Zoom in and inspect symbols and handwriting yourself.",{exact:true})).toBeVisible();await dialog.getByRole("button",{name:"Straighten page perspective",exact:true}).click();const x=dialog.getByRole("spinbutton",{name:"Horizontal %",exact:true}),y=dialog.getByRole("spinbutton",{name:"Vertical %",exact:true});await x.nth(0).fill("10");await y.nth(0).fill("10");await x.nth(1).fill("90");await y.nth(1).fill("10");await x.nth(2).fill("90");await y.nth(2).fill("90");await x.nth(3).fill("10");await y.nth(3).fill("90");await expect(dialog.getByRole("button",{name:"Review and save scan",exact:true})).toBeDisabled();await dialog.getByRole("button",{name:"Apply corner correction",exact:true}).click();await expect(preview).toHaveAttribute("width","960");await expect(preview).toHaveAttribute("height","1280");await dialog.getByRole("button",{name:"Restore original photo",exact:true}).click();await expect(preview).toHaveAttribute("width","1200");await expect(preview).toHaveAttribute("height","1600");});

for(const language of ["en","ar","ur"] as const)test(`${language} structured source review corrects regions, adds missing pages and approves only the complete text`,async({page})=>{
 const c=schoolAICopy(language),t=documentReviewCopy(language);await db.user.update({where:{id:"school-ai-browser-b-ADMIN"},data:{preferredLanguage:language}});if(language!=="en")await page.setViewportSize({width:360,height:800});const title=`Structured review ${randomUUID()}`,base={id:"region-1",box:null,text:"1 2",confidence:null,needsReview:true,reviewed:false,issue:"Check original"};const created=await page.request.post("/api/school-ai/workspace",{data:{kind:"SOURCE",campusId:"school-ai-browser-b-campus",title,idempotencyKey:randomUUID(),data:{documentKind:"syllabus",fileName:"structured.txt",mimeType:"text/plain",origin:"manual",extractionStatus:"needs_review",extractedText:"Original unreviewed text",expectedPageCount:2,missingPages:[2],structureReviewed:false,sourcePages:[{page:1,text:"1 2\nx=2\nTriangle",reviewed:false,regions:[{...base,kind:"TABLE",table:{rows:[["1","2"]]}},{...base,id:"region-2",kind:"MATH",math:{latex:"x=2",plainText:"x equals two"}},{...base,id:"region-3",kind:"FIGURE",figure:{description:"Triangle; unknown dimensions",labels:["A","B"]}}]}]}}});expect(created.ok(),await created.text()).toBeTruthy();const record=(await created.json()).record;try{await page.goto("/ai");await page.getByRole("button",{name:c.sources,exact:true}).click();await page.getByRole("button").filter({hasText:title}).click();await expect(page.getByRole("checkbox",{name:c.sourceReviewed,exact:true})).toBeDisabled();await page.getByRole("button",{name:t.addPage,exact:true}).click();await page.getByLabel(t.pageText,{exact:true}).fill("Second physical page");await page.getByRole("checkbox",{name:t.pageReviewed,exact:true}).check();await page.getByRole("button",{name:`${t.page} 1`,exact:true}).click();for(const [index,kind] of ["TABLE","MATH","FIGURE"].entries())await page.getByText(`${t.region} ${index+1} · ${t[kind as "TABLE"|"MATH"|"FIGURE"]}`,{exact:true}).click();await page.getByLabel(`${t.column} 2`,{exact:true}).fill("5");await page.getByLabel(t.pageText,{exact:true}).fill("1 5\nx=2\nTriangle");for(const checkbox of await page.getByRole("checkbox",{name:t.regionReviewed,exact:true}).all())await checkbox.check();await page.getByRole("checkbox",{name:t.pageReviewed,exact:true}).check();await page.getByRole("button",{name:t.apply,exact:true}).click();await page.getByRole("checkbox",{name:t.complete,exact:true}).check();await page.getByRole("checkbox",{name:c.sourceReviewed,exact:true}).check();await page.getByRole("button",{name:c.save,exact:true}).click();await expect(page.getByRole("button",{name:c.approve,exact:true})).toBeEnabled();await page.getByRole("button",{name:c.approve,exact:true}).click();await expect.poll(async()=>(await db.schoolAiRecord.findUniqueOrThrow({where:{id:record.id}})).status).toBe("APPROVED");const result=(await db.schoolAiRecord.findUniqueOrThrow({where:{id:record.id}})).data as {sourcePages:Array<{regions?:Array<{table?:{rows:string[][]}}>}>;extractedText:string};expect(result.extractedText).toBe("1 5\nx=2\nTriangle\n\nSecond physical page");expect(result.sourcePages[0].regions?.[0].table?.rows[0][1]).toBe("5");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}finally{await db.schoolAiRecord.delete({where:{id:record.id}});}
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
