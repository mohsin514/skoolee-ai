import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { jobMessages } from "../../../src/lib/jobs/messages";

const target = new URL(process.env.DATABASE_URL || "http://invalid");
if (target.hostname !== "127.0.0.1" || target.port !== "55439" || target.pathname !== "/sko386_test") throw new Error("Dedicated synthetic jobs database required");
type Fixture = { schoolId: string; campusId: string; users: Record<string,string>; cookies: Record<string,string>; jobs: { recovery:string; unknown:string; queued:string; pdf:string; import:string }; eligibleItemId:string };
const fixture: Fixture = JSON.parse(readFileSync("/private/tmp/sko386-browser-fixture.json", "utf8"));
const db = new PrismaClient();
const evidence = resolve("docs/qa/evidence/sko-386-2026-10-15");
mkdirSync(evidence, { recursive: true });
test.afterAll(async () => db.$disconnect());
test.beforeEach(async ({ context, baseURL }) => {
  await db.user.update({where:{id:fixture.users.PRINCIPAL},data:{preferredLanguage:"en"}});
  await context.addCookies([{name:"skoolee_token",value:fixture.cookies.PRINCIPAL.replace(/^skoolee_token=/,""),url:baseURL!}]);
});

for (const language of ["en","ar","ur"] as const) for (const [width,height] of [[320,720],[390,844],[768,1024],[1440,1000]]) {
  test(`actual recovery and confirmation ${language} ${width}px`, async ({page}) => {
    const t=jobMessages[language];
    await db.user.update({where:{id:fixture.users.PRINCIPAL},data:{preferredLanguage:language}});
    await page.setViewportSize({width,height}); await page.emulateMedia({reducedMotion:"reduce"});
    await page.goto(`/jobs?id=${fixture.jobs.recovery}&itemState=failed`);
    await expect(page.locator("main[lang]")).toHaveAttribute("lang",language);
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    await expect(page.getByText(t.processingNote)).toBeVisible();
    const checkbox=page.getByRole("checkbox").first(); await checkbox.focus(); await page.keyboard.press("Space"); await expect(checkbox).toBeChecked();
    const retry=page.getByRole("button",{name:new RegExp(t.retry)}); await retry.focus(); await page.keyboard.press("Enter");
    const dialog=page.getByRole("dialog",{name:t.reviewRetry}); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button",{name:t.confirmRetry})).toBeDisabled();
    await dialog.getByLabel(t.reason).selectOption("CONFIGURATION_CORRECTED");
    await expect(dialog.getByRole("button",{name:t.confirmRetry})).toBeEnabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const bounds=await dialog.boundingBox(); expect(bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({path:resolve(evidence,`retry-${language}-${width}.png`),fullPage:false});
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(retry).toBeFocused();
    await page.reload(); await expect(page.getByRole("checkbox").first()).toBeVisible();
    expect(page.url()).toContain(fixture.jobs.recovery);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:resolve(evidence,`recovery-${language}-${width}.png`),fullPage:false});
  });
}

test("URL filters and Back/Forward retain the selected job and restore list scope",async({page})=>{
  await page.goto("/jobs?state=all&kind=PDF");
  await expect(page.getByLabel(jobMessages.en.kindFilter)).toHaveValue("PDF");
  const card=page.locator("button").filter({hasText:fixture.jobs.pdf}); await expect(card).toBeVisible(); await card.click();
  await expect(page).toHaveURL(new RegExp(`id=${fixture.jobs.pdf}`));
  await expect(page.getByRole("heading",{level:2})).toBeVisible();
  await page.goBack(); await expect(page.getByLabel(jobMessages.en.kindFilter)).toHaveValue("PDF");
  await expect(page.getByLabel(jobMessages.en.stateFilter)).toHaveValue("all");
  await page.goForward(); await expect(page).toHaveURL(new RegExp(`id=${fixture.jobs.pdf}`));
  await expect(page.getByRole("heading",{level:2})).toBeVisible();
});

