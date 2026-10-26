import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// Synthetic local acceptance for SCRUM-308. Never run against a shared/production database.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.STATES_TEST_APP || "http://localhost:3109";
const evidence = process.env.STATES_EVIDENCE_DIR || "/tmp/scrum308/evidence";
const db = new PrismaClient(), password = "SyntheticStates308!";
const schoolId = `states308-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
const class7 = randomUUID(), classB = randomUUID(), campusC = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, campus: string | null = campusA, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, joiningDate: new Date("2026-01-01T00:00:00Z"), preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) { const ctx = await browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" }); ctx.setDefaultNavigationTimeout(120000); return ctx; }
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  ctx.setDefaultNavigationTimeout(120000); return ctx;
}

const otherSchool = `states308-${randomUUID()}`;
before(async()=>{
  await mkdir(evidence,{recursive:true});
  for(const id of [schoolId,otherSchool]) await db.school.create({data:{id,name:"Synthetic States School",slug:id,regId:id,contactEmail:`${id}@example.invalid`,city:"Lahore",status:"ACTIVE",plan:"PRO"}});
  for(const [id,school,name] of [[campusA,schoolId,"North"],[campusB,otherSchool,"South"]]) await db.campus.create({data:{id,schoolId:school,name,regId:id,city:"Lahore"}});
  await db.campus.create({data:{id:campusC,schoolId,name:"Other campus",regId:campusC,city:"Lahore"}});
  await db.academicCycle.create({data:{schoolId,campusId:campusA,label:"2026",academicYear:2026,status:"ACTIVE"}});
  await user("librarian","LIBRARIAN"); await user("ops","CAMPUS_ADMIN"); await user("parent","PARENT"); await user("ops-ur","CAMPUS_ADMIN",campusA,"ur"); const teacher=await user("teacher","TEACHER");
  await db.class.create({data:{id:class7,schoolId,campusId:campusA,name:"Grade 7",section:"A",academicYear:2026,classTeacherId:teacher}});
  await db.class.create({data:{id:classB,schoolId:otherSchool,campusId:campusB,name:"Grade 7",section:"B",academicYear:2026}});
  for(const [id,school,campus,cls,name] of [[randomUUID(),schoolId,campusA,class7,"Synthetic Ada"],[randomUUID(),otherSchool,campusB,classB,"Synthetic Private"]]) {
    pupils[name]=id; await db.student.create({data:{id,schoolId:school,campusId:campus,classId:cls,fullName:name,rollNo:"307",gender:"FEMALE",enrollmentDate:new Date("2024-02-29T00:00:00Z")}});
  }
  await db.admissionQuery.create({data:{schoolId,campusId:campusA,name:"Synthetic Enquiry",phone:"03000000307",source:"WALK_IN",nextFollowUp:new Date("2026-11-01T00:00:00Z")}});
  browser=await (process.env.STATES_BROWSER === "webkit" ? webkit : chromium).launch({headless:true});
});
after(async()=>{await browser?.close(); await db.$disconnect();});
const saveShot=async(page:Page,name:string)=>{await page.locator("[data-boot-splash]").waitFor({state:"hidden"}); await page.screenshot({path:`${evidence}/${name}.png`,fullPage:true});};

test("search keeps query while showing exclusive server, timeout, denial and recovered success states",async()=>{
  const ctx=await context("ops"), page=await ctx.newPage();
  let status=503;
  await page.route("**/api/search?**",async route=>{
    if(new URL(route.request().url()).searchParams.has("options")) return route.continue();
    if(status===200) return route.continue();
    await route.fulfill({status,body:"<html>private diagnostic</html>",contentType:"text/html"});
  });
  await page.goto(`${base}/search?q=Synthetic`);
  await page.locator('[data-failure-kind="provider"]').waitFor();
  assert.equal(await page.getByRole("searchbox").inputValue(),"Synthetic");
  assert.equal(await page.locator("[data-search-empty], [data-search-result]").count(),0);
  assert.equal(await page.getByText("private diagnostic").count(),0);
  await saveShot(page,"search-provider-en");
  status=504; await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.locator('[data-failure-kind="timeout"]').waitFor();
  status=200; await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.locator("[data-search-result]").first().waitFor();
  await saveShot(page,"search-success-en");
  status=403; await page.getByRole("searchbox").fill("Synthetic denied");
  await page.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await page.locator("[data-search-result], [data-search-empty]").count(),0);
  assert.equal(await page.getByRole("searchbox").inputValue(),"Synthetic denied");
  await saveShot(page,"search-denied-en");
  await ctx.close();
});
test("search has a no-match result and preserves Urdu mobile query after refresh",async()=>{
  const ctx=await context("ops-ur",{width:390,height:844}),page=await ctx.newPage();
  await page.goto(`${base}/search?q=NothingMatches308`);
  await page.locator("[data-search-empty]").waitFor();
  await page.reload(); await page.locator("[data-search-empty]").waitFor();
  assert.equal(await page.getByRole("searchbox").inputValue(),"NothingMatches308");
  assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await saveShot(page,"search-no-match-ur-mobile"); await ctx.close();
});
test("library permission denial never renders an empty catalogue and keeps the open draft",async()=>{
  const ctx=await context("librarian"),page=await ctx.newPage();
  await page.goto(`${base}/librarian?view=catalogue&section=books`);
  await page.getByRole("button",{name:/Add book|Add title/i}).first().click();
  const title=page.getByLabel("Title",{exact:true}); await title.fill("Unsaved draft 308");
  await page.route("**/api/library/books?**",route=>route.fulfill({status:403,json:{success:false,error:"denied"}}));
  await page.getByPlaceholder(/Search/i).first().fill("denied");
  await page.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await title.inputValue(),"Unsaved draft 308");
  await saveShot(page,"library-denied-draft-en"); await ctx.close();
});
test("direct APIs deny families and cross-tenant/campus scope without leaking records",async()=>{
  const ops=await context("ops"),parent=await context("parent"),librarian=await context("librarian");
  assert.equal((await parent.request.get(`${base}/api/search?q=Synthetic`)).status(),403);
  for(const path of ["/api/library/books","/api/inventory/items"]){
    for(const campusId of [campusB,campusC]) assert.ok([403,404].includes((await librarian.request.get(`${base}${path}?campusId=${campusId}`)).status()));
  }
  const response=await ops.request.get(`${base}/api/search?q=Synthetic`);assert.equal(response.status(),200);assert.ok(!(await response.text()).includes("Synthetic Private"));
});

test("library validates locally, suppresses duplicate submissions and preserves a rejected draft",async()=>{
  const ctx=await context("librarian"),page=await ctx.newPage();
  let posts=0;
  await page.route("**/api/library/books",async route=>{
    if(route.request().method()!=="POST") return route.continue();
    posts++; await new Promise(resolve=>setTimeout(resolve,250));
    await route.fulfill({status:409,json:{success:false,error:"This record has changed"}});
  });
  await page.goto(`${base}/librarian?view=catalogue&section=books`);
  await page.getByRole("button",{name:"Add book",exact:true}).click();
  await page.getByRole("button",{name:"Save",exact:true}).click();
  assert.equal(posts,0,"invalid title does not submit");
  await page.getByLabel("Title",{exact:true}).fill("Draft after conflict");
  await page.getByRole("button",{name:"Save",exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
  await page.getByText("This record has changed",{exact:true}).waitFor();
  assert.equal(posts,1,"same-tick duplicate blocked before React renders");
  assert.equal(await page.getByLabel("Title",{exact:true}).inputValue(),"Draft after conflict");
  await saveShot(page,"library-validation-conflict-en"); await ctx.close();
});

test("offline search retains input and keyboard retry recovers in place",async()=>{
  const ctx=await context("ops"),page=await ctx.newPage();
  await page.goto(`${base}/search?q=Synthetic`); await page.locator("[data-search-result]").first().waitFor();
  await ctx.setOffline(true); await page.getByRole("searchbox").fill("Offline308");
  await page.locator('[data-failure-kind="offline"]').waitFor();
  assert.equal(await page.locator('[data-search-result], [data-search-empty]').count(),0);
  assert.equal(await page.getByRole("searchbox").inputValue(),"Offline308");
  await saveShot(page,"search-offline-en"); await ctx.setOffline(false);
  const retry=page.getByRole("button",{name:"Try again",exact:true}); await retry.focus(); await retry.press("Enter");
  await page.locator('[data-search-empty]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get("q"),"Offline308"); await ctx.close();
});
test("library shows loading then no-data and a distinct no-match with useful next steps",async()=>{
  const ctx=await context("librarian"),page=await ctx.newPage();
  let release:()=>void=()=>{}; const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/library/books",async route=>{await pending;await route.continue();});
  await page.goto(`${base}/librarian?view=catalogue&section=books`,{waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"Add book",exact:true}).waitFor();
  await page.locator('[aria-busy="true"]').first().waitFor();
  await saveShot(page,"library-loading-en"); release();
  await page.locator('[data-resource-state="no-data"]').waitFor();
  await saveShot(page,"library-no-data-en");
  await page.getByPlaceholder(/Search/i).first().fill("NoMatch308");
  await page.locator('[data-resource-state="no-match"]').waitFor();
  await saveShot(page,"library-no-match-en");await ctx.close();
});

test("staff leave and academic room loaders distinguish denied responses from empty results",async()=>{
  const teacher=await context("teacher"),leave=await teacher.newPage();
  await leave.route("**/api/leave?mode=my",route=>route.fulfill({status:403,json:{error:"denied"}}));
  await leave.goto(`${base}/teacher/leave`); await leave.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await leave.getByRole("button",{name:"Apply for leave",exact:true}).isEnabled(),false);
  await saveShot(leave,"teacher-leave-denied-en"); await teacher.close();
  const ops=await context("ops"),rooms=await ops.newPage();
  await rooms.route("**/api/academic/rooms**",route=>route.fulfill({status:403,json:{error:"denied"}}));
  await rooms.goto(`${base}/admin?view=settings&tab=rooms`); await rooms.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await rooms.getByText("No rooms yet",{exact:true}).count(),0);
  await saveShot(rooms,"academic-rooms-denied-en");await ops.close();
});