test("delayed prior job response cannot overwrite a newly selected job",async({page})=>{
  let release!:()=>void; const waiting=new Promise<void>(resolve=>{release=resolve}); let entered!:()=>void; const requested=new Promise<void>(resolve=>{entered=resolve});
  await page.route(`**/api/jobs/${fixture.jobs.recovery}`,async route=>{const response=await route.fetch();entered();await waiting;await route.fulfill({response}).catch(()=>{});});
  await page.goto(`/jobs?id=${fixture.jobs.recovery}`); await requested;
  await page.evaluate(id=>history.pushState(null,"",`/jobs?id=${id}`),fixture.jobs.unknown);
  await expect(page.getByRole("button",{name:jobMessages.en.reviewOutcome}).first()).toBeVisible();
  release();
  await expect(page.getByText(fixture.jobs.unknown,{exact:true})).toBeVisible();
  await expect(page.getByText(fixture.jobs.recovery,{exact:true})).toHaveCount(0);
});

test("network failure keeps last confirmation and disables unsafe actions, then refresh recovers",async({page})=>{
  await page.goto(`/jobs?id=${fixture.jobs.recovery}&itemState=failed`); const checkbox=page.getByRole("checkbox").first();await checkbox.check();
  const before=await page.locator("article").count();
  await page.route(`**/api/jobs/${fixture.jobs.recovery}`,route=>route.fulfill({status:503,json:{error:"synthetic outage"}}));
  await page.getByRole("button",{name:jobMessages.en.refresh,exact:true}).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(jobMessages.en.unknown);
  await expect(page.locator("article")).toHaveCount(before);
  await expect(page.getByRole("button",{name:new RegExp(jobMessages.en.retry)})).toBeDisabled();
  await expect(page.getByText(new RegExp(jobMessages.en.updated))).toBeVisible();
  await page.unroute(`**/api/jobs/${fixture.jobs.recovery}`);
  await page.getByRole("button",{name:jobMessages.en.refresh,exact:true}).click();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button",{name:new RegExp(jobMessages.en.retry)})).toBeEnabled();
});

test("permission denial clears protected rows, selection and an open recovery dialog",async({page})=>{
  await page.goto(`/jobs?id=${fixture.jobs.recovery}&itemState=failed`); await page.getByRole("checkbox").first().check();
  await page.getByRole("button",{name:new RegExp(jobMessages.en.retry)}).click(); await expect(page.getByRole("dialog")).toBeVisible();
  await page.route(`**/api/jobs/${fixture.jobs.recovery}`,route=>route.fulfill({status:403,json:{error:"synthetic revocation"}}));
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await expect(page.locator("main").getByRole("alert")).toContainText(jobMessages.en.denied);
  await expect(page.locator("article")).toHaveCount(0); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("receipt export reauthorizes instead of downloading a cached private snapshot",async({page})=>{
  await page.goto(`/jobs?id=${fixture.jobs.recovery}`); await expect(page.locator("article").first()).toBeVisible();
  let downloads=0;page.on("download",()=>downloads++);
  await page.route(`**/api/jobs/${fixture.jobs.recovery}`,route=>route.fulfill({status:403,json:{error:"synthetic revocation"}}));
  await page.getByRole("button",{name:jobMessages.en.receipt,exact:true}).click();
  await expect(page.getByText(jobMessages.en.exportFailed)).toBeVisible();
  await expect(page.locator("article")).toHaveCount(0);expect(downloads).toBe(0);
});

test("unknown outcomes expose evidence review without a resend action",async({page})=>{
  await page.goto(`/jobs?id=${fixture.jobs.unknown}`);
  await expect(page.getByRole("button",{name:jobMessages.en.reviewOutcome}).first()).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button",{name:jobMessages.en.reviewOutcome}).first().click();
  const dialog=page.getByRole("dialog",{name:jobMessages.en.reviewOutcome});await expect(dialog).toBeVisible();
  await expect(dialog.getByText(jobMessages.en.outcomeNote)).toBeVisible();
  await expect(dialog.getByRole("button",{name:jobMessages.en.confirmRetry})).toHaveCount(0);
  await page.screenshot({path:resolve(evidence,"unknown-evidence-en.png"),fullPage:false});
});

test("a failed action keeps its reason and dialog; a fresh server acknowledgment is required",async({page})=>{
  await page.goto(`/jobs?id=${fixture.jobs.recovery}&itemState=failed`); await page.getByRole("checkbox").first().check();
  await page.getByRole("button",{name:new RegExp(jobMessages.en.retry)}).click();
  const dialog=page.getByRole("dialog"); await dialog.getByLabel(jobMessages.en.reason).selectOption("CONFIGURATION_CORRECTED");
  await page.route(`**/api/jobs/${fixture.jobs.recovery}`,async route=>{if(route.request().method()==="POST")await route.fulfill({status:409,json:{error:"Synthetic conflict"}});else await route.continue();});
  await dialog.getByRole("button",{name:jobMessages.en.confirmRetry}).click();
  await expect(dialog.getByRole("alert")).toContainText(jobMessages.en.actionFailed);
  await expect(dialog.getByLabel(jobMessages.en.reason)).toHaveValue("CONFIGURATION_CORRECTED");
  await expect(dialog.getByText(jobMessages.en.retrySaved)).toHaveCount(0);
});

test("receipt export downloads a freshly authorized persisted job",async({page})=>{
  await page.goto(`/jobs?id=${fixture.jobs.recovery}`);await expect(page.locator("article").first()).toBeVisible();
  const downloaded=page.waitForEvent("download");
  await page.getByRole("button",{name:jobMessages.en.receipt,exact:true}).click();
  const file=await downloaded;const path=await file.path();const receipt=JSON.parse(readFileSync(path!,"utf8"));
  expect(receipt.id).toBe(fixture.jobs.recovery);expect(receipt.counts.total).toBe(100);expect(receipt.exportedAt).toBeTruthy();
  expect(Object.keys(receipt.counts).filter(key=>key!=="total").reduce((sum,key)=>sum+receipt.counts[key],0)).toBe(100);
  await expect(page.getByText(jobMessages.en.exportSaved)).toBeVisible();
});

test("read-only staff can inspect evidence without retry or cancellation controls",async({page,context,baseURL})=>{
  await context.clearCookies();await context.addCookies([{name:"skoolee_token",value:fixture.cookies.TEACHER.replace(/^skoolee_token=/,""),url:baseURL!}]);
  await page.goto(`/jobs?id=${fixture.jobs.recovery}&itemState=failed`);await expect(page.getByText(jobMessages.en.readOnly)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button",{name:jobMessages.en.cancel,exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:new RegExp(jobMessages.en.retry)})).toHaveCount(0);
});

test("loading, filtered empty and offline recovery retain scope without invented counts",async({page})=>{
  let release!:()=>void;const paused=new Promise<void>(resolve=>{release=resolve});
  await page.route("**/api/jobs",async route=>{await paused;await route.continue();});
  await page.goto("/jobs?kind=PDF&state=all");
  await expect(page.getByText(jobMessages.en.loading,{exact:true})).toBeVisible();
  await expect(page.getByText(jobMessages.en.empty,{exact:true})).toHaveCount(0);
  release();await expect(page.locator("button").filter({hasText:fixture.jobs.pdf})).toBeVisible();
  await page.getByLabel(jobMessages.en.search,{exact:true}).fill("no-such-synthetic-source");
  await expect(page.getByText(jobMessages.en.filteredEmpty)).toBeVisible();
  await page.getByRole("button",{name:jobMessages.en.clearFilters,exact:true}).click();
  await expect(page.locator("button").filter({hasText:fixture.jobs.pdf})).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new Event("offline")));
  await expect(page.locator("main").getByRole("alert")).toContainText(jobMessages.en.unknown);
  await expect(page.locator("button").filter({hasText:fixture.jobs.pdf})).toBeVisible();
  await page.screenshot({path:resolve(evidence,"offline-retained-en.png"),fullPage:false});
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("another browser context reopens the persisted job and source Back restores filters",async({page,browser,baseURL})=>{
  const url=`/jobs?id=${fixture.jobs.recovery}&itemState=failed&kind=REPORT_DELIVERY&state=attention`;
  await page.goto(url);await expect(page.locator("article")).toHaveCount(3);
  const other=await browser.newContext({baseURL});
  try{await other.addCookies([{name:"skoolee_token",value:fixture.cookies.PRINCIPAL.replace(/^skoolee_token=/,""),url:baseURL!}]);const second=await other.newPage();await second.goto(url);await expect(second.locator("article")).toHaveCount(3);await expect(second.getByText(fixture.jobs.recovery,{exact:true})).toBeVisible();}finally{await other.close();}
  await page.getByRole("link",{name:jobMessages.en.source,exact:true}).click();
  await expect(page).toHaveURL(/view=report-cards/);await page.goBack();
  await expect(page.getByLabel(jobMessages.en.stateFilter)).toHaveValue("failed");
  await page.getByRole("button",{name:jobMessages.en.back,exact:true}).click();
  await expect(page.getByLabel(jobMessages.en.kindFilter)).toHaveValue("REPORT_DELIVERY");
  await expect(page.getByLabel(jobMessages.en.stateFilter)).toHaveValue("attention");
});

test("an old queued response cannot overwrite a newer persisted completion",async({page})=>{
  const detail=await(await page.request.get(`/api/jobs/${fixture.jobs.queued}`)).json();const item=detail.items[0];
  let release!:()=>void,entered!:()=>void;const paused=new Promise<void>(resolve=>{release=resolve});const requested=new Promise<void>(resolve=>{entered=resolve});let first=true;
  await page.route(`**/api/jobs/${fixture.jobs.queued}`,async route=>{if(first){first=false;const response=await route.fetch();entered();await paused;await route.fulfill({response}).catch(()=>{});}else await route.continue();});
  await page.goto(`/jobs?id=${fixture.jobs.queued}`);await requested;
  await db.parentCommunication.update({where:{id:item.communication_id},data:{status:"SENT",sentAt:new Date(),providerMessageId:`synthetic-browser-${item.communication_id}`}});
  await db.workflowJob.update({where:{id:item.workflow_id},data:{state:"completed",attempts:1,finishedAt:new Date()}});
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await expect(page.locator("article").first().getByText(jobMessages.en.completed,{exact:true})).toBeVisible();
  release();await expect(page.locator("article").first().getByText(jobMessages.en.completed,{exact:true})).toBeVisible();
  await expect(page.locator("article").first().getByText(jobMessages.en.queued,{exact:true})).toHaveCount(0);
});

test("needs attention includes completed messages with provider failure evidence",async({page})=>{
  const detail=await(await page.request.get(`/api/jobs/${fixture.jobs.recovery}`)).json();
  const item=detail.items.find((row:{state:string})=>row.state==="completed");
  const communication=await db.parentCommunication.findUniqueOrThrow({where:{id:item.communication_id}});
  const receipt=await db.deliveryReceipt.create({data:{id:randomUUID(),schoolId:fixture.schoolId,communicationId:item.communication_id,providerMessageId:communication.providerMessageId!,state:"failed",occurredAt:new Date()}});
  try{
    await page.goto(`/jobs?id=${fixture.jobs.recovery}&itemState=attention`);
    await expect(page.locator("article")).toHaveCount(4);
    const row=page.locator("article").filter({hasText:item.label});await expect(row.getByText(jobMessages.en.deliveryFailed,{exact:false})).toBeVisible();
    await expect(row.getByRole("checkbox")).toHaveCount(0);await row.getByRole("button",{name:jobMessages.en.reviewOutcome}).click();
    await expect(page.getByRole("dialog").getByText(jobMessages.en.accepted,{exact:true})).toBeVisible();
    await page.screenshot({path:resolve(evidence,"provider-failure-evidence-en.png"),fullPage:false});
  }finally{await db.deliveryReceipt.delete({where:{id:receipt.id}});}
});

test("loss of edit permission disables an open cancellation while keeping allowed read evidence",async({page})=>{
  await page.goto(`/jobs?id=${fixture.jobs.recovery}`);
  await page.getByRole("button",{name:jobMessages.en.cancel,exact:true}).click();
  const dialog=page.getByRole("dialog",{name:jobMessages.en.reviewCancel});
  await dialog.getByLabel(jobMessages.en.reason).selectOption("NO_LONGER_REQUIRED");
  const grant=await db.rolePermission.create({data:{schoolId:fixture.schoolId,role:"PRINCIPAL",module:"reports",canView:true,canEdit:false}});
  try{
    await page.evaluate(()=>window.dispatchEvent(new Event("online")));
    await expect(dialog.getByRole("alert")).toContainText(jobMessages.en.readOnly);
    await expect(dialog.getByRole("button",{name:jobMessages.en.confirmCancel})).toBeDisabled();
    await expect(page.locator("article").first()).toBeVisible();
    await expect(dialog.getByLabel(jobMessages.en.reason)).toHaveValue("NO_LONGER_REQUIRED");
  }finally{await db.rolePermission.delete({where:{id:grant.id}});}
});

for(const cohort of [
  {name:"international",country:"OTHER",currency:"USD",language:"en",timezone:"Europe/London",numberingSystem:"latn"},
  {name:"Pakistan",country:"PK",currency:"PKR",language:"ur",timezone:"Asia/Karachi",numberingSystem:"latn"},
  {name:"Saudi",country:"SA",currency:"SAR",language:"ar",timezone:"Asia/Riyadh",numberingSystem:"arab"},
  {name:"UAE",country:"AE",currency:"AED",language:"en",timezone:"Asia/Dubai",numberingSystem:"latn"},
] as const) test(`job evidence follows independent ${cohort.name} locale settings`,async({page})=>{
  await db.user.update({where:{id:fixture.users.PRINCIPAL},data:{preferredLanguage:cohort.language}});
  const policy=await db.localePolicy.create({data:{schoolId:fixture.schoolId,scopeKey:"school",settings:{country:cohort.country,currency:cohort.currency,language:cohort.language,timezone:cohort.timezone,numberingSystem:cohort.numberingSystem},effectiveAt:new Date("2026-01-01T00:00:00Z"),createdBy:fixture.users.PRINCIPAL,status:"ACTIVE"}});
  try{
    const detail=await(await page.request.get(`/api/jobs/${fixture.jobs.recovery}`)).json();
    const item=detail.items.find((row:{state:string})=>row.state==="completed");
    await page.goto(`/jobs?id=${fixture.jobs.recovery}&itemQ=${encodeURIComponent(item.label)}`);
    await expect(page.locator("main")).toHaveAttribute("lang",cohort.language);
    const expected=new Intl.DateTimeFormat(cohort.language,{dateStyle:"medium",timeStyle:"short",timeZone:cohort.timezone,calendar:"gregory",numberingSystem:cohort.numberingSystem}).format(new Date(item.accepted_at));
    await expect(page.locator("article").getByText(expected,{exact:true})).toBeVisible();
    const fresh=await(await page.request.get(`/api/jobs/${fixture.jobs.recovery}`)).json();
    expect(fresh.counts).toEqual(detail.counts);expect(fresh.items.find((row:{id:string})=>row.id===item.id).version_id).toBe(item.version_id);
  }finally{await db.localePolicy.delete({where:{id:policy.id}});}
});

test("Started date uses the displayed school calendar day across a UTC boundary",async({page})=>{
  const rows=await db.$queryRaw<Array<{created_at:Date}>>`SELECT created_at FROM activity_jobs WHERE id=${fixture.jobs.pdf}`;
  await db.$executeRaw`UPDATE activity_jobs SET created_at=${new Date("2026-10-15T20:00:00Z")} WHERE id=${fixture.jobs.pdf}`;
  const policy=await db.localePolicy.create({data:{schoolId:fixture.schoolId,scopeKey:"school",settings:{timezone:"Asia/Karachi"},effectiveAt:new Date("2026-01-01T00:00:00Z"),createdBy:fixture.users.PRINCIPAL,status:"ACTIVE"}});
  try{
    await page.goto("/jobs?kind=PDF&state=all&started=2026-10-16");
    const card=page.locator("button").filter({hasText:fixture.jobs.pdf});await expect(card).toBeVisible();
    await page.getByLabel(jobMessages.en.started).fill("2026-10-17");await expect(card).toHaveCount(0);
    await expect(page.getByText(jobMessages.en.filteredEmpty)).toBeVisible();
  }finally{await db.$executeRaw`UPDATE activity_jobs SET created_at=${rows[0].created_at} WHERE id=${fixture.jobs.pdf}`;await db.localePolicy.delete({where:{id:policy.id}});}
});

test("actual retry confirmation preserves successes and reports only a scheduled outcome",async({page})=>{
  await page.goto(`/jobs?id=${fixture.jobs.recovery}&itemState=failed`);await page.getByRole("checkbox").first().check();
  await page.getByRole("button",{name:new RegExp(jobMessages.en.retry)}).click();const dialog=page.getByRole("dialog");
  await dialog.getByLabel(jobMessages.en.reason).selectOption("CONFIGURATION_CORRECTED");
  await dialog.getByRole("button",{name:jobMessages.en.confirmRetry}).click();
  await expect(dialog.getByText(jobMessages.en.retrySaved)).toBeVisible();
  await page.screenshot({path:resolve(evidence,"retry-acknowledged-en.png"),fullPage:false});
  await dialog.getByRole("button",{name:jobMessages.en.done,exact:true}).click();
  await expect(page.getByRole("button",{name:jobMessages.en.refresh,exact:true})).toBeFocused();
  const response=await page.request.get(`/api/jobs/${fixture.jobs.recovery}`);expect(response.status()).toBe(200);const detail=await response.json();
  expect(detail.counts.completed).toBe(97);expect(detail.counts.total).toBe(100);expect(detail.counts.queued).toBeGreaterThan(0);
});

test("actual cancellation requires a reason, preserves completed work and retains its receipt",async({page})=>{
  await page.goto(`/jobs?id=${fixture.jobs.recovery}`);await page.getByRole("button",{name:jobMessages.en.cancel,exact:true}).click();
  const dialog=page.getByRole("dialog",{name:jobMessages.en.reviewCancel});await expect(dialog.getByText(jobMessages.en.cancelNote)).toBeVisible();
  await expect(dialog.getByRole("button",{name:jobMessages.en.confirmCancel})).toBeDisabled();
  await dialog.getByLabel(jobMessages.en.reason).selectOption("NO_LONGER_REQUIRED");
  await dialog.getByRole("button",{name:jobMessages.en.confirmCancel}).click();await expect(dialog.getByText(jobMessages.en.cancelSaved)).toBeVisible();
  const response=await page.request.get(`/api/jobs/${fixture.jobs.recovery}`);const detail=await response.json();
  expect(detail.counts.completed).toBe(97);expect(detail.cancel_requested_at).toBeTruthy();expect(detail.counts.total).toBe(100);
  await page.screenshot({path:resolve(evidence,"cancel-acknowledged-en.png"),fullPage:false});
});
